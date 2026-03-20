# Monitor de Disposiciones v3.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 new tabs (Resumen Ejecutivo, Mapa de Riesgo, Análisis Financiero, Tendencias) to the Monitor de Disposiciones without modifying any existing functionality.

**Architecture:** Additive-only changes to `codigo.gs` (new functions + extending `precomputeAll` result object) and `Dashboard.html` (tab bar + 4 new `<div>` sections). A new `_historico` sheet stores daily KPI snapshots with 60-day rolling window. All existing code remains untouched.

**Tech Stack:** Google Apps Script, HTML/CSS/JS, Google Charts (already loaded), Google Sheets as data store.

**Spec:** `docs/superpowers/specs/2026-03-20-monitor-tabs-design.md`

**Key constraint:** This is a Google Apps Script project — NO unit testing framework available. Testing is manual via `clasp push` + reload dashboard. NO TDD.

**Deploy:** After each task, run `clasp push --force && clasp deploy -i "AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw" -d "description"` from `c:\Users\Administrador\Funnel`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `gas-optimizado/codigo.gs` | Modify (additive) | Add `HISTORICO_HEADERS`, `HIST_SHEET` config, `computeExecutiveData_()`, `saveHistoricSnapshot_()`, `getHistoricData()`, extend `precomputeAll()` result |
| `gas-optimizado/Dashboard.html` | Modify (additive) | Add tab bar CSS, tab bar HTML, 4 new tab `<div>` sections, `switchTab()` JS, render functions for each tab |

**NOT modified:** Any existing function, CSS class, or HTML element.

---

## Task 1: Backend — Config and Historic Sheet

**Files:**
- Modify: `gas-optimizado/codigo.gs:12-24` (CONFIG object)
- Modify: `gas-optimizado/codigo.gs` (add after AUTH section, before UTILIDADES)

- [ ] **Step 1: Add config constants**

In `codigo.gs`, add `HIST_SHEET` to the CONFIG object at line 17 (after `AUTH_SHEET`):

```javascript
HIST_SHEET: '_historico',
```

After the `AUTH_HEADERS` array (around line 37), add:

```javascript
var HISTORICO_HEADERS = [
  'fecha','totalReg','totalMonto','totalInc','tasaInc','montoInc','sucursalesCount',
  'capitalInsoluto','saldoVencido',
  'flagFueraHorario','flagMismodia','flagForaneas','flagTelRepetido','flagTelColab',
  'flagContratosRapidos','flagPagoSpei','flagMontoDup','flagDisp24k','flagCalif5',
  'flagDias120','flagReversados','flagHighMonto'
];
```

- [ ] **Step 2: Add `ensureHistSheet_()` function**

Add before the `// UTILIDADES` section (around line 756):

```javascript
// ================================================================
// HISTORICO (snapshots diarios, rolling 60 dias)
// ================================================================

function ensureHistSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.HIST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HIST_SHEET);
    sh.getRange(1, 1, 1, HISTORICO_HEADERS.length).setValues([HISTORICO_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange('1:1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sh.hideSheet();
  }
  return sh;
}
```

- [ ] **Step 3: Add `saveHistoricSnapshot_()` function**

Add right after `ensureHistSheet_()`:

```javascript
function saveHistoricSnapshot_(snapshot) {
  var sh = ensureHistSheet_();
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var lastRow = sh.getLastRow();

  // Check if today already has a snapshot — update it instead of adding
  if (lastRow >= 2) {
    var dates = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      var d = dates[i][0];
      if (d instanceof Date) d = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      if (String(d) === today) {
        sh.getRange(i + 2, 1, 1, HISTORICO_HEADERS.length).setValues([snapshot]);
        cleanOldHistory_(sh, tz);
        return;
      }
    }
  }

  // Add new row
  sh.getRange(lastRow + 1, 1, 1, HISTORICO_HEADERS.length).setValues([snapshot]);
  cleanOldHistory_(sh, tz);
}

function cleanOldHistory_(sh, tz) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  var dates = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i][0];
    if (d instanceof Date && d < cutoff) rowsToDelete.push(i + 2);
  }
  // Delete from bottom to top to preserve row indices
  for (var i = rowsToDelete.length - 1; i >= 0; i--) {
    sh.deleteRow(rowsToDelete[i]);
  }
}
```

- [ ] **Step 4: Add `getHistoricData()` function**

Add right after `cleanOldHistory_()`:

```javascript
function getHistoricData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.HIST_SHEET);
    if (!sh || sh.getLastRow() < 2) return JSON.stringify({ rows: [], headers: HISTORICO_HEADERS });
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, HISTORICO_HEADERS.length).getValues();
    var tz = Session.getScriptTimeZone();
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = {};
      for (var j = 0; j < HISTORICO_HEADERS.length; j++) {
        var val = data[i][j];
        if (val instanceof Date) val = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
        row[HISTORICO_HEADERS[j]] = val;
      }
      rows.push(row);
    }
    rows.sort(function(a, b) { return a.fecha < b.fecha ? -1 : 1; });
    return JSON.stringify({ rows: rows, headers: HISTORICO_HEADERS });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add gas-optimizado/codigo.gs
git commit -m "Add historic sheet infrastructure: config, ensure, save, read, cleanup"
```

---

## Task 2: Backend — Executive Data Computation

**Files:**
- Modify: `gas-optimizado/codigo.gs` (add function before HISTORICO section)
- Modify: `gas-optimizado/codigo.gs:106-253` (extend `precomputeAll()` — additive only)

- [ ] **Step 1: Add `computeExecutiveData_()` function**

Add before the `// HISTORICO` section:

