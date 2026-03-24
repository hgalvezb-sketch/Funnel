# Seguimiento de Incidencias y Fallas a los Controles - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la pestana 7 "Seguimiento de Incidencias y Fallas a los Controles" al Monitor de Disposiciones, con diagrama de flujo SVG interactivo, Kanban de eventos y gestion CRUD completa.

**Architecture:** Backend en Google Apps Script (codigo.gs) con funciones de auto-deteccion de eventos, CRUD sobre hoja `_seguimiento_eventos`, y pre-computo integrado al trigger existente. Frontend (Dashboard.html) con 4 zonas: KPIs, SVG swimlanes, Kanban 7 columnas, y tabla paginada. Todo server-side via `google.script.run`.

**Tech Stack:** Google Apps Script, HTML/CSS/JS inline, SVG puro, Google Sheets como BD

**Spec:** `docs/superpowers/specs/2026-03-21-seguimiento-incidencias-controles-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `gas-optimizado/codigo.gs` | Backend: constantes, hoja seguimiento, auto-deteccion, CRUD, pre-computo |
| Modify | `gas-optimizado/Dashboard.html` | Frontend: Tab 7 con 4 zonas, CSS, interacciones |

---

### Task 1: Constantes y ensureSeguimientoSheet_()

**Files:**
- Modify: `gas-optimizado/codigo.gs:12-25` (CONFIG) y agregar funciones despues de linea ~47

- [ ] **Step 1: Agregar constantes y CONFIG**

En `codigo.gs`, despues de la linea de `INCIDENCIA_HEADERS` (linea 46), agregar:

```javascript
var SEGUIMIENTO_HEADERS = [
  'ID','Fecha_Deteccion','Tipo','Categoria','Sucursal','Contrato','Folio',
  'Monto','Etapa','Confirmado','Tipo_Hallazgo','Asignado_A','Suma_Alertas',
  'Prioridad','Notas','Fecha_Actualizacion','Registrado_Por','Columna_Origen','Evento_DG'
];

var CONTROL_COLUMNS = ['CQ','CU','CV','DC','CX','CY'];