```javascript
// ================================================================
// DATOS EJECUTIVOS (tabs nuevos)
// ================================================================

function computeExecutiveData_(allData, COL, rc, sucTotal, sucCount, flagColNames, flagStartIdx) {
  var totalReg = allData.length;

  // --- Financial KPIs ---
  var capitalInsoluto = 0, saldoVencido = 0, diasVencidosSum = 0, diasVencidosCount = 0;
  var dispEfectivo = 0, dispCheque = 0, montoEfectivo = 0, montoCheque = 0;
  var montoConFlags = 0, montoSinFlags = 0, totalReversados = 0;
  var calificacionDist = {};
  var diasVencidosDist = {'0':0,'1-30':0,'31-60':0,'61-90':0,'91-120':0,'>120':0};

  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var monto = parseFloat(String(r[COL['total_disposicion']]).replace(/[^0-9.\-]/g, '')) || 0;
    var cnt = parseInt(r[COL['COUNT']]) || 0;

    // Capital insoluto & saldo vencido
    var ci = parseFloat(r[COL['capital_insoluto']]) || 0;
    var sv = parseFloat(r[COL['saldo_vencido']]) || 0;
    capitalInsoluto += ci;
    saldoVencido += sv;

    // Dias vencidos
    var dv = parseInt(r[COL['dias_vencidos']]) || 0;
    if (dv > 0) { diasVencidosSum += dv; diasVencidosCount++; }
    if (dv === 0) diasVencidosDist['0']++;
    else if (dv <= 30) diasVencidosDist['1-30']++;
    else if (dv <= 60) diasVencidosDist['31-60']++;
    else if (dv <= 90) diasVencidosDist['61-90']++;
    else if (dv <= 120) diasVencidosDist['91-120']++;
    else diasVencidosDist['>120']++;

    // Tipo dispersion
    var tipo = String(r[COL['tipo_dispersion']] || '').toLowerCase();
    if (tipo.indexOf('cheque') >= 0) { dispCheque++; montoCheque += monto; }
    else { dispEfectivo++; montoEfectivo += monto; }

    // Monto con/sin flags
    if (cnt > 0) montoConFlags += monto;
    else montoSinFlags += monto;

    // Calificacion distribucion
    var calif = String(r[COL['CALIFICACION']] || 'N/D').trim();
    if (!calif || calif === '0' || calif === 'undefined') calif = 'N/D';
    calificacionDist[calif] = (calificacionDist[calif] || 0) + 1;
  }

  totalReversados = rc.reversados || 0;

  // --- Risk Score per sucursal ---
  var FLAG_ALTA = ['fueraHorario','mismodia','telRepetido','telColab','contratosRapidos','pagoSpei'];
  var FLAG_MEDIA = ['foraneas','montoDup','disp24k','reversados','dias120'];
  var FLAG_BAJA = ['calif5','highMonto'];

  // Need per-sucursal flag counts — re-scan slim data approach
  // We use sucTotal which has {t, i, m} per sucursal
  // For scores, we need per-sucursal flag breakdown, so we build it from allData
  var sucFlags = {};
  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var suc = String(r[COL['sucursal2']] || '').trim();
    if (!suc) continue;
    if (!sucFlags[suc]) sucFlags[suc] = { alta: 0, media: 0, baja: 0, total: 0, flagDetail: {} };
    sucFlags[suc].total++;
    var monto = parseFloat(String(r[COL['total_disposicion']]).replace(/[^0-9.\-]/g, '')) || 0;
    if (monto > 25000) { sucFlags[suc].baja++; sucFlags[suc].flagDetail['highMonto'] = (sucFlags[suc].flagDetail['highMonto'] || 0) + 1; }

    for (var fi = 0; fi < flagColNames.length; fi++) {
      var fIdx = flagStartIdx + fi;
      if (fIdx < r.length) {
        var fv = String(r[fIdx]).toUpperCase().trim();
        if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') {
          var fn = flagColNames[fi];
          var fnL = fn.toLowerCase();
          sucFlags[suc].flagDetail[fn] = (sucFlags[suc].flagDetail[fn] || 0) + 1;

          // Classify severity
          if (fnL.indexOf('fuera') >= 0 && fnL.indexOf('horario') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('+1') >= 0 && fnL.indexOf('mismo') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('tel') >= 0 && fnL.indexOf('repetido') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('tel') >= 0 && fnL.indexOf('colaborador') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('contrato') >= 0 && fnL.indexOf('3 min') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('pago') >= 0 && fnL.indexOf('spei') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('foran') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('monto') >= 0 && fnL.indexOf('duplicado') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('disposicion') >= 0 && fnL.indexOf('24') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('reversado') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('120') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('calificacion') >= 0 || fnL.indexOf('calif') >= 0) sucFlags[suc].baja++;
        }
      }
    }
  }

  var sucRiskScores = [];
  for (var s in sucFlags) {
    var sf = sucFlags[s];
    if (sf.total < 1) continue;
    var score = (sf.alta * 3 + sf.media * 2 + sf.baja * 1) / sf.total * 100;
    sucRiskScores.push({
      suc: s, score: Math.round(score * 10) / 10, alta: sf.alta, media: sf.media, baja: sf.baja,
      totalReg: sf.total, totalFlags: sf.alta + sf.media + sf.baja, flagDetail: sf.flagDetail
    });
  }
  sucRiskScores.sort(function(a, b) { return b.score - a.score; });

  // --- Headline ---
  var sucConInc = 0;
  for (var s in sucTotal) { if (sucTotal[s].i > 0) sucConInc++; }
  var alertasCriticas = rc.fueraHorario + rc.mismodia + rc.telRepetido + rc.telColab + rc.contratosRapidos + rc.pagoSpei;
  var headline = 'Hoy: ' + (rc.fueraHorario + rc.mismodia + rc.foraneas + rc.telRepetido + rc.telColab + rc.contratosRapidos + rc.pagoSpei + rc.montoDup + rc.disp24k + rc.calif5 + rc.dias120 + rc.reversados + rc.highMonto) + ' alertas en ' + sucConInc + ' sucursales';
  if (alertasCriticas > 0) headline += ' — ' + alertasCriticas + ' criticas';

  return {
    sucRiskScores: sucRiskScores,
    financial: {
      capitalInsoluto: capitalInsoluto,
      saldoVencido: saldoVencido,
      diasAtrasoProm: diasVencidosCount > 0 ? Math.round(diasVencidosSum / diasVencidosCount) : 0,
      tasaReversion: totalReg > 0 ? (totalReversados / totalReg * 100) : 0,
      montoConFlags: montoConFlags,
      montoSinFlags: montoSinFlags,
      dispEfectivo: dispEfectivo,
      dispCheque: dispCheque,
      montoEfectivo: montoEfectivo,
      montoCheque: montoCheque
    },
    calificacionDist: calificacionDist,
    diasVencidosDist: diasVencidosDist,
    headline: headline,
    alertasCriticas: alertasCriticas,
    sucConInc: sucConInc
  };
}
```

- [ ] **Step 2: Extend `precomputeAll()` to call executive computation and save historic**

In `precomputeAll()`, find the line that builds `var result = {` (line ~244). **Before** that line, add:

```javascript
  // === EXECUTIVE DATA (new tabs) ===
  var executive = computeExecutiveData_(allData, COL, rc, sucTotal, sucCount, flagColNames, flagStartIdx);

  // === HISTORIC SNAPSHOT ===
  var histRow = [
    new Date(), allData.length, totalMonto, totalInc,
    allData.length > 0 ? (totalInc / allData.length * 100) : 0,
    montoInc, Object.keys(sucSet).length,
    executive.financial.capitalInsoluto, executive.financial.saldoVencido,
    rc.fueraHorario, rc.mismodia, rc.foraneas, rc.telRepetido, rc.telColab,
    rc.contratosRapidos, rc.pagoSpei, rc.montoDup, rc.disp24k, rc.calif5,
    rc.dias120, rc.reversados, rc.highMonto
  ];
  saveHistoricSnapshot_(histRow);

  // === HISTORIC COMPARISON (vs yesterday) ===
  var vsAyer = { regDiff: 0, montoDiff: 0, incDiff: 0, tasaDiff: 0 };
  try {
    var histSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HIST_SHEET);
    if (histSheet && histSheet.getLastRow() >= 3) {
      var histData = histSheet.getRange(2, 1, histSheet.getLastRow() - 1, 5).getValues();
      // Sort by date descending, pick second row (yesterday)
      histData.sort(function(a, b) { return new Date(b[0]) - new Date(a[0]); });
      if (histData.length >= 2) {
        var ayer = histData[1]; // [fecha, totalReg, totalMonto, totalInc, tasaInc]
        vsAyer.regDiff = allData.length - (ayer[1] || 0);
        vsAyer.montoDiff = totalMonto - (ayer[2] || 0);
        vsAyer.incDiff = totalInc - (ayer[3] || 0);
        vsAyer.tasaDiff = (allData.length > 0 ? totalInc / allData.length * 100 : 0) - (ayer[4] || 0);
      }
    }
  } catch(e) { /* no historic yet, ignore */ }
  executive.vsAyer = vsAyer;
```

Then, in the `var result = {` block (line ~244), add `executive` to the result object. Change:

```javascript
  var result={
    kpis:{...},
    charts:charts,risks:risks,filterOptions:filterOptions,headers:headers,flagNames:flagColNames,
    tablePage:{rows:firstPageRows,total:allData.length,page:0},
    lastUpdate:new Date().toLocaleString('es-MX')
  };
```

To:

```javascript
  var result={
    kpis:{...},
    charts:charts,risks:risks,filterOptions:filterOptions,headers:headers,flagNames:flagColNames,
    tablePage:{rows:firstPageRows,total:allData.length,page:0},
    lastUpdate:new Date().toLocaleString('es-MX'),
    executive:executive
  };
```

**Important:** Only add `,executive:executive` — do NOT change any existing line.

- [ ] **Step 3: Commit**

```bash
git add gas-optimizado/codigo.gs
git commit -m "Add executive data computation + historic snapshots in precomputeAll"
```

---

## Task 3: Frontend — Tab Bar CSS and HTML Structure

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (CSS section, HTML structure)

- [ ] **Step 1: Add tab bar CSS**

In `Dashboard.html`, find the closing `</style>` tag (line ~163). **Before** it, add:

```css
/* ===== TABS ===== */
.tab-bar { display:flex; background:#0d1520; border-bottom:2px solid #1e293b; padding:0 24px; position:sticky; top:48px; z-index:98; }
.tab-btn { background:none; border:none; color:#90a4ae; padding:12px 20px; font-size:13px; font-weight:bold; cursor:pointer; border-bottom:3px solid transparent; transition:all 0.2s; letter-spacing:0.5px; }
.tab-btn:hover { color:#e0e0e0; background:rgba(255,255,255,0.03); }
.tab-btn.active { color:#b388ff; border-bottom-color:#7c4dff; background:rgba(124,77,255,0.08); }
.tab-content { display:none; }
.tab-content.active { display:block; }
/* Executive tab */
.exec-headline { padding:20px 24px; border-radius:12px; margin-bottom:20px; font-size:18px; font-weight:bold; text-align:center; }
.exec-headline.red { background:linear-gradient(135deg,#2a1520,#3a1a2a); color:#ef9a9a; border:1px solid #ef5350; }
.exec-headline.yellow { background:linear-gradient(135deg,#2a2a15,#3a3a1a); color:#fff9c4; border:1px solid #ffc107; }
.exec-headline.green { background:linear-gradient(135deg,#152a1a,#1a3a20); color:#a5d6a7; border:1px solid #4caf50; }
.exec-semaforo { width:80px; height:80px; border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:bold; }
.exec-kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px; }
.exec-kpi-card { background:#1a2332; border-radius:12px; padding:16px; border:1px solid #2a3a4a; }
.exec-kpi-card h4 { color:#90a4ae; font-size:11px; text-transform:uppercase; margin-bottom:8px; }
.exec-kpi-card .value { font-size:28px; font-weight:bold; color:#fff; }
.exec-kpi-card .trend { font-size:12px; margin-top:4px; }
.exec-kpi-card .trend.up { color:#ef5350; }
.exec-kpi-card .trend.down { color:#4caf50; }
.exec-kpi-card .trend.neutral { color:#90a4ae; }
.exec-kpi-card .sparkline-container { height:40px; margin-top:8px; }
.exec-hallazgos { background:#1a2332; border-radius:12px; padding:16px; border:1px solid #2a3a4a; margin-bottom:20px; }
.exec-hallazgos h3 { color:#b388ff; font-size:14px; margin-bottom:12px; }
.exec-hallazgo { padding:8px 12px; border-left:3px solid #7c4dff; margin-bottom:8px; font-size:12px; background:#0d1520; border-radius:0 6px 6px 0; }
.exec-hallazgo.high { border-left-color:#ef5350; }
.exec-hallazgo.medium { border-left-color:#ffc107; }
.exec-hallazgo.low { border-left-color:#4caf50; }
.exec-comparativo { width:100%; border-collapse:collapse; font-size:12px; }
.exec-comparativo th { text-align:left; padding:8px 12px; background:#0d1520; color:#90a4ae; border-bottom:1px solid #2a3a4a; }
.exec-comparativo td { padding:8px 12px; border-bottom:1px solid #1e293b; }
/* Risk map tab */
.risk-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; margin-bottom:24px; }
.risk-card { background:#1a2332; border-radius:10px; padding:14px; border:1px solid #2a3a4a; cursor:pointer; transition:all 0.2s; }
.risk-card:hover { border-color:#7c4dff; transform:translateY(-2px); }
.risk-card .suc-name { font-size:14px; font-weight:bold; color:#fff; margin-bottom:6px; }
.risk-card .score-badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:13px; font-weight:bold; }
.risk-card .score-badge.high { background:#ef5350; color:#fff; }
.risk-card .score-badge.medium { background:#ffc107; color:#000; }
.risk-card .score-badge.low { background:#4caf50; color:#fff; }
.risk-card .meta { font-size:11px; color:#90a4ae; margin-top:6px; }
.risk-detail-panel { background:#1a2332; border-radius:12px; padding:20px; border:1px solid #7c4dff; margin-bottom:20px; display:none; }
.risk-detail-panel.active { display:block; }
.risk-detail-panel h3 { color:#b388ff; margin-bottom:12px; }
.risk-detail-flags { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.risk-detail-flag { background:#0d1520; padding:6px 12px; border-radius:6px; font-size:11px; }
.risk-ranking { background:#1a2332; border-radius:12px; padding:16px; border:1px solid #2a3a4a; }
.risk-ranking h3 { color:#b388ff; font-size:14px; margin-bottom:12px; }
.risk-rank-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:12px; }
.risk-rank-bar { height:8px; border-radius:4px; transition:width 0.3s; }
/* Financial tab */
.fin-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
.fin-kpi-card { background:#1a2332; border-radius:12px; padding:16px; border:1px solid #2a3a4a; text-align:center; }
.fin-kpi-card h4 { color:#90a4ae; font-size:11px; text-transform:uppercase; margin-bottom:8px; }
.fin-kpi-card .value { font-size:24px; font-weight:bold; color:#fff; }
.fin-charts-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:20px; }
.fin-chart-box { background:#1a2332; border-radius:12px; padding:16px; border:1px solid #2a3a4a; }
.fin-chart-box h3 { color:#b388ff; font-size:13px; margin-bottom:12px; }
/* Trends tab */
.trend-chart-box { background:#1a2332; border-radius:12px; padding:16px; border:1px solid #2a3a4a; margin-bottom:20px; }
.trend-chart-box h3 { color:#b388ff; font-size:13px; margin-bottom:12px; }
.anomaly-table { width:100%; border-collapse:collapse; font-size:12px; }
.anomaly-table th { text-align:left; padding:8px 12px; background:#0d1520; color:#90a4ae; }
.anomaly-table td { padding:8px 12px; border-bottom:1px solid #1e293b; }
.anomaly-alert { color:#ef5350; font-weight:bold; }
.anomaly-ok { color:#4caf50; }
```