var ETAPA_TRANSICIONES = {
  'DETECTADO': ['EN_ANALISIS'],
  'EN_ANALISIS': ['CONFIRMADO', 'CERRADO'],
  'CONFIRMADO': ['ASIGNADO'],
  'ASIGNADO': ['EN_INVESTIGACION'],
  'EN_INVESTIGACION': ['DICTAMINADO'],
  'DICTAMINADO': ['CERRADO'],
  'CERRADO': ['DETECTADO']
};
```

En el objeto `CONFIG` (linea 12-25), agregar:
```javascript
SEGUIMIENTO_SHEET: '_seguimiento_eventos',
```

- [ ] **Step 2: Crear funcion ensureSeguimientoSheet_()**

Agregar despues de las constantes:

```javascript
function ensureSeguimientoSheet_(ss) {
  var sheet = ss.getSheetByName(CONFIG.SEGUIMIENTO_SHEET);
  if (sheet) return sheet;
  sheet = ss.insertSheet(CONFIG.SEGUIMIENTO_SHEET);
  sheet.getRange(1, 1, 1, SEGUIMIENTO_HEADERS.length).setValues([SEGUIMIENTO_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SEGUIMIENTO_HEADERS.length)
    .setBackground('#1a2332').setFontColor('#ffffff').setFontWeight('bold');
  return sheet;
}
```

- [ ] **Step 3: Verificar con clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`
Expected: Sin errores de sintaxis

- [ ] **Step 4: Commit**

```bash
git add gas-optimizado/codigo.gs
git commit -m "[POC] feat: constantes seguimiento + ensureSeguimientoSheet_"
```

---

### Task 2: autoDetectNewEvents_()

**Files:**
- Modify: `gas-optimizado/codigo.gs` (agregar funcion nueva)

- [ ] **Step 1: Escribir autoDetectNewEvents_()**

Agregar la funcion:

```javascript
function autoDetectNewEvents_(allData, COL, flagColNames, flagStartIdx, ss) {
  var segSheet = ensureSeguimientoSheet_(ss);
  var lastRow = segSheet.getLastRow();
  var existingKeys = {};

  if (lastRow > 1) {
    var existing = segSheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    for (var i = 0; i < existing.length; i++) {
      // llave: contrato|folio|columna_origen
      var key = String(existing[i][5]) + '|' + String(existing[i][6]) + '|' + String(existing[i][17]);
      existingKeys[key] = true;
    }
  }

  // Contar flags por contrato para Suma_Alertas
  var alertasPorContrato = {};
  for (var r = 0; r < allData.length; r++) {
    var contrato = String(allData[r][COL['contrato']] || '');
    if (!contrato) continue;
    var count = 0;
    for (var f = 0; f < flagColNames.length; f++) {
      var fv = String(allData[r][flagStartIdx + f] || '').trim().toUpperCase();
      if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') count++;
    }
    if (count > 0) alertasPorContrato[contrato] = count;
  }

  var newEvents = [];
  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
  var seqNum = lastRow; // secuencia continua

  for (var r = 0; r < allData.length; r++) {
    if (newEvents.length >= 100) break; // limite por ejecucion

    var row = allData[r];
    var contrato = String(row[COL['contrato']] || '');
    var folio = String(row[COL['folio']] || '');
    var sucursal = String(row[COL['sucursal2']] || '');
    var monto = Number(row[COL['total_disposicion']] || 0);
    var dgCol = COL['Evento'] !== undefined ? COL['Evento'] : (COL['DG'] !== undefined ? COL['DG'] : -1);
    var eventoDG = dgCol >= 0 ? String(row[dgCol] || '') : '';
    // Intentar columna DG por indice si no hay header
    if (!eventoDG) {
      var dgIdx = flagStartIdx + flagColNames.length; // DG esta justo despues de DD
      if (dgIdx < row.length) eventoDG = String(row[dgIdx] || '');
    }

    for (var f = 0; f < flagColNames.length; f++) {
      if (newEvents.length >= 100) break;
      var flagVal = String(row[flagStartIdx + f] || '').trim().toUpperCase();
      if (flagVal !== 'SI' && flagVal !== 'YES' && flagVal !== 'TRUE' && flagVal !== '1') continue;

      var flagName = flagColNames[f];
      // Determinar columna letra del flag
      var colLetra = getColumnLetter_(flagStartIdx + f);
      var key = contrato + '|' + folio + '|' + colLetra;
      if (existingKeys[key]) continue;

      var tipo = CONTROL_COLUMNS.indexOf(colLetra) !== -1 ? 'CONTROL' : 'WARNING';
      var sumaAlertas = alertasPorContrato[contrato] || 1;

      // Prioridad
      var prioridad = 'BAJA';
      if (sumaAlertas >= 5 || colLetra === 'CX' || colLetra === 'CY') prioridad = 'CRITICA';
      else if (sumaAlertas >= 3) prioridad = 'ALTA';
      else if (sumaAlertas >= 2) prioridad = 'MEDIA';

      seqNum++;
      var id = 'EVT-' + dateStr + '-' + ('0000' + seqNum).slice(-4);

      newEvents.push([
        id, now, tipo, flagName, sucursal, contrato, folio,
        monto, 'DETECTADO', 'PENDIENTE', '', '', sumaAlertas,
        prioridad, '', now, 'SISTEMA', colLetra, eventoDG
      ]);
      existingKeys[key] = true;
    }
  }

  if (newEvents.length > 0) {
    segSheet.getRange(lastRow + 1, 1, newEvents.length, SEGUIMIENTO_HEADERS.length)
      .setValues(newEvents);
  }

  return newEvents.length;
}

function getColumnLetter_(colIndex) {
  var letter = '';
  var temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}
```

- [ ] **Step 2: Verificar con clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 3: Commit**

```bash
git add gas-optimizado/codigo.gs
git commit -m "[POC] feat: autoDetectNewEvents_ para deteccion automatica de eventos"
```

---

### Task 3: computeSeguimientoData_()

**Files:**
- Modify: `gas-optimizado/codigo.gs` (agregar funcion nueva)

- [ ] **Step 1: Escribir computeSeguimientoData_()**

```javascript
function computeSeguimientoData_(allData, COL, flagColNames, flagStartIdx, ss) {
  var segSheet = ensureSeguimientoSheet_(ss);
  var lastRow = segSheet.getLastRow();
  var now = new Date();

  // Contadores base
  var totalDisp = allData.length;
  var flagCountByName = {};
  var controlCount = 0, warningCount = 0;

  for (var f = 0; f < flagColNames.length; f++) {
    flagCountByName[flagColNames[f]] = { count: 0, colLetra: getColumnLetter_(flagStartIdx + f) };
  }

  // Contar flags activas en datos (misma logica que precomputeAll: SI/YES/TRUE/1)
  var dispConFlag = {};
  for (var r = 0; r < allData.length; r++) {
    var hasFlag = false;
    for (var f = 0; f < flagColNames.length; f++) {
      var fv = String(allData[r][flagStartIdx + f] || '').trim().toUpperCase();
      if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') {
        flagCountByName[flagColNames[f]].count++;
        hasFlag = true;
      }
    }
    if (hasFlag) {
      var ctr = String(allData[r][COL['contrato']] || '');
      dispConFlag[ctr] = true;
    }
  }

  // Clasificar flags como CONTROL o WARNING
  var controles = [];
  var warnings = [];
  for (var fname in flagCountByName) {
    var info = flagCountByName[fname];
    var tipo = CONTROL_COLUMNS.indexOf(info.colLetra) !== -1 ? 'CONTROL' : 'WARNING';
    var obj = {
      nombre: fname,
      columna: info.colLetra,
      tipo: tipo,
      eventos: info.count,
      pctUniverso: totalDisp > 0 ? Math.round(info.count / totalDisp * 10000) / 100 : 0
    };
    if (tipo === 'CONTROL') { controles.push(obj); controlCount += info.count; }
    else { warnings.push(obj); warningCount += info.count; }
  }

  // Datos de la hoja de seguimiento (etapas, etc.)
  var etapas = { DETECTADO:0, EN_ANALISIS:0, CONFIRMADO:0, ASIGNADO:0, EN_INVESTIGACION:0, DICTAMINADO:0, CERRADO:0 };
  var eventosActivos = 0, eventosCerrados = 0;
  var eventosPorFlag = {};
  var eventosPorSuc = {};
  var eventosVencidos = [];

  if (lastRow > 1) {
    var eventos = segSheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    for (var i = 0; i < eventos.length; i++) {
      var etapa = String(eventos[i][8] || 'DETECTADO');
      if (etapas[etapa] !== undefined) etapas[etapa]++;

      if (etapa === 'CERRADO') eventosCerrados++;
      else eventosActivos++;

      var cat = String(eventos[i][3] || '');
      if (!eventosPorFlag[cat]) eventosPorFlag[cat] = 0;
      eventosPorFlag[cat]++;

      var suc = String(eventos[i][4] || '');
      if (!eventosPorSuc[suc]) eventosPorSuc[suc] = 0;
      eventosPorSuc[suc]++;

      // Eventos vencidos: >48h sin avance y no cerrados
      if (etapa !== 'CERRADO') {
        var fechaAct = eventos[i][15];
        if (fechaAct) {
          var diff = (now - new Date(fechaAct)) / (1000 * 60 * 60);
          if (diff > 48) {
            eventosVencidos.push({
              id: String(eventos[i][0]),
              etapa: etapa,
              categoria: cat,
              sucursal: suc,
              horas: Math.round(diff)
            });
          }
        }
      }
    }
  }

  // Enriquecer controles/warnings con datos de seguimiento
  for (var c = 0; c < controles.length; c++) {
    controles[c].enSeguimiento = eventosPorFlag[controles[c].nombre] || 0;
  }
  for (var w = 0; w < warnings.length; w++) {
    warnings[w].enSeguimiento = eventosPorFlag[warnings[w].nombre] || 0;
  }

  // Datos para nodos del diagrama SVG
  var diagramaNodos = {};
  for (var et in etapas) {
    diagramaNodos[et] = { count: etapas[et] };
  }
  diagramaNodos.totalControles = controlCount;
  diagramaNodos.totalWarnings = warningCount;

  // Limpias
  var limpias = totalDisp - Object.keys(dispConFlag).length;

  return {
    kpis: {
      universo: totalDisp,
      controlesActivados: controlCount,
      warningsActivados: warningCount,
      limpias: limpias,
      pctControles: totalDisp > 0 ? Math.round(controlCount / totalDisp * 10000) / 100 : 0,
      pctWarnings: totalDisp > 0 ? Math.round(warningCount / totalDisp * 10000) / 100 : 0,
      pctLimpias: totalDisp > 0 ? Math.round(limpias / totalDisp * 10000) / 100 : 0,
      eventosActivos: eventosActivos,
      eventosCerrados: eventosCerrados
    },
    controles: controles,
    warnings: warnings,
    etapas: etapas,
    diagrama: diagramaNodos,
    eventosVencidos: eventosVencidos.slice(0, 20),
    topSucursales: Object.keys(eventosPorSuc)
      .map(function(s) { return { sucursal: s, count: eventosPorSuc[s] }; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 10)
  };
}
```

- [ ] **Step 2: Agregar seguimiento a emptyResult**

En `codigo.gs`, linea ~123 (dentro de precomputeAll, en `emptyResult`), agregar `seguimiento:null` al JSON:

```javascript
  var emptyResult = JSON.stringify({
    kpis:{totalReg:0,totalMonto:0,totalInc:0,tasaInc:0,montoPromedio:0,sucursalesCount:0,montoInc:0},
    charts:{}, risks:[], filterOptions:{}, headers:[], flagNames:[],
    tablePage:{rows:[],total:0,page:0}, lastUpdate:new Date().toLocaleString('es-MX'),
    seguimiento:null
  });
```

- [ ] **Step 3: Integrar en precomputeAll()**

En `codigo.gs`, linea ~296 (dentro de precomputeAll, justo antes de `var result={`), agregar:

```javascript
  // === SEGUIMIENTO DE EVENTOS ===
  var newEventsCount = autoDetectNewEvents_(allData, COL, flagColNames, flagStartIdx, ss);
  var seguimiento = computeSeguimientoData_(allData, COL, flagColNames, flagStartIdx, ss);
```

En el objeto `result` (linea ~296), agregar `seguimiento`:

```javascript
  var result={
    kpis:...,
    charts:..., risks:..., filterOptions:..., headers:..., flagNames:...,
    tablePage:...,
    lastUpdate:...,
    executive:executive,
    predictive:predictive,
    seguimiento:seguimiento  // <-- AGREGAR
  };
```

- [ ] **Step 4: clasp push y verificar**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 5: Ejecutar precomputeAll remotamente**

Run: `cd /c/Users/Administrador/Funnel && clasp run precomputeAll`
Expected: Retorna JSON sin errores, debe incluir clave `seguimiento`

- [ ] **Step 6: Commit**

```bash
git add gas-optimizado/codigo.gs
git commit -m "[POC] feat: computeSeguimientoData_ + integracion precomputeAll"
```

---

### Task 4: Funciones CRUD del backend

**Files:**
- Modify: `gas-optimizado/codigo.gs` (agregar funciones nuevas)

- [ ] **Step 1: Escribir getSeguimientoEvents()**

```javascript
function getSeguimientoEvents(filtrosJson) {
  try {
    var filtros = JSON.parse(filtrosJson || '{}');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureSeguimientoSheet_(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ eventos: [], total: 0 });

    var data = sheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    var filtered = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (filtros.tipo && String(row[2]) !== filtros.tipo) continue;
      if (filtros.etapa && String(row[8]) !== filtros.etapa) continue;
      if (filtros.prioridad && String(row[13]) !== filtros.prioridad) continue;
      if (filtros.sucursal && String(row[4]) !== filtros.sucursal) continue;
      if (filtros.categoria && String(row[3]) !== filtros.categoria) continue;

      filtered.push({
        id: String(row[0]),
        fechaDeteccion: row[1] ? new Date(row[1]).toLocaleString('es-MX') : '',
        tipo: String(row[2]),
        categoria: String(row[3]),
        sucursal: String(row[4]),
        contrato: String(row[5]),
        folio: String(row[6]),
        monto: Number(row[7]) || 0,
        etapa: String(row[8]),
        confirmado: String(row[9]),
        tipoHallazgo: String(row[10]),
        asignadoA: String(row[11]),
        sumaAlertas: Number(row[12]) || 0,
        prioridad: String(row[13]),
        notas: String(row[14]),
        fechaActualizacion: row[15] ? new Date(row[15]).toLocaleString('es-MX') : '',
        registradoPor: String(row[16]),
        columnaOrigen: String(row[17]),
        eventoDG: String(row[18]),
        rowNum: i + 2
      });
    }

    return JSON.stringify({ eventos: filtered, total: filtered.length });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}
```

- [ ] **Step 2: Escribir updateEventoEtapa()**

```javascript
function updateEventoEtapa(eventoId, nuevaEtapa, datosJson) {
  try {
    var datos = JSON.parse(datosJson || '{}');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureSeguimientoSheet_(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ error: 'No hay eventos' });

    var data = sheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    var rowIdx = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === eventoId) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return JSON.stringify({ error: 'Evento no encontrado: ' + eventoId });

    var etapaActual = String(data[rowIdx][8]);
    var permitidas = ETAPA_TRANSICIONES[etapaActual] || [];
    if (permitidas.indexOf(nuevaEtapa) === -1) {
      return JSON.stringify({ error: 'Transicion no permitida: ' + etapaActual + ' -> ' + nuevaEtapa });
    }

    var sheetRow = rowIdx + 2;
    var now = new Date();
    var userEmail = Session.getActiveUser().getEmail();

    // Actualizar etapa (col I = 9)
    sheet.getRange(sheetRow, 9).setValue(nuevaEtapa);
    // Fecha actualizacion (col P = 16)
    sheet.getRange(sheetRow, 16).setValue(now);
    // Registrado por (col Q = 17)
    sheet.getRange(sheetRow, 17).setValue(userEmail);

    if (datos.notas) sheet.getRange(sheetRow, 15).setValue(datos.notas);
    if (datos.tipoHallazgo) sheet.getRange(sheetRow, 11).setValue(datos.tipoHallazgo);
    if (datos.asignadoA) sheet.getRange(sheetRow, 12).setValue(datos.asignadoA);

    if (nuevaEtapa === 'CONFIRMADO') sheet.getRange(sheetRow, 10).setValue('SI');
    if (nuevaEtapa === 'CERRADO' && etapaActual === 'EN_ANALISIS') {
      sheet.getRange(sheetRow, 10).setValue('NO');
      sheet.getRange(sheetRow, 11).setValue('FALSO_POSITIVO');
    }

    return JSON.stringify({ ok: true, id: eventoId, etapa: nuevaEtapa });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}
```

- [ ] **Step 3: Escribir getEventoDetalle(), asignarEvento(), dictaminarEvento()**

```javascript
function getEventoDetalle(eventoId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureSeguimientoSheet_(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ error: 'Sin eventos' });

    var data = sheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === eventoId) {
        var obj = {};
        for (var h = 0; h < SEGUIMIENTO_HEADERS.length; h++) {
          obj[SEGUIMIENTO_HEADERS[h]] = data[i][h] instanceof Date
            ? data[i][h].toLocaleString('es-MX') : data[i][h];
        }
        return JSON.stringify(obj);
      }
    }
    return JSON.stringify({ error: 'No encontrado' });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}

function asignarEvento(eventoId, emailAsignado) {
  return updateEventoEtapa(eventoId, 'ASIGNADO', JSON.stringify({ asignadoA: emailAsignado }));
}

function dictaminarEvento(eventoId, tipoHallazgo, notas) {
  return updateEventoEtapa(eventoId, 'DICTAMINADO', JSON.stringify({ tipoHallazgo: tipoHallazgo, notas: notas }));
}

function getSeguimientoKPIs() {
  try {
    var cached = getPrecomputedData();
    if (!cached) return JSON.stringify({ error: 'Cache no disponible' });
    var data = JSON.parse(cached);
    if (data.seguimiento) return JSON.stringify(data.seguimiento.kpis);
    return JSON.stringify({ error: 'Sin datos de seguimiento' });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}

function getDiagramaData() {
  try {
    var cached = getPrecomputedData();
    if (!cached) return JSON.stringify({ error: 'Cache no disponible' });
    var data = JSON.parse(cached);
    if (data.seguimiento) return JSON.stringify(data.seguimiento.diagrama);
    return JSON.stringify({ error: 'Sin datos de seguimiento' });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}
```

- [ ] **Step 4: clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 5: Commit**

```bash
git add gas-optimizado/codigo.gs
git commit -m "[POC] feat: CRUD seguimiento - getSeguimientoEvents, updateEventoEtapa, asignar, dictaminar"
```

---

### Task 5: Frontend - Tab 7 Shell + Zona 1 KPIs

**Files:**
- Modify: `gas-optimizado/Dashboard.html:642-674` (tabs array y switchTab)
- Modify: `gas-optimizado/Dashboard.html` (agregar CSS y HTML)

- [ ] **Step 1: Agregar tab "seguimiento" al sistema de tabs**

En Dashboard.html, modificar:

1. Linea 642 - Agregar a `TABS_RENDERED`:
```javascript
var TABS_RENDERED = { operativo: true, ejecutivo: false, riesgo: false, financiero: false, tendencias: false, predictivo: false, seguimiento: false };
```

2. Linea 647 - Agregar a `tabNames`:
```javascript
var tabNames = ['operativo','ejecutivo','riesgo','financiero','tendencias','predictivo','seguimiento'];
```

3. Linea ~672 - Agregar caso en switchTab:
```javascript
if (tabId === 'seguimiento') renderTabSeguimiento();
```

4. Buscar el HTML de la barra de tabs (los botones) y agregar el boton de la pestana 7:
```html
<button class="tab-btn" onclick="switchTab('seguimiento')">Seguimiento</button>
```

5. Agregar el div contenedor de la pestana:
```html
<div id="tab-seguimiento" class="tab-content" style="display:none;"></div>
```

- [ ] **Step 2: Agregar CSS para la pestana de seguimiento**

Agregar al bloque `<style>` existente:

```css
/* === SEGUIMIENTO TAB === */
.seg-kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:24px; }
.seg-kpi-card { background:#1a2332; border-radius:12px; padding:16px; text-align:center; border:1px solid #2a3a4a; }
.seg-kpi-card .kpi-value { font-size:28px; font-weight:700; color:#e0e0e0; }
.seg-kpi-card .kpi-label { font-size:11px; color:#90a4ae; margin-top:4px; }
.seg-kpi-card .kpi-pct { font-size:13px; color:#7c4dff; margin-top:2px; }
.seg-tables-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
.seg-table-box { border-radius:12px; padding:16px; }
.seg-table-box.controles { background:#1a1a0f; border:1px solid #ff9800; }
.seg-table-box.warnings { background:#1a1a0f; border:1px solid #ffc107; }
.seg-table-box h3 { margin:0 0 12px; font-size:15px; }
.seg-table-box table { width:100%; border-collapse:collapse; font-size:12px; }
.seg-table-box th { background:rgba(255,255,255,0.05); padding:8px; text-align:left; color:#90a4ae; border-bottom:1px solid #2a3a4a; }
.seg-table-box td { padding:6px 8px; border-bottom:1px solid #1a2332; color:#e0e0e0; }
.seg-table-box tr:hover { background:rgba(255,255,255,0.03); cursor:pointer; }

/* SVG Diagram */
.seg-diagram-container { background:#1a2332; border-radius:12px; padding:20px; margin-bottom:24px; border:1px solid #2a3a4a; overflow-x:auto; }
.seg-diagram-container svg text { fill:#e0e0e0; font-family:'Segoe UI',sans-serif; }
.seg-node { cursor:pointer; transition:opacity 0.2s; }
.seg-node:hover { opacity:0.85; }
@keyframes pulse-seg { 0%,100%{opacity:1} 50%{opacity:0.6} }
.seg-pulse { animation:pulse-seg 2s infinite; }

/* Kanban */
.seg-kanban { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; margin-bottom:24px; min-height:300px; }
.seg-kanban-col { background:#111827; border-radius:10px; padding:8px; min-width:150px; }
.seg-kanban-col-header { font-size:11px; font-weight:700; color:#90a4ae; text-transform:uppercase; padding:8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a3a4a; margin-bottom:8px; }
.seg-kanban-badge { background:#7c4dff; color:#fff; border-radius:10px; padding:2px 8px; font-size:10px; }
.seg-kanban-cards { max-height:400px; overflow-y:auto; }
.seg-event-card { background:#1a2332; border-radius:8px; padding:10px; margin-bottom:8px; border-left:3px solid #2a3a4a; font-size:11px; }
.seg-event-card.prioridad-CRITICA { border-left-color:#ef5350; }
.seg-event-card.prioridad-ALTA { border-left-color:#ff9800; }
.seg-event-card.prioridad-MEDIA { border-left-color:#ffc107; }
.seg-event-card.prioridad-BAJA { border-left-color:#4caf50; }
.seg-event-card .card-header { display:flex; justify-content:space-between; margin-bottom:6px; }
.seg-event-card .card-id { font-weight:700; color:#7c4dff; font-size:10px; }
.seg-badge { display:inline-block; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:600; }
.seg-badge.control { background:#ff9800; color:#000; }
.seg-badge.warning { background:#ffc107; color:#000; }
.seg-badge.tiempo-ok { background:#4caf50; color:#fff; }
.seg-badge.tiempo-warn { background:#ffc107; color:#000; }
.seg-badge.tiempo-crit { background:#ef5350; color:#fff; }
.seg-card-btn { padding:4px 10px; border:none; border-radius:4px; font-size:10px; cursor:pointer; margin-top:6px; margin-right:4px; }
.seg-card-btn.primary { background:#7c4dff; color:#fff; }
.seg-card-btn.secondary { background:#37474f; color:#e0e0e0; }
.seg-card-btn:hover { opacity:0.85; }
.seg-inline-form { background:#0d1117; border-radius:6px; padding:8px; margin-top:8px; }
.seg-inline-form textarea, .seg-inline-form input, .seg-inline-form select { width:100%; background:#1a2332; border:1px solid #2a3a4a; color:#e0e0e0; border-radius:4px; padding:6px; margin:4px 0; font-size:11px; box-sizing:border-box; }

/* Detail table */
.seg-detail-filters { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.seg-detail-filters select { background:#1a2332; border:1px solid #2a3a4a; color:#e0e0e0; border-radius:6px; padding:6px 10px; font-size:11px; }
```

- [ ] **Step 3: Agregar funcion sanitize_()**

Verificar si ya existe `sanitize_` en Dashboard.html. Si no existe, agregar:

```javascript
function sanitize_(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

- [ ] **Step 4: Escribir renderTabSeguimiento()**

Agregar la funcion JavaScript:

```javascript
function renderTabSeguimiento() {
  var seg = CURRENT_DATA.seguimiento;
  if (!seg) { document.getElementById('tab-seguimiento').innerHTML = '<p style="color:#90a4ae;padding:40px;text-align:center;">Sin datos de seguimiento. Espera al proximo ciclo de pre-computo.</p>'; return; }

  var h = '';
  // Zona 1: KPIs
  h += '<div class="seg-kpi-grid">';
  h += segKpiCard(seg.kpis.universo, 'Universo Total', '');
  h += segKpiCard(seg.kpis.controlesActivados, 'Controles Activados', seg.kpis.pctControles + '%');
  h += segKpiCard(seg.kpis.warningsActivados, 'Warnings Activados', seg.kpis.pctWarnings + '%');
  h += segKpiCard(seg.kpis.limpias, 'Disp. Limpias', seg.kpis.pctLimpias + '%');
  h += segKpiCard(seg.kpis.eventosActivos, 'En Seguimiento', '');
  h += segKpiCard(seg.kpis.eventosCerrados, 'Cerrados', '');
  h += '</div>';

  // Zona 1b: Tablas Controles vs Warnings
  h += '<div class="seg-tables-row">';
  h += renderSegTable(seg.controles, 'Controles C-535', 'controles', true);
  h += renderSegTable(seg.warnings, 'Warnings', 'warnings', false);
  h += '</div>';

  // Zona 2: Diagrama SVG (placeholder que se llena)
  h += '<div class="seg-diagram-container" id="seg-diagrama-svg"></div>';

  // Zona 3: Kanban
  h += '<div id="seg-kanban-container"></div>';

  // Zona 4: Tabla detalle
  h += '<div id="seg-detail-container" style="background:#1a2332;border-radius:12px;padding:16px;border:1px solid #2a3a4a;"></div>';

  document.getElementById('tab-seguimiento').innerHTML = h;

  // Render sub-components
  renderDiagramaSVG(seg.diagrama, seg.etapas);
  loadKanbanData();
  loadDetailTable();
}

function segKpiCard(value, label, pct) {
  return '<div class="seg-kpi-card"><div class="kpi-value">' + (typeof value==='number'?value.toLocaleString('es-MX'):value) + '</div><div class="kpi-label">' + label + '</div>' + (pct ? '<div class="kpi-pct">' + pct + '</div>' : '') + '</div>';
}

function renderSegTable(items, title, cls, showNormativo) {
  var h = '<div class="seg-table-box ' + cls + '"><h3 style="color:' + (cls==='controles'?'#ff9800':'#ffc107') + '">' + title + ' (' + items.length + ')</h3>';
  h += '<table><thead><tr><th>Nombre</th><th>Eventos</th><th>% Univ.</th><th>Seguim.</th>';
  if (showNormativo) h += '<th>Col</th>';
  h += '</tr></thead><tbody>';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    h += '<tr onclick="filterKanbanByFlag(\'' + it.nombre.replace(/'/g,"\\'") + '\')">';
    h += '<td>' + sanitize_(it.nombre) + '</td>';
    h += '<td>' + it.eventos + '</td>';
    h += '<td>' + it.pctUniverso + '%</td>';
    h += '<td>' + (it.enSeguimiento||0) + '</td>';
    if (showNormativo) h += '<td>' + it.columna + '</td>';
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}
```

- [ ] **Step 5: clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 6: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "[POC] feat: Tab 7 shell + Zona 1 KPIs y tablas controles/warnings"
```

---

### Task 6: Frontend - Zona 2 Diagrama SVG

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (agregar funcion renderDiagramaSVG)

- [ ] **Step 1: Escribir renderDiagramaSVG()**

```javascript
function renderDiagramaSVG(diagrama, etapas) {
  var w = 1200, h = 700;
  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">';

  // Defs: arrowheads
  svg += '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#546e7a"/></marker>';
  svg += '<marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ef5350"/></marker></defs>';

  // Background swimlanes
  svg += '<rect x="0" y="0" width="' + w + '" height="340" rx="8" fill="#1a1610" stroke="#ff9800" stroke-width="1" opacity="0.3"/>';
  svg += '<text x="15" y="25" font-size="13" font-weight="700" fill="#ff9800">CONTROLES C-535</text>';
  svg += '<rect x="0" y="350" width="' + w + '" height="340" rx="8" fill="#1a1a0f" stroke="#ffc107" stroke-width="1" opacity="0.3"/>';
  svg += '<text x="15" y="375" font-size="13" font-weight="700" fill="#ffc107">WARNINGS</text>';

  // Helper to pick node color by count
  // nodeColor: green<10, yellow 10-49, orange 50-99, red >=100
  function nc(count) {
    if (count >= 100) return '#ef5350';
    if (count >= 50) return '#ff9800';
    if (count >= 10) return '#ffc107';
    return '#4caf50';
  }

  var d = diagrama || {};
  var et = etapas || {};

  // --- CARRIL CONTROLES (y: 40-320) ---
  var ctrlNodes = [
    { id:'deteccion_ctrl', x:20, y:60, w:130, h:40, label:'Deteccion', count:d.totalControles||0 },
    { id:'controles_c535', x:180, y:60, w:130, h:40, label:'Controles C-535', count:d.totalControles||0 },
    { id:'analisis_causa', x:340, y:60, w:160, h:40, label:'Analisis causa', count:et.EN_ANALISIS||0 },
    { id:'reporte_coord', x:580, y:60, w:160, h:40, label:'Reporte coord. ARO', count:et.ASIGNADO||0 },
    { id:'tipo_informe', x:780, y:60, w:130, h:40, label:'Tipo de informe', count:et.DICTAMINADO||0 },
    { id:'fraude', x:780, y:130, w:130, h:35, label:'Fraude/Mala pract.', count:0 },
    { id:'incumplimiento', x:780, y:185, w:130, h:35, label:'Incumplimiento', count:0 },
    { id:'reporte_audit', x:950, y:130, w:130, h:35, label:'Rep. Auditoria', count:0 },
    { id:'sancion', x:950, y:185, w:130, h:35, label:'Sancion', count:0 },
    { id:'correo_gz', x:950, y:240, w:130, h:35, label:'Correo G.Zona', count:0 },
    { id:'reporte_final_c', x:1050, y:60, w:120, h:40, label:'Reporte Final', count:et.CERRADO||0 }
  ];

  // Decision diamonds for controles
  var ctrlDiamonds = [
    { id:'dec_confirma', x:500, y:80, label:'Confirma?', yes:{x:580,y:80}, no:{x:500,y:180} },
    { id:'dec_coord', x:730, y:80, label:'Confirma?', yes:{x:780,y:80}, no:{x:730,y:280} }
  ];

  // Draw ctrl nodes
  for (var i = 0; i < ctrlNodes.length; i++) {
    var n = ctrlNodes[i];
    var cls = (et[n.id] || n.count) > 0 ? ' seg-pulse' : '';
    svg += '<g class="seg-node' + cls + '" onclick="filterKanbanByEtapa(\'' + n.id + '\')">';
    svg += '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="6" fill="' + nc(n.count) + '" opacity="0.85"/>';
    svg += '<text x="' + (n.x+n.w/2) + '" y="' + (n.y+n.h/2-4) + '" text-anchor="middle" font-size="10" fill="#fff">' + n.label + '</text>';
    svg += '<text x="' + (n.x+n.w/2) + '" y="' + (n.y+n.h/2+10) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + n.count + '</text>';
    svg += '</g>';
  }

  // Draw ctrl diamonds
  for (var i = 0; i < ctrlDiamonds.length; i++) {
    var dm = ctrlDiamonds[i];
    svg += '<g class="seg-node"><polygon points="' + dm.x + ',' + (dm.y-20) + ' ' + (dm.x+25) + ',' + dm.y + ' ' + dm.x + ',' + (dm.y+20) + ' ' + (dm.x-25) + ',' + dm.y + '" fill="#37474f" stroke="#546e7a" stroke-width="1"/>';
    svg += '<text x="' + dm.x + '" y="' + (dm.y+4) + '" text-anchor="middle" font-size="8" fill="#e0e0e0">' + dm.label + '</text></g>';
  }

  // Ctrl arrows (simplified connections)
  var ctrlArrows = [
    [150,80, 180,80], [310,80, 340,80], [500,80, 475,80],
    [525,80, 580,80], [740,80, 780,80],
    [910,80, 950,80], [845,165, 950,147], [845,202, 950,202],
    [910,80, 1050,80]
  ];
  for (var i = 0; i < ctrlArrows.length; i++) {
    var a = ctrlArrows[i];
    svg += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + a[2] + '" y2="' + a[3] + '" stroke="#546e7a" stroke-width="1.5" marker-end="url(#arrow)"/>';
  }

  // --- CARRIL WARNINGS (y: 350-680) ---
  var warnNodes = [
    { id:'deteccion_warn', x:20, y:410, w:130, h:40, label:'Deteccion', count:d.totalWarnings||0 },
    { id:'warnings_list', x:180, y:410, w:130, h:40, label:'Warnings', count:d.totalWarnings||0 },
    { id:'analisis_suma', x:340, y:410, w:160, h:40, label:'Suma alertas/contrato', count:et.EN_ANALISIS||0 },
    { id:'priorizacion', x:540, y:410, w:130, h:40, label:'Priorizacion', count:0 },
    { id:'asignacion', x:700, y:410, w:150, h:40, label:'Asignacion coord.', count:et.ASIGNADO||0 },
    { id:'reporte_warn', x:920, y:410, w:130, h:40, label:'Reporte dictamen', count:et.DICTAMINADO||0 },
    { id:'cerrado_warn', x:1080, y:410, w:90, h:40, label:'Fin', count:et.CERRADO||0 }
  ];

  var warnDiamonds = [
    { id:'dec_warn', x:870, y:430, label:'Confirma?' }
  ];

  for (var i = 0; i < warnNodes.length; i++) {
    var n = warnNodes[i];
    svg += '<g class="seg-node" onclick="filterKanbanByEtapa(\'' + n.id + '\')">';
    svg += '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="6" fill="' + nc(n.count) + '" opacity="0.85"/>';
    svg += '<text x="' + (n.x+n.w/2) + '" y="' + (n.y+n.h/2-4) + '" text-anchor="middle" font-size="10" fill="#fff">' + n.label + '</text>';
    svg += '<text x="' + (n.x+n.w/2) + '" y="' + (n.y+n.h/2+10) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + n.count + '</text>';
    svg += '</g>';
  }

  for (var i = 0; i < warnDiamonds.length; i++) {
    var dm = warnDiamonds[i];
    svg += '<g class="seg-node"><polygon points="' + dm.x + ',' + (dm.y-20) + ' ' + (dm.x+25) + ',' + dm.y + ' ' + dm.x + ',' + (dm.y+20) + ' ' + (dm.x-25) + ',' + dm.y + '" fill="#37474f" stroke="#546e7a" stroke-width="1"/>';
    svg += '<text x="' + dm.x + '" y="' + (dm.y+4) + '" text-anchor="middle" font-size="8" fill="#e0e0e0">' + dm.label + '</text></g>';
  }

  // Warn arrows
  var warnArrows = [
    [150,430, 180,430], [310,430, 340,430], [500,430, 540,430],
    [670,430, 700,430], [850,430, 870,430], [895,430, 920,430],
    [1050,430, 1080,430]
  ];
  for (var i = 0; i < warnArrows.length; i++) {
    var a = warnArrows[i];
    svg += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + a[2] + '" y2="' + a[3] + '" stroke="#546e7a" stroke-width="1.5" marker-end="url(#arrow)"/>';
  }

  svg += '</svg>';
  document.getElementById('seg-diagrama-svg').innerHTML = '<h3 style="color:#e0e0e0;margin:0 0 12px;font-size:15px;">Diagrama de Flujo — Agente de Disposiciones</h3>' + svg;
}
```

- [ ] **Step 2: clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 3: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "[POC] feat: Zona 2 - Diagrama de flujo SVG interactivo con swimlanes"
```

---

### Task 7: Frontend - Zona 3 Kanban

**Files:**
- Modify: `gas-optimizado/Dashboard.html`

- [ ] **Step 1: Escribir funciones Kanban**

```javascript
var SEG_KANBAN_FILTER = {};

function loadKanbanData(filtro) {
  var f = filtro || SEG_KANBAN_FILTER;
  google.script.run
    .withSuccessHandler(function(json) {
      var data = JSON.parse(json);
      if (data.error) { console.error(data.error); return; }
      renderKanban(data.eventos);
    })
    .withFailureHandler(function(e) { console.error('Kanban error:', e); })
    .getSeguimientoEvents(JSON.stringify(f));
}

function renderKanban(eventos) {
  var etapas = ['DETECTADO','EN_ANALISIS','CONFIRMADO','ASIGNADO','EN_INVESTIGACION','DICTAMINADO','CERRADO'];
  var etapaLabels = { DETECTADO:'Detectado', EN_ANALISIS:'En Analisis', CONFIRMADO:'Confirmado', ASIGNADO:'Asignado', EN_INVESTIGACION:'En Investigacion', DICTAMINADO:'Dictaminado', CERRADO:'Cerrado' };
  var buckets = {};
  for (var i = 0; i < etapas.length; i++) buckets[etapas[i]] = [];

  for (var i = 0; i < eventos.length; i++) {
    var ev = eventos[i];
    if (buckets[ev.etapa]) buckets[ev.etapa].push(ev);
  }

  var h = '<div class="seg-kanban">';
  for (var i = 0; i < etapas.length; i++) {
    var et = etapas[i];
    var cards = buckets[et];
    h += '<div class="seg-kanban-col">';
    h += '<div class="seg-kanban-col-header">' + etapaLabels[et] + ' <span class="seg-kanban-badge">' + cards.length + '</span></div>';
    h += '<div class="seg-kanban-cards">';
    var limit = Math.min(cards.length, 20);
    for (var c = 0; c < limit; c++) {
      h += renderEventCard(cards[c], et);
    }
    if (cards.length > 20) h += '<div style="color:#546e7a;text-align:center;font-size:10px;padding:8px;">+' + (cards.length-20) + ' mas...</div>';
    h += '</div></div>';
  }
  h += '</div>';
  document.getElementById('seg-kanban-container').innerHTML = h;
}

function renderEventCard(ev, etapa) {
  // Tiempo en etapa
  var horasEnEtapa = 0;
  if (ev.fechaActualizacion) {
    var parts = ev.fechaActualizacion.split(/[\/\s,:]+/);
    if (parts.length >= 5) {
      try { horasEnEtapa = Math.round((new Date() - new Date(ev.fechaActualizacion)) / 3600000); } catch(e) {}
    }
  }
  var tiempoCls = horasEnEtapa > 48 ? 'tiempo-crit' : (horasEnEtapa > 24 ? 'tiempo-warn' : 'tiempo-ok');
  var tiempoTxt = horasEnEtapa > 24 ? Math.round(horasEnEtapa/24) + 'd' : horasEnEtapa + 'h';

  var h = '<div class="seg-event-card prioridad-' + ev.prioridad + '" id="card-' + ev.id + '">';
  h += '<div class="card-header"><span class="card-id">' + ev.id + '</span>';
  h += '<span class="seg-badge ' + tiempoCls + '">' + tiempoTxt + '</span></div>';
  h += '<span class="seg-badge ' + (ev.tipo==='CONTROL'?'control':'warning') + '">' + ev.tipo + '</span> ';
  h += '<span style="color:#90a4ae;font-size:10px;">' + sanitize_(ev.categoria) + '</span><br>';
  h += '<span style="color:#e0e0e0;">' + sanitize_(ev.sucursal) + '</span> | ';
  h += '<span style="color:#7c4dff;">' + sanitize_(ev.contrato) + '</span> | ';
  h += '<span style="color:#4caf50;">$' + (ev.monto||0).toLocaleString('es-MX') + '</span>';

  // Action buttons per etapa
  h += '<div id="form-' + ev.id + '">';
  if (etapa === 'DETECTADO') {
    h += '<button class="seg-card-btn primary" onclick="avanzarEvento(\'' + ev.id + '\',\'EN_ANALISIS\',{})">Analizar</button>';
  } else if (etapa === 'EN_ANALISIS') {
    h += '<button class="seg-card-btn primary" onclick="showInlineForm(\'' + ev.id + '\',\'confirmar\')">Confirmar</button>';
    h += '<button class="seg-card-btn secondary" onclick="showInlineForm(\'' + ev.id + '\',\'descartar\')">Descartar</button>';
  } else if (etapa === 'CONFIRMADO') {
    h += '<button class="seg-card-btn primary" onclick="showInlineForm(\'' + ev.id + '\',\'asignar\')">Asignar</button>';
  } else if (etapa === 'ASIGNADO') {
    h += '<button class="seg-card-btn primary" onclick="avanzarEvento(\'' + ev.id + '\',\'EN_INVESTIGACION\',{})">Investigar</button>';
  } else if (etapa === 'EN_INVESTIGACION') {
    h += '<button class="seg-card-btn primary" onclick="showInlineForm(\'' + ev.id + '\',\'dictaminar\')">Dictaminar</button>';
  } else if (etapa === 'DICTAMINADO') {
    h += '<button class="seg-card-btn primary" onclick="showInlineForm(\'' + ev.id + '\',\'cerrar\')">Cerrar</button>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

function showInlineForm(eventId, tipo) {
  var container = document.getElementById('form-' + eventId);
  var h = '<div class="seg-inline-form">';

  if (tipo === 'confirmar') {
    h += '<textarea id="notas-' + eventId + '" placeholder="Notas del analisis..." rows="2"></textarea>';
    h += '<button class="seg-card-btn primary" onclick="submitInlineForm(\'' + eventId + '\',\'CONFIRMADO\')">Confirmar</button>';
  } else if (tipo === 'descartar') {
    h += '<textarea id="notas-' + eventId + '" placeholder="Motivo de descarte (obligatorio)..." rows="2"></textarea>';
    h += '<button class="seg-card-btn secondary" onclick="submitInlineForm(\'' + eventId + '\',\'CERRADO\')">Descartar</button>';
  } else if (tipo === 'asignar') {
    h += '<input id="asignado-' + eventId + '" type="email" placeholder="Email del coordinador/ARO...">';
    h += '<button class="seg-card-btn primary" onclick="submitAsignar(\'' + eventId + '\')">Asignar</button>';
  } else if (tipo === 'dictaminar') {
    h += '<select id="hallazgo-' + eventId + '"><option value="">-- Tipo hallazgo --</option><option value="FRAUDE">Fraude</option><option value="INCUMPLIMIENTO">Incumplimiento</option><option value="MALA_PRACTICA">Mala practica</option><option value="FALSO_POSITIVO">Falso positivo</option></select>';
    h += '<textarea id="notas-' + eventId + '" placeholder="Notas del dictamen..." rows="2"></textarea>';
    h += '<button class="seg-card-btn primary" onclick="submitDictamen(\'' + eventId + '\')">Dictaminar</button>';
  } else if (tipo === 'cerrar') {
    h += '<textarea id="notas-' + eventId + '" placeholder="Accion tomada..." rows="2"></textarea>';
    h += '<button class="seg-card-btn primary" onclick="submitInlineForm(\'' + eventId + '\',\'CERRADO\')">Cerrar</button>';
  }

  h += ' <button class="seg-card-btn secondary" onclick="loadKanbanData()">Cancelar</button>';
  h += '</div>';
  container.innerHTML = h;
}

function avanzarEvento(eventId, nuevaEtapa, datos) {
  google.script.run
    .withSuccessHandler(function(json) {
      var r = JSON.parse(json);
      if (r.error) { alert('Error: ' + r.error); return; }
      loadKanbanData();
    })
    .withFailureHandler(function(e) { alert('Error: ' + e.message); })
    .updateEventoEtapa(eventId, nuevaEtapa, JSON.stringify(datos));
}

function submitInlineForm(eventId, nuevaEtapa) {
  var notasEl = document.getElementById('notas-' + eventId);
  var notas = notasEl ? notasEl.value : '';
  if (nuevaEtapa === 'CERRADO' && !notas) { alert('Las notas son obligatorias para descartar.'); return; }
  avanzarEvento(eventId, nuevaEtapa, { notas: notas });
}

function submitAsignar(eventId) {
  var email = document.getElementById('asignado-' + eventId).value;
  if (!email) { alert('Ingresa el email del coordinador.'); return; }
  google.script.run
    .withSuccessHandler(function(json) {
      var r = JSON.parse(json);
      if (r.error) { alert('Error: ' + r.error); return; }
      loadKanbanData();
    })
    .withFailureHandler(function(e) { alert('Error: ' + e.message); })
    .asignarEvento(eventId, email);
}

function submitDictamen(eventId) {
  var hallazgo = document.getElementById('hallazgo-' + eventId).value;
  var notas = document.getElementById('notas-' + eventId).value;
  if (!hallazgo) { alert('Selecciona el tipo de hallazgo.'); return; }
  google.script.run
    .withSuccessHandler(function(json) {
      var r = JSON.parse(json);
      if (r.error) { alert('Error: ' + r.error); return; }
      loadKanbanData();
    })
    .withFailureHandler(function(e) { alert('Error: ' + e.message); })
    .dictaminarEvento(eventId, hallazgo, notas);
}

function filterKanbanByEtapa(nodeId) {
  // Map SVG node IDs to etapas
  var map = { deteccion_ctrl:'DETECTADO', deteccion_warn:'DETECTADO', analisis_causa:'EN_ANALISIS', analisis_suma:'EN_ANALISIS', reporte_coord:'ASIGNADO', asignacion:'ASIGNADO', tipo_informe:'DICTAMINADO', reporte_warn:'DICTAMINADO', reporte_final_c:'CERRADO', cerrado_warn:'CERRADO' };
  var etapa = map[nodeId];
  if (etapa) {
    SEG_KANBAN_FILTER = { etapa: etapa };
    loadKanbanData(SEG_KANBAN_FILTER);
  }
}

function filterKanbanByFlag(flagName) {
  SEG_KANBAN_FILTER = { categoria: flagName };
  loadKanbanData(SEG_KANBAN_FILTER);
}
```

- [ ] **Step 2: clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 3: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "[POC] feat: Zona 3 - Kanban 7 columnas con cards interactivas y CRUD"
```

---

### Task 8: Frontend - Zona 4 Tabla de Detalle

**Files:**
- Modify: `gas-optimizado/Dashboard.html`

- [ ] **Step 1: Escribir loadDetailTable() y renderDetailTable()**

```javascript
function loadDetailTable(filtros) {
  var f = filtros || {};
  google.script.run
    .withSuccessHandler(function(json) {
      var data = JSON.parse(json);
      if (data.error) { console.error(data.error); return; }
      renderDetailTable(data.eventos);
    })
    .withFailureHandler(function(e) { console.error('Detail table error:', e); })
    .getSeguimientoEvents(JSON.stringify(f));
}

function renderDetailTable(eventos) {
  var cont = document.getElementById('seg-detail-container');
  var h = '<h3 style="color:#e0e0e0;margin:0 0 12px;font-size:15px;">Tabla de Detalle</h3>';

  // Filters
  h += '<div class="seg-detail-filters">';
  h += '<select onchange="applySegDetailFilter()" id="seg-f-tipo"><option value="">Tipo: Todos</option><option value="CONTROL">Control</option><option value="WARNING">Warning</option></select>';
  h += '<select onchange="applySegDetailFilter()" id="seg-f-etapa"><option value="">Etapa: Todas</option>';
  var etapas = ['DETECTADO','EN_ANALISIS','CONFIRMADO','ASIGNADO','EN_INVESTIGACION','DICTAMINADO','CERRADO'];
  for (var i=0;i<etapas.length;i++) h += '<option value="'+etapas[i]+'">'+etapas[i]+'</option>';
  h += '</select>';
  h += '<select onchange="applySegDetailFilter()" id="seg-f-prioridad"><option value="">Prioridad: Todas</option><option value="CRITICA">Critica</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option></select>';
  h += '<button class="seg-card-btn primary" onclick="exportSegToSheet()" style="padding:6px 16px;">Exportar a Sheet</button>';
  h += '</div>';

  // Table
  h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;">';
  h += '<thead><tr style="background:rgba(255,255,255,0.05);">';
  var cols = ['ID','Fecha','Tipo','Categoria','Sucursal','Contrato','Monto','Etapa','Prioridad','Asignado','Alertas'];
  for (var i=0;i<cols.length;i++) h += '<th style="padding:8px;text-align:left;color:#90a4ae;border-bottom:1px solid #2a3a4a;">'+cols[i]+'</th>';
  h += '</tr></thead><tbody>';

  var limit = Math.min(eventos.length, 50);
  for (var i=0;i<limit;i++) {
    var ev = eventos[i];
    var prColor = ev.prioridad==='CRITICA'?'#ef5350':ev.prioridad==='ALTA'?'#ff9800':ev.prioridad==='MEDIA'?'#ffc107':'#4caf50';
    h += '<tr style="border-bottom:1px solid #1a2332;color:#e0e0e0;">';
    h += '<td style="padding:6px 8px;color:#7c4dff;font-weight:600;">'+ev.id+'</td>';
    h += '<td style="padding:6px 8px;">'+ev.fechaDeteccion+'</td>';
    h += '<td style="padding:6px 8px;"><span class="seg-badge '+(ev.tipo==='CONTROL'?'control':'warning')+'">'+ev.tipo+'</span></td>';
    h += '<td style="padding:6px 8px;">'+sanitize_(ev.categoria)+'</td>';
    h += '<td style="padding:6px 8px;">'+sanitize_(ev.sucursal)+'</td>';
    h += '<td style="padding:6px 8px;">'+sanitize_(ev.contrato)+'</td>';
    h += '<td style="padding:6px 8px;">$'+(ev.monto||0).toLocaleString('es-MX')+'</td>';
    h += '<td style="padding:6px 8px;">'+ev.etapa+'</td>';
    h += '<td style="padding:6px 8px;color:'+prColor+';font-weight:600;">'+ev.prioridad+'</td>';
    h += '<td style="padding:6px 8px;">'+sanitize_(ev.asignadoA||'-')+'</td>';
    h += '<td style="padding:6px 8px;">'+ev.sumaAlertas+'</td>';
    h += '</tr>';
  }
  if (eventos.length > 50) h += '<tr><td colspan="11" style="padding:8px;color:#546e7a;text-align:center;">Mostrando 50 de '+eventos.length+' eventos</td></tr>';
  h += '</tbody></table></div>';

  cont.innerHTML = h;
}

function applySegDetailFilter() {
  var filtros = {};
  var tipo = document.getElementById('seg-f-tipo').value;
  var etapa = document.getElementById('seg-f-etapa').value;
  var prioridad = document.getElementById('seg-f-prioridad').value;
  if (tipo) filtros.tipo = tipo;
  if (etapa) filtros.etapa = etapa;
  if (prioridad) filtros.prioridad = prioridad;
  loadDetailTable(filtros);
}

function exportSegToSheet() {
  google.script.run
    .withSuccessHandler(function(url) {
      if (url) window.open(url, '_blank');
      else alert('Error al exportar');
    })
    .withFailureHandler(function(e) { alert('Error: ' + e.message); })
    .exportSeguimientoToSheet();
}
```

- [ ] **Step 2: Agregar exportSeguimientoToSheet() al backend**

En `codigo.gs`, agregar:

```javascript
function exportSeguimientoToSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureSeguimientoSheet_(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    var data = sheet.getRange(1, 1, lastRow, SEGUIMIENTO_HEADERS.length).getValues();
    var newSS = SpreadsheetApp.create('Seguimiento Eventos - ' + new Date().toLocaleDateString('es-MX'));
    var newSheet = newSS.getActiveSheet();
    newSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    newSheet.setFrozenRows(1);
    newSheet.getRange(1, 1, 1, data[0].length).setBackground('#1a2332').setFontColor('#ffffff').setFontWeight('bold');

    return newSS.getUrl();
  } catch(e) {
    return null;
  }
}
```

- [ ] **Step 3: clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 4: Commit**

```bash
git add gas-optimizado/codigo.gs gas-optimizado/Dashboard.html
git commit -m "[POC] feat: Zona 4 - Tabla detalle + exportacion + filtros"
```

---

### Task 9: Integracion getAnalysisContext() + Agente Gemini

**Files:**
- Modify: `gas-optimizado/Dashboard.html:1024-1048` (funcion getAnalysisContext)

- [ ] **Step 1: Enriquecer getAnalysisContext() con datos de seguimiento**

Agregar al final de la funcion `getAnalysisContext()`, antes del `return ctx;`:

```javascript
// --- Datos de Seguimiento de Eventos ---
var seg = CURRENT_DATA.seguimiento;
if (seg) {
  ctx += '\n## Seguimiento de Eventos\n';
  ctx += '- Universo: ' + seg.kpis.universo + ' disposiciones\n';
  ctx += '- Controles activados: ' + seg.kpis.controlesActivados + ' (' + seg.kpis.pctControles + '%)\n';
  ctx += '- Warnings activados: ' + seg.kpis.warningsActivados + ' (' + seg.kpis.pctWarnings + '%)\n';
  ctx += '- Eventos activos en seguimiento: ' + seg.kpis.eventosActivos + '\n';
  ctx += '- Eventos cerrados: ' + seg.kpis.eventosCerrados + '\n';
  ctx += '\nEventos por etapa:\n';
  for (var et in seg.etapas) {
    ctx += '  - ' + et + ': ' + seg.etapas[et] + '\n';
  }
  if (seg.controles && seg.controles.length > 0) {
    ctx += '\nTop controles con mayor % de falla:\n';
    var sorted = seg.controles.slice().sort(function(a,b){return b.pctUniverso-a.pctUniverso;});
    for (var i = 0; i < Math.min(5, sorted.length); i++) {
      ctx += '  - ' + sorted[i].nombre + ': ' + sorted[i].pctUniverso + '% (' + sorted[i].eventos + ' eventos)\n';
    }
  }
  if (seg.warnings && seg.warnings.length > 0) {
    ctx += '\nTop warnings mas frecuentes:\n';
    var sortedW = seg.warnings.slice().sort(function(a,b){return b.eventos-a.eventos;});
    for (var i = 0; i < Math.min(5, sortedW.length); i++) {
      ctx += '  - ' + sortedW[i].nombre + ': ' + sortedW[i].eventos + ' eventos (' + sortedW[i].pctUniverso + '%)\n';
    }
  }
  if (seg.eventosVencidos && seg.eventosVencidos.length > 0) {
    ctx += '\nEventos criticos pendientes >48h:\n';
    for (var i = 0; i < seg.eventosVencidos.length; i++) {
      var v = seg.eventosVencidos[i];
      ctx += '  - ' + v.id + ' (' + v.etapa + ') en ' + v.sucursal + ' - ' + v.horas + 'h sin avance\n';
    }
  }
}
```

- [ ] **Step 2: clasp push**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`

- [ ] **Step 3: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "[POC] feat: getAnalysisContext enriquecido con datos de seguimiento"
```

---

### Task 10: Deploy y Verificacion

**Files:**
- No file changes, only deployment and testing

- [ ] **Step 1: clasp push final**

Run: `cd /c/Users/Administrador/Funnel && clasp push --force`
Expected: Archivos subidos sin errores

- [ ] **Step 2: Ejecutar precomputeAll remotamente**

Run: `cd /c/Users/Administrador/Funnel && clasp run precomputeAll`
Expected: JSON con clave `seguimiento` conteniendo kpis, controles, warnings, etapas, diagrama

- [ ] **Step 3: Abrir Dashboard y verificar Tab 7**

Abrir: https://script.google.com/a/macros/findep.com.mx/s/AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw/exec

Verificar:
- [ ] Pestana "Seguimiento" aparece en la barra de tabs
- [ ] Zona 1: 6 KPI cards con datos
- [ ] Zona 1b: Tablas controles vs warnings lado a lado
- [ ] Zona 2: Diagrama SVG con dos carriles
- [ ] Zona 3: Kanban con 7 columnas
- [ ] Zona 4: Tabla de detalle con filtros
- [ ] Click en nodo SVG filtra Kanban
- [ ] Click en fila de tabla controles/warnings filtra Kanban
- [ ] Acciones de avance en Kanban funcionan (Analizar, Confirmar, etc.)

- [ ] **Step 4: Crear nueva version del deployment**

En el Editor de Apps Script: Implementar > Administrar implementaciones > Editar > Nueva version > Implementar

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "[POC] v5.0: Tab 7 Seguimiento de Incidencias y Fallas a los Controles"
```