- [ ] **Step 2: Add tab bar HTML and wrap existing content**

In `Dashboard.html`, find the line after the filters bar closing `</div>` (line ~187, before `<div class="scroll-wrapper">`). Add the tab bar:

```html
<div class="tab-bar">
 <button class="tab-btn active" onclick="switchTab('operativo')">Monitor Operativo</button>
 <button class="tab-btn" onclick="switchTab('ejecutivo')">Resumen Ejecutivo</button>
 <button class="tab-btn" onclick="switchTab('riesgo')">Mapa de Riesgo</button>
 <button class="tab-btn" onclick="switchTab('financiero')">Analisis Financiero</button>
 <button class="tab-btn" onclick="switchTab('tendencias')">Tendencias</button>
</div>
```

Then, wrap the existing `<div class="scroll-wrapper">...<div class="dashboard">...</div></div>` content inside a tab-content div. Change:

```html
<div class="scroll-wrapper">
<div class="dashboard">
```

To:

```html
<div id="tab-operativo" class="tab-content active">
<div class="scroll-wrapper">
<div class="dashboard">
```

And find the closing tags of the scroll-wrapper/dashboard section (the `</div></div>` before the incidencia modal). Add the closing `</div>` for the tab-content:

```html
</div></div>
</div><!-- /tab-operativo -->
```

- [ ] **Step 3: Update filters-bar sticky position**

Change the `.filters-bar` CSS `top:48px` to `top:48px` (it stays the same but we need the tab-bar to go below it). Actually, update tab-bar to be below filters:

Change `.tab-bar` position to `top:96px` to go below the filters bar. And update `.filters-bar` z-index to 99 (already is).

Actually, re-read the spec: "Barra de pestañas entre el header y los filtros". So tabs go BETWEEN top-bar and filters. Update:
- `.tab-bar`: `top:48px; z-index:99;`
- `.filters-bar`: change `top:48px` to `top:90px; z-index:98;`

- [ ] **Step 4: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "Add tab bar CSS, HTML structure, wrap existing content in tab-operativo"
```

---

## Task 4: Frontend — Tab Switching JS and New Tab Containers

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (add new tab divs + switchTab function)

- [ ] **Step 1: Add 4 empty tab content divs**

After the closing `</div><!-- /tab-operativo -->`, add the 4 new tab containers:

```html
<!-- TAB: RESUMEN EJECUTIVO -->
<div id="tab-ejecutivo" class="tab-content">
 <div style="padding:20px;max-width:1400px;margin:0 auto;">
  <div id="execHeadline" class="exec-headline green"></div>
  <div style="text-align:center;margin-bottom:20px;">
   <div id="execSemaforo" class="exec-semaforo"></div>
   <div id="execSemaforoLabel" style="color:#90a4ae;font-size:12px;"></div>
  </div>
  <div id="execKpiGrid" class="exec-kpi-grid"></div>
  <div class="exec-hallazgos" id="execHallazgos"><h3>Top Hallazgos del Dia</h3><div id="execHallazgosList"></div></div>
  <div class="exec-hallazgos"><h3>Comparativo Semanal</h3><table class="exec-comparativo" id="execComparativo"><thead><tr><th>Indicador</th><th>Esta Semana</th><th>Semana Anterior</th><th>Cambio</th></tr></thead><tbody></tbody></table></div>
 </div>
</div>

<!-- TAB: MAPA DE RIESGO -->
<div id="tab-riesgo" class="tab-content">
 <div style="padding:20px;max-width:1600px;margin:0 auto;">
  <div id="riskDetailPanel" class="risk-detail-panel"></div>
  <div style="display:flex;gap:24px;">
   <div style="flex:2;"><h3 style="color:#b388ff;margin-bottom:12px;">Sucursales por Score de Riesgo</h3><div id="riskGrid" class="risk-grid"></div></div>
   <div style="flex:1;" class="risk-ranking"><h3>Top 15 — Mayor Riesgo</h3><div id="riskRanking"></div></div>
  </div>
 </div>
</div>

<!-- TAB: ANALISIS FINANCIERO -->
<div id="tab-financiero" class="tab-content">
 <div style="padding:20px;max-width:1400px;margin:0 auto;">
  <div id="finKpiGrid" class="fin-kpi-grid"></div>
  <div class="fin-charts-grid">
   <div class="fin-chart-box"><h3>Distribucion de Calificaciones</h3><div id="chartCalificaciones" style="height:300px;"></div></div>
   <div class="fin-chart-box"><h3>Monto con Alertas vs Sin Alertas</h3><div id="chartMontoFlags" style="height:300px;"></div></div>
   <div class="fin-chart-box"><h3>Disposiciones por Tipo</h3><div id="chartTipoDisp" style="height:300px;"></div></div>
   <div class="fin-chart-box"><h3>Distribucion de Dias Vencidos</h3><div id="chartDiasVencidos" style="height:300px;"></div></div>
  </div>
 </div>
</div>

<!-- TAB: TENDENCIAS -->
<div id="tab-tendencias" class="tab-content">
 <div style="padding:20px;max-width:1400px;margin:0 auto;">
  <div id="tendenciasLoading" style="text-align:center;padding:40px;color:#90a4ae;">Cargando datos historicos...</div>
  <div id="tendenciasContent" style="display:none;">
   <div class="trend-chart-box"><h3>KPIs Principales — Ultimos 60 Dias</h3><div id="chartTrendKpis" style="height:350px;"></div></div>
   <div class="trend-chart-box"><h3>Comparativo Semanal (ultimas 8 semanas)</h3><div id="chartTrendSemanal" style="height:300px;"></div></div>
   <div class="trend-chart-box"><h3>Flags en el Tiempo</h3><div id="chartTrendFlags" style="height:350px;"></div></div>
   <div class="trend-chart-box"><h3>Deteccion de Anomalias</h3><table class="anomaly-table" id="anomalyTable"><thead><tr><th>Flag</th><th>Esta Semana</th><th>Promedio 4 Sem</th><th>Cambio</th><th>Estado</th></tr></thead><tbody></tbody></table></div>
  </div>
 </div>
</div>
```

- [ ] **Step 2: Add `switchTab()` function**

In the `<script>` section, after the `esc()`, `fmt$()`, `fmtN()` helper functions (around line 341), add:

```javascript
// ===== TABS =====
var CURRENT_TAB = 'operativo';
var TABS_RENDERED = { operativo: true, ejecutivo: false, riesgo: false, financiero: false, tendencias: false };
var HISTORIC_DATA = null;

function switchTab(tabId) {
  // Update tab buttons
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  event.target.classList.add('active');

  // Update tab content
  var tabs = document.querySelectorAll('.tab-content');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  document.getElementById('tab-' + tabId).classList.add('active');

  // Show/hide filters bar (only for operativo and riesgo)
  var filtersBar = document.querySelector('.filters-bar');
  if (tabId === 'operativo') filtersBar.style.display = 'flex';
  else filtersBar.style.display = 'none';

  CURRENT_TAB = tabId;

  // Lazy render tabs on first visit
  if (!TABS_RENDERED[tabId]) {
    TABS_RENDERED[tabId] = true;
    if (tabId === 'ejecutivo') renderTabEjecutivo();
    if (tabId === 'riesgo') renderTabRiesgo();
    if (tabId === 'financiero') renderTabFinanciero();
    if (tabId === 'tendencias') loadAndRenderTendencias();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "Add 4 tab containers, switchTab JS with lazy rendering"
```

---

## Task 5: Frontend — Render Resumen Ejecutivo Tab

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (add `renderTabEjecutivo()`)

- [ ] **Step 1: Add render function**

After the `switchTab()` function, add:

```javascript
// ===== TAB: RESUMEN EJECUTIVO =====
function renderTabEjecutivo() {
  var ex = DB.executive;
  if (!ex) { document.getElementById('tab-ejecutivo').innerHTML = '<p style="padding:40px;color:#ef5350;">Datos ejecutivos no disponibles. Espera al proximo ciclo de pre-computacion.</p>'; return; }

  // Headline
  var hl = document.getElementById('execHeadline');
  var tasaInc = DB.kpis.tasaInc || 0;
  hl.textContent = ex.headline;
  hl.className = 'exec-headline ' + (ex.alertasCriticas > 0 ? 'red' : (tasaInc > 5 ? 'yellow' : 'green'));

  // Semaforo
  var sem = document.getElementById('execSemaforo');
  var semLabel = document.getElementById('execSemaforoLabel');
  if (tasaInc > 15) { sem.style.background = '#ef5350'; sem.textContent = '!'; semLabel.textContent = 'Riesgo Alto (' + tasaInc.toFixed(1) + '%)'; }
  else if (tasaInc > 5) { sem.style.background = '#ffc107'; sem.textContent = '~'; semLabel.textContent = 'Riesgo Medio (' + tasaInc.toFixed(1) + '%)'; }
  else { sem.style.background = '#4caf50'; sem.textContent = '✓'; semLabel.textContent = 'Riesgo Bajo (' + tasaInc.toFixed(1) + '%)'; }

  // KPI Cards
  var va = ex.vsAyer || {};
  var kpis = [
    { title: 'Total Disposiciones', value: fmtN(DB.kpis.totalReg), diff: va.regDiff, isAmount: false },
    { title: 'Monto Total', value: fmt$(DB.kpis.totalMonto), diff: va.montoDiff, isAmount: true },
    { title: 'Alertas Detectadas', value: fmtN(DB.kpis.totalInc), diff: va.incDiff, isAmount: false },
    { title: 'Tasa de Riesgo', value: tasaInc.toFixed(1) + '%', diff: va.tasaDiff, isAmount: false },
    { title: 'Fuera de Horario', value: fmtN(DB.charts.flagCounts ? getFlagCount('fuera') : 0), diff: 0, isAmount: false },
    { title: 'Sucursales Riesgo >20%', value: fmtN(ex.sucRiskScores.filter(function(s){return s.score>20;}).length), diff: 0, isAmount: false }
  ];
  var grid = document.getElementById('execKpiGrid');
  grid.innerHTML = '';
  for (var i = 0; i < kpis.length; i++) {
    var k = kpis[i];
    var trendClass = k.diff > 0 ? 'up' : (k.diff < 0 ? 'down' : 'neutral');
    var trendIcon = k.diff > 0 ? '▲' : (k.diff < 0 ? '▼' : '—');
    var trendText = k.diff !== 0 ? (k.isAmount ? fmt$(Math.abs(k.diff)) : fmtN(Math.abs(k.diff))) + ' vs ayer' : 'Sin cambio';
    grid.innerHTML += '<div class="exec-kpi-card"><h4>' + esc(k.title) + '</h4><div class="value">' + k.value + '</div><div class="trend ' + trendClass + '">' + trendIcon + ' ' + trendText + '</div><div class="sparkline-container" id="spark' + i + '"></div></div>';
  }

  // Top 5 hallazgos
  var hallazgos = DB.risks ? DB.risks.slice(0, 5) : [];
  var hList = document.getElementById('execHallazgosList');
  hList.innerHTML = '';
  for (var i = 0; i < hallazgos.length; i++) {
    var h = hallazgos[i];
    hList.innerHTML += '<div class="exec-hallazgo ' + h.level + '">' + esc(h.title) + '</div>';
  }
  if (hallazgos.length === 0) hList.innerHTML = '<div style="color:#90a4ae;font-size:12px;">No hay hallazgos activos</div>';

  // Load historic for sparklines and comparativo
  google.script.run.withSuccessHandler(function(json) {
    var hist = JSON.parse(json);
    HISTORIC_DATA = hist.rows || [];
    renderSparklines_();
    renderComparativoSemanal_();
  }).withFailureHandler(function(e) {
    // No historic yet, sparklines won't render
  }).getHistoricData();
}

function getFlagCount(keyword) {
  var flags = DB.charts.flagCounts || [];
  for (var i = 0; i < flags.length; i++) { if (flags[i][0].toLowerCase().indexOf(keyword) >= 0) return flags[i][1]; }
  return 0;
}

function renderSparklines_() {
  if (!HISTORIC_DATA || HISTORIC_DATA.length < 2) return;
  var fields = ['totalReg', 'totalMonto', 'totalInc', 'tasaInc', 'flagFueraHorario', 'sucursalesCount'];
  for (var i = 0; i < fields.length; i++) {
    var container = document.getElementById('spark' + i);
    if (!container) continue;
    var dataTable = new google.visualization.DataTable();
    dataTable.addColumn('string', 'Fecha');
    dataTable.addColumn('number', 'Valor');
    for (var j = 0; j < HISTORIC_DATA.length; j++) {
      dataTable.addRow([String(HISTORIC_DATA[j].fecha || ''), HISTORIC_DATA[j][fields[i]] || 0]);
    }
    var chart = new google.visualization.LineChart(container);
    chart.draw(dataTable, {
      legend: 'none', hAxis: { textPosition: 'none', gridlines: { count: 0 } },
      vAxis: { textPosition: 'none', gridlines: { count: 0 }, minValue: 0 },
      chartArea: { left: 0, top: 0, width: '100%', height: '100%' },
      colors: ['#7c4dff'], lineWidth: 2, backgroundColor: 'transparent', enableInteractivity: false
    });
  }
}

function renderComparativoSemanal_() {
  if (!HISTORIC_DATA || HISTORIC_DATA.length < 7) return;
  var tbody = document.querySelector('#execComparativo tbody');
  var rows = HISTORIC_DATA;
  var len = rows.length;
  var thisWeek = rows.slice(Math.max(0, len - 7));
  var lastWeek = rows.slice(Math.max(0, len - 14), Math.max(0, len - 7));
  if (lastWeek.length === 0) return;

  var indicators = [
    { name: 'Registros', key: 'totalReg' },
    { name: 'Monto Total', key: 'totalMonto', isMoney: true },
    { name: 'Alertas', key: 'totalInc' },
    { name: 'Tasa Riesgo %', key: 'tasaInc', isPct: true }
  ];
  tbody.innerHTML = '';
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var tw = avgField_(thisWeek, ind.key);
    var lw = avgField_(lastWeek, ind.key);
    var diff = tw - lw;
    var pct = lw > 0 ? (diff / lw * 100) : 0;
    var fmtFn = ind.isMoney ? fmt$ : (ind.isPct ? function(v){return v.toFixed(1)+'%';} : fmtN);
    var color = diff > 0 ? '#ef5350' : (diff < 0 ? '#4caf50' : '#90a4ae');
    tbody.innerHTML += '<tr><td>' + ind.name + '</td><td>' + fmtFn(tw) + '</td><td>' + fmtFn(lw) + '</td><td style="color:' + color + '">' + (diff > 0 ? '+' : '') + pct.toFixed(1) + '%</td></tr>';
  }
}
function avgField_(rows, key) { var s = 0; for (var i = 0; i < rows.length; i++) s += (rows[i][key] || 0); return rows.length > 0 ? s / rows.length : 0; }
```

- [ ] **Step 2: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "Add Resumen Ejecutivo tab rendering with KPIs, sparklines, hallazgos, comparativo"
```

---

## Task 6: Frontend — Render Mapa de Riesgo Tab

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (add `renderTabRiesgo()`)

- [ ] **Step 1: Add render function**

After the Resumen Ejecutivo functions, add:

```javascript
// ===== TAB: MAPA DE RIESGO =====
function renderTabRiesgo() {
  var ex = DB.executive;
  if (!ex || !ex.sucRiskScores) return;
  var scores = ex.sucRiskScores;

  // Grid
  var grid = document.getElementById('riskGrid');
  grid.innerHTML = '';
  for (var i = 0; i < scores.length; i++) {
    var s = scores[i];
    var level = s.score > 20 ? 'high' : (s.score > 5 ? 'medium' : 'low');
    grid.innerHTML += '<div class="risk-card" onclick="showRiskDetail(' + i + ')">' +
      '<div class="suc-name">Suc ' + esc(s.suc) + '</div>' +
      '<span class="score-badge ' + level + '">' + s.score.toFixed(1) + '</span>' +
      '<div class="meta">' + fmtN(s.totalReg) + ' registros | ' + fmtN(s.totalFlags) + ' flags</div>' +
      '</div>';
  }

  // Ranking
  var ranking = document.getElementById('riskRanking');
  ranking.innerHTML = '';
  var top15 = scores.slice(0, 15);
  var maxScore = top15.length > 0 ? top15[0].score : 1;
  for (var i = 0; i < top15.length; i++) {
    var s = top15[i];
    var pct = maxScore > 0 ? (s.score / maxScore * 100) : 0;
    var color = s.score > 20 ? '#ef5350' : (s.score > 5 ? '#ffc107' : '#4caf50');
    ranking.innerHTML += '<div class="risk-rank-row">' +
      '<span style="width:60px;color:#90a4ae;">' + esc(s.suc) + '</span>' +
      '<div style="flex:1;background:#0d1520;border-radius:4px;overflow:hidden;"><div class="risk-rank-bar" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
      '<span style="width:50px;text-align:right;color:' + color + ';">' + s.score.toFixed(1) + '</span>' +
      '</div>';
  }
}

function showRiskDetail(idx) {
  var ex = DB.executive;
  var s = ex.sucRiskScores[idx];
  var panel = document.getElementById('riskDetailPanel');
  var flagsHtml = '';
  for (var fn in s.flagDetail) {
    var level = 'low';
    var fnL = fn.toLowerCase();
    if (fnL.indexOf('fuera') >= 0 || fnL.indexOf('+1') >= 0 || fnL.indexOf('tel') >= 0 || fnL.indexOf('3 min') >= 0 || fnL.indexOf('spei') >= 0) level = 'high';
    else if (fnL.indexOf('foran') >= 0 || fnL.indexOf('duplicado') >= 0 || fnL.indexOf('24') >= 0 || fnL.indexOf('reversado') >= 0 || fnL.indexOf('120') >= 0) level = 'medium';
    flagsHtml += '<span class="risk-detail-flag" style="border-left:3px solid ' + (level === 'high' ? '#ef5350' : level === 'medium' ? '#ffc107' : '#4caf50') + ';">' + esc(fn) + ': ' + s.flagDetail[fn] + '</span>';
  }
  panel.innerHTML = '<h3>Sucursal ' + esc(s.suc) + ' — Score: ' + s.score.toFixed(1) + '</h3>' +
    '<div style="margin-bottom:12px;font-size:12px;color:#90a4ae;">' + fmtN(s.totalReg) + ' registros | Alta: ' + s.alta + ' | Media: ' + s.media + ' | Baja: ' + s.baja + '</div>' +
    '<div class="risk-detail-flags">' + flagsHtml + '</div>' +
    '<button style="background:#7c4dff;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;" onclick="filterBySucursal(\'' + esc(s.suc) + '\')">Filtrar en Monitor</button>' +
    '<button style="background:#2a3a4a;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;margin-left:8px;" onclick="document.getElementById(\'riskDetailPanel\').classList.remove(\'active\')">Cerrar</button>';
  panel.classList.add('active');
}

function filterBySucursal(suc) {
  document.getElementById('fSucursal').value = suc;
  // Switch to operativo tab
  var btns = document.querySelectorAll('.tab-btn');
  btns[0].click();
  applyFilters();
}
```

- [ ] **Step 2: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "Add Mapa de Riesgo tab with grid, ranking, detail panel"
```

---

## Task 7: Frontend — Render Análisis Financiero Tab

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (add `renderTabFinanciero()`)

- [ ] **Step 1: Add render function**

After the Mapa de Riesgo functions, add:

```javascript
// ===== TAB: ANALISIS FINANCIERO =====
function renderTabFinanciero() {
  var ex = DB.executive;
  if (!ex || !ex.financial) return;
  var fin = ex.financial;

  // KPI cards
  var grid = document.getElementById('finKpiGrid');
  grid.innerHTML = [
    { title: 'Capital Insoluto', value: fmt$(fin.capitalInsoluto) },
    { title: 'Saldo Vencido', value: fmt$(fin.saldoVencido) },
    { title: 'Dias Atraso Promedio', value: fmtN(fin.diasAtrasoProm) + ' dias' },
    { title: 'Tasa de Reversion', value: fin.tasaReversion.toFixed(2) + '%' }
  ].map(function(k) {
    return '<div class="fin-kpi-card"><h4>' + k.title + '</h4><div class="value">' + k.value + '</div></div>';
  }).join('');

  // Chart: Calificaciones
  var califData = new google.visualization.DataTable();
  califData.addColumn('string', 'Calificacion');
  califData.addColumn('number', 'Cantidad');
  var cd = ex.calificacionDist || {};
  var califKeys = Object.keys(cd).sort();
  for (var i = 0; i < califKeys.length; i++) califData.addRow([califKeys[i], cd[califKeys[i]]]);
  var califChart = new google.visualization.BarChart(document.getElementById('chartCalificaciones'));
  califChart.draw(califData, { legend: 'none', backgroundColor: 'transparent', colors: ['#7c4dff'],
    hAxis: { textStyle: { color: '#90a4ae' }, gridlines: { color: '#1e293b' } },
    vAxis: { textStyle: { color: '#90a4ae' } }, chartArea: { left: 60, top: 10, width: '80%', height: '85%' } });

  // Chart: Monto con flags vs sin flags
  var flagsMontoData = new google.visualization.DataTable();
  flagsMontoData.addColumn('string', 'Tipo');
  flagsMontoData.addColumn('number', 'Monto');
  flagsMontoData.addRow(['Con Alertas', fin.montoConFlags]);
  flagsMontoData.addRow(['Sin Alertas', fin.montoSinFlags]);
  var flagsMontoChart = new google.visualization.PieChart(document.getElementById('chartMontoFlags'));
  flagsMontoChart.draw(flagsMontoData, { backgroundColor: 'transparent', colors: ['#ef5350', '#4caf50'],
    legend: { position: 'bottom', textStyle: { color: '#90a4ae', fontSize: 11 } },
    pieHole: 0.4, chartArea: { left: 10, top: 10, width: '90%', height: '80%' } });

  // Chart: Tipo dispersion
  var tipoData = new google.visualization.DataTable();
  tipoData.addColumn('string', 'Tipo');
  tipoData.addColumn('number', 'Cantidad');
  tipoData.addColumn('number', 'Monto');
  tipoData.addRow(['Efectivo (' + fmtN(fin.dispEfectivo) + ')', fin.dispEfectivo, fin.montoEfectivo]);
  tipoData.addRow(['Cheque (' + fmtN(fin.dispCheque) + ')', fin.dispCheque, fin.montoCheque]);
  var tipoChart = new google.visualization.PieChart(document.getElementById('chartTipoDisp'));
  tipoChart.draw(tipoData, { backgroundColor: 'transparent', colors: ['#536dfe', '#ff9800'],
    legend: { position: 'bottom', textStyle: { color: '#90a4ae', fontSize: 11 } },
    pieHole: 0.4, chartArea: { left: 10, top: 10, width: '90%', height: '80%' } });

  // Chart: Dias vencidos
  var dvData = new google.visualization.DataTable();
  dvData.addColumn('string', 'Rango');
  dvData.addColumn('number', 'Cantidad');
  var dvDist = ex.diasVencidosDist || {};
  var dvKeys = ['0', '1-30', '31-60', '61-90', '91-120', '>120'];
  for (var i = 0; i < dvKeys.length; i++) dvData.addRow([dvKeys[i], dvDist[dvKeys[i]] || 0]);
  var dvChart = new google.visualization.ColumnChart(document.getElementById('chartDiasVencidos'));
  dvChart.draw(dvData, { legend: 'none', backgroundColor: 'transparent', colors: ['#ff9800'],
    hAxis: { textStyle: { color: '#90a4ae' } }, vAxis: { textStyle: { color: '#90a4ae' }, gridlines: { color: '#1e293b' } },
    chartArea: { left: 60, top: 10, width: '80%', height: '85%' } });
}
```

- [ ] **Step 2: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "Add Analisis Financiero tab with 4 KPIs and 4 charts"
```

---

## Task 8: Frontend — Render Tendencias Tab

**Files:**
- Modify: `gas-optimizado/Dashboard.html` (add `loadAndRenderTendencias()`)

- [ ] **Step 1: Add render function**

After the Financiero functions, add:

```javascript
// ===== TAB: TENDENCIAS =====
function loadAndRenderTendencias() {
  google.script.run.withSuccessHandler(function(json) {
    var hist = JSON.parse(json);
    HISTORIC_DATA = hist.rows || [];
    document.getElementById('tendenciasLoading').style.display = 'none';
    if (HISTORIC_DATA.length < 2) {
      document.getElementById('tendenciasContent').innerHTML = '<p style="padding:40px;color:#90a4ae;text-align:center;">Se necesitan al menos 2 dias de datos historicos. El historico se genera automaticamente cada dia.</p>';
      document.getElementById('tendenciasContent').style.display = 'block';
      return;
    }
    document.getElementById('tendenciasContent').style.display = 'block';
    renderTrendKpis_();
    renderTrendSemanal_();
    renderTrendFlags_();
    renderAnomalyTable_();
  }).withFailureHandler(function(e) {
    document.getElementById('tendenciasLoading').textContent = 'Error cargando historico: ' + e.message;
  }).getHistoricData();
}

function renderTrendKpis_() {
  var data = new google.visualization.DataTable();
  data.addColumn('string', 'Fecha');
  data.addColumn('number', 'Registros');
  data.addColumn('number', 'Alertas');
  data.addColumn('number', 'Tasa %');
  for (var i = 0; i < HISTORIC_DATA.length; i++) {
    var r = HISTORIC_DATA[i];
    data.addRow([r.fecha, r.totalReg || 0, r.totalInc || 0, r.tasaInc || 0]);
  }
  var chart = new google.visualization.LineChart(document.getElementById('chartTrendKpis'));
  chart.draw(data, {
    backgroundColor: 'transparent', colors: ['#536dfe', '#ef5350', '#ffc107'],
    legend: { position: 'bottom', textStyle: { color: '#90a4ae' } },
    hAxis: { textStyle: { color: '#90a4ae' }, gridlines: { color: '#1e293b' } },
    vAxis: { textStyle: { color: '#90a4ae' }, gridlines: { color: '#1e293b' } },
    chartArea: { left: 60, top: 20, width: '85%', height: '75%' }, lineWidth: 2
  });
}

function renderTrendSemanal_() {
  // Group by week
  var weeks = {};
  for (var i = 0; i < HISTORIC_DATA.length; i++) {
    var r = HISTORIC_DATA[i];
    var d = new Date(r.fecha);
    var weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
    var wk = weekStart.toISOString().substring(0, 10);
    if (!weeks[wk]) weeks[wk] = { reg: 0, inc: 0, days: 0 };
    weeks[wk].reg += (r.totalReg || 0);
    weeks[wk].inc += (r.totalInc || 0);
    weeks[wk].days++;
  }
  var wkKeys = Object.keys(weeks).sort().slice(-8);
  var data = new google.visualization.DataTable();
  data.addColumn('string', 'Semana');
  data.addColumn('number', 'Registros');
  data.addColumn('number', 'Alertas');
  for (var i = 0; i < wkKeys.length; i++) {
    var w = weeks[wkKeys[i]];
    data.addRow([wkKeys[i], Math.round(w.reg / w.days), Math.round(w.inc / w.days)]);
  }
  var chart = new google.visualization.ColumnChart(document.getElementById('chartTrendSemanal'));
  chart.draw(data, {
    backgroundColor: 'transparent', colors: ['#536dfe', '#ef5350'],
    legend: { position: 'bottom', textStyle: { color: '#90a4ae' } },
    hAxis: { textStyle: { color: '#90a4ae' } }, vAxis: { textStyle: { color: '#90a4ae' }, gridlines: { color: '#1e293b' } },
    chartArea: { left: 60, top: 20, width: '85%', height: '75%' }
  });
}

function renderTrendFlags_() {
  var flagKeys = ['flagFueraHorario', 'flagMismodia', 'flagForaneas', 'flagTelRepetido', 'flagContratosRapidos', 'flagReversados'];
  var flagLabels = ['Fuera Horario', 'Mismo Dia', 'Foraneas', 'Tel Repetido', 'Contratos Rapidos', 'Reversados'];
  var data = new google.visualization.DataTable();
  data.addColumn('string', 'Fecha');
  for (var i = 0; i < flagLabels.length; i++) data.addColumn('number', flagLabels[i]);
  for (var i = 0; i < HISTORIC_DATA.length; i++) {
    var r = HISTORIC_DATA[i];
    var row = [r.fecha];
    for (var j = 0; j < flagKeys.length; j++) row.push(r[flagKeys[j]] || 0);
    data.addRow(row);
  }
  var chart = new google.visualization.AreaChart(document.getElementById('chartTrendFlags'));
  chart.draw(data, {
    backgroundColor: 'transparent', colors: ['#ef5350', '#ff9800', '#ffc107', '#7c4dff', '#536dfe', '#90a4ae'],
    legend: { position: 'bottom', textStyle: { color: '#90a4ae', fontSize: 10 } },
    hAxis: { textStyle: { color: '#90a4ae' } }, vAxis: { textStyle: { color: '#90a4ae' }, gridlines: { color: '#1e293b' } },
    chartArea: { left: 60, top: 20, width: '85%', height: '70%' }, isStacked: true, lineWidth: 1, areaOpacity: 0.3
  });
}

function renderAnomalyTable_() {
  var flagKeys = ['flagFueraHorario','flagMismodia','flagForaneas','flagTelRepetido','flagTelColab','flagContratosRapidos','flagPagoSpei','flagMontoDup','flagDisp24k','flagCalif5','flagDias120','flagReversados','flagHighMonto'];
  var flagLabels = ['Fuera Horario','+1 Mismo Dia','Foraneas','Tel Repetido','Tel Colaborador','Contratos <3min','Pago SPEI Colab','Monto Duplicado','Disp >24k','Calif <=5','>120 Dias','Reversados','Monto >$25k'];
  var len = HISTORIC_DATA.length;
  if (len < 7) return;
  var thisWeek = HISTORIC_DATA.slice(Math.max(0, len - 7));
  var prev4 = HISTORIC_DATA.slice(Math.max(0, len - 35), Math.max(0, len - 7));
  var tbody = document.querySelector('#anomalyTable tbody');
  tbody.innerHTML = '';
  for (var i = 0; i < flagKeys.length; i++) {
    var twSum = 0; for (var j = 0; j < thisWeek.length; j++) twSum += (thisWeek[j][flagKeys[i]] || 0);
    var prevSum = 0; for (var j = 0; j < prev4.length; j++) prevSum += (prev4[j][flagKeys[i]] || 0);
    var prevAvg = prev4.length > 0 ? prevSum / (prev4.length / 7) : 0; // Average per week
    var pctChange = prevAvg > 0 ? ((twSum - prevAvg) / prevAvg * 100) : 0;
    var isAnomaly = pctChange > 50;
    tbody.innerHTML += '<tr><td>' + flagLabels[i] + '</td><td>' + fmtN(twSum) + '</td><td>' + fmtN(Math.round(prevAvg)) + '</td>' +
      '<td style="color:' + (pctChange > 0 ? '#ef5350' : '#4caf50') + '">' + (pctChange > 0 ? '+' : '') + pctChange.toFixed(0) + '%</td>' +
      '<td class="' + (isAnomaly ? 'anomaly-alert' : 'anomaly-ok') + '">' + (isAnomaly ? '⚠ Anomalia' : '✓ Normal') + '</td></tr>';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add gas-optimizado/Dashboard.html
git commit -m "Add Tendencias tab with 60-day trends, weekly comparison, flags timeline, anomaly detection"
```

---

## Task 9: Deploy and Verify

**Files:** None (deployment only)

- [ ] **Step 1: Push to Apps Script and deploy**

```bash
cd c:\Users\Administrador\Funnel
clasp push --force
clasp deploy -i "AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw" -d "v3.0 - Tab system: ejecutivo, riesgo, financiero, tendencias"
```

- [ ] **Step 2: Verify manually**

Open: https://script.google.com/a/macros/findep.com.mx/s/AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw/exec

Check:
1. Tab bar visible with 5 tabs
2. "Monitor Operativo" tab shows existing dashboard (no changes)
3. Filters bar visible on Monitor Operativo, hidden on other tabs
4. "Resumen Ejecutivo" shows headline, semáforo, 6 KPI cards, hallazgos
5. "Mapa de Riesgo" shows grid of sucursales with scores, click detail works
6. "Análisis Financiero" shows 4 KPIs + 4 charts
7. "Tendencias" loads historic data (will show "need 2+ days" message initially)
8. Chat FAB visible on all tabs

- [ ] **Step 3: Push to GitHub**

```bash
git add gas-optimizado/codigo.gs gas-optimizado/Dashboard.html
git commit -m "Monitor v3.0: 4 new tabs (ejecutivo, riesgo, financiero, tendencias) + historic snapshots"
git push origin feature/monitor-chat-agent
```
