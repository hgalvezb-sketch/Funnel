# Monitor de Disposiciones v3.0 — Sistema de Pestañas

## Resumen

Agregar 4 pestañas nuevas al Monitor de Disposiciones sin modificar la funcionalidad existente. Cada pestaña nueva aporta una vista especializada: resumen ejecutivo (CEO), mapa de riesgo por sucursal, análisis financiero, y tendencias históricas (60 días rolling).

## Principio rector

**NO modificar nada del código actual.** Todo lo nuevo se agrega de forma aditiva: nuevos `<div>` en el HTML, nuevas funciones en `codigo.gs`, nueva hoja `_historico`. El tab "Monitor Operativo" muestra exactamente lo que existe hoy.

---

## Arquitectura

### Navegación por tabs

Barra de pestañas entre el header y los filtros:

```
[Monitor Operativo]  [Resumen Ejecutivo]  [Mapa de Riesgo]  [Análisis Financiero]  [Tendencias]
```

- CSS: fondo oscuro, tab activa con borde inferior `#7c4dff` y fondo ligeramente más claro
- JS: `switchTab(tabId)` oculta/muestra `<div>` con `display:none/block`
- Al cambiar tab, la barra de filtros se oculta en tabs que no la usan (Resumen, Tendencias)
- El chat FAB y el botón de incidencias permanecen visibles en todas las tabs

### Datos

#### `precomputeAll()` — modificaciones aditivas

Agregar al JSON cacheado un nuevo objeto `executive` con:

```javascript
result.executive = {
  // Score de riesgo por sucursal
  sucRiskScores: [{suc, score, flagCounts, totalReg, trend}],
  // KPIs financieros
  financial: {
    capitalInsoluto, saldoVencido, diasAtrasoProm,
    tasaReversion, montoConFlags, montoSinFlags,
    dispEfectivo, dispCheque, montoEfectivo, montoCheque
  },
  // Distribución de calificaciones
  calificacionDist: {1:n, 2:n, ..., 10:n},
  // Headline auto-generado
  headline: "Hoy se detectaron X alertas críticas en Y sucursales",
  // Comparativo vs ayer (si hay histórico)
  vsAyer: {regDiff, montoDiff, incDiff, tasaDiff}
};
```

**Score de riesgo por sucursal:**
```
score = (flags_alta × 3 + flags_media × 2 + flags_baja × 1) / total_registros × 100
```

Flags ALTA: fueraHorario, mismodia, telRepetido, telColab, contratosRapidos, pagoSpei
Flags MEDIA: foraneas, montoDup, disp24k, reversados, dias120
Flags BAJA: calif5, highMonto

#### Hoja `_historico` — nueva

| Columna | Tipo | Descripción |
|---------|------|-------------|
| fecha | Date | Fecha del snapshot |
| totalReg | Number | Total registros |
| totalMonto | Number | Monto total |
| totalInc | Number | Total incidencias |
| tasaInc | Number | Tasa de incidencia % |
| montoInc | Number | Monto con incidencias |
| sucursalesCount | Number | Sucursales activas |
| capitalInsoluto | Number | Capital insoluto total |
| saldoVencido | Number | Saldo vencido total |
| flagFueraHorario | Number | Conteo flag |
| flagMismodia | Number | Conteo flag |
| flagForaneas | Number | Conteo flag |
| flagTelRepetido | Number | Conteo flag |
| flagTelColab | Number | Conteo flag |
| flagContratosRapidos | Number | Conteo flag |
| flagPagoSpei | Number | Conteo flag |
| flagMontoDup | Number | Conteo flag |
| flagDisp24k | Number | Conteo flag |
| flagCalif5 | Number | Conteo flag |
| flagDias120 | Number | Conteo flag |
| flagReversados | Number | Conteo flag |
| flagHighMonto | Number | Conteo flag |

- Una fila por día
- Máximo 60 filas (rolling). Al agregar, borrar filas con fecha > 60 días
- Se guarda al final de `precomputeAll()` con función `saveHistoricSnapshot_()`

#### Lectura de histórico

Nueva función `getHistoricData()` que lee `_historico` y retorna JSON para las gráficas de tendencia. Se llama desde el cliente al abrir el tab Tendencias.

---

## Pestañas

### Tab 1 — "Monitor Operativo" (SIN CAMBIOS)

El contenido actual se envuelve en un `<div id="tabOperativo">`. No se modifica ningún CSS, JS ni funcionalidad existente.

### Tab 2 — "Resumen Ejecutivo"

`<div id="tabEjecutivo">`

**Componentes:**

1. **Headline** — Texto grande generado del conteo de alertas:
   - "Hoy: {totalInc} alertas en {sucursalesConInc} sucursales — {alertasCriticas} críticas"
   - Fondo rojo si hay alertas críticas, amarillo si solo medias, verde si no hay

2. **Semáforo general** — Círculo grande con color:
   - Verde: tasa de incidencia < 5%
   - Amarillo: 5-15%
   - Rojo: > 15%

3. **6 KPI cards** con sparkline (mini gráfica de línea con datos de `_historico`):
   - Total Disposiciones (con flecha vs ayer)
   - Monto Total (con flecha vs ayer)
   - Alertas Detectadas (con flecha vs ayer)
   - Tasa de Riesgo % (con flecha vs ayer)
   - Operaciones Fuera de Horario (con flecha vs ayer)
   - Sucursales con Riesgo >20% (con flecha vs ayer)

4. **Top 5 hallazgos del día** — Lista ordenada por severidad de los flags con más conteo

5. **Comparativo semanal** — Tabla simple:
   | Indicador | Esta semana | Semana anterior | Cambio |

   Calculado desde `_historico` (últimos 7 días vs 7 anteriores)

**Datos:** Lee de `result.executive` + `_historico` (via `getHistoricData()`)

### Tab 3 — "Mapa de Riesgo"

`<div id="tabRiesgo">`

**Componentes:**

1. **Grid de sucursales** — Cards en grid (4-5 columnas) con:
   - Nombre de sucursal
   - Score de riesgo (número + color de fondo: verde/amarillo/rojo)
   - # total de registros
   - # flags activos
   - Flecha de tendencia vs día anterior (si hay histórico)

2. **Panel de detalle** (aparece al hacer click en una sucursal):
   - Desglose de flags para esa sucursal con conteo
   - Monto total de operaciones con flag
   - Lista de los contratos/folios con más flags (top 10)
   - Botón "Filtrar en Monitor" → cambia a tab 1 con filtro de esa sucursal aplicado

3. **Ranking lateral** — Top 15 sucursales por score, con barras horizontales coloreadas

**Datos:** Lee de `result.executive.sucRiskScores`

### Tab 4 — "Análisis Financiero"

`<div id="tabFinanciero">`

**Componentes:**

1. **4 KPI cards financieras:**
   - Capital Insoluto Total
   - Saldo Vencido Total
   - Días de Atraso Promedio
   - Tasa de Reversión %

2. **Gráfica: Distribución de Calificaciones** — Bar chart (1-10 + N/D)

3. **Gráfica: Monto con Flags vs Sin Flags** — Stacked bar o waterfall
   - Visualiza qué proporción del monto total tiene alertas

4. **Gráfica: Disposiciones por Tipo** — Pie chart (efectivo vs cheque) con montos

5. **Gráfica: Distribución de Días Vencidos** — Histogram (0, 1-30, 31-60, 61-90, 91-120, >120)

**Datos:** Lee de `result.executive.financial` y `result.executive.calificacionDist`

### Tab 5 — "Tendencias"

`<div id="tabTendencias">`

**Componentes:**

1. **Gráfica de línea: KPIs principales (60 días)**
   - Total registros, monto total, alertas, tasa de riesgo
   - 4 líneas con colores distintos, eje Y dual (conteo izq, monto der)

2. **Gráfica de barras: Comparativo semanal**
   - Últimas 8 semanas, barras agrupadas (registros vs alertas)

3. **Gráfica de área apilada: Flags en el tiempo**
   - Cada flag como un área, muestra cuáles crecen o disminuyen

4. **Tabla de anomalías** — Generada automáticamente:
   - Compara última semana vs promedio de las 4 anteriores
   - Si un flag tiene >50% más ocurrencias → alerta "Anomalía detectada"
   - Formato: "Fuera de horario: 45 esta semana vs promedio 28 (+61%)"

**Datos:** Lee de `_historico` via `getHistoricData()`

---

## Columnas de bd_disp utilizadas (nuevas vs existentes)

### Ya usadas por el Monitor Operativo
sucursal2, contrato, folio, tipo_dispo, estatus_destino, A1, CALIFICACION, empresa, total_disposicion, COUNT, Edad + 13 flags

### Nuevas a usar
| Columna | Tab | Para qué |
|---------|-----|----------|
| capital_insoluto | Financiero | KPI card |
| saldo_vencido | Financiero | KPI card |
| dias_vencidos | Financiero | Distribución, promedio |
| tipo_dispersion | Financiero | Efectivo vs cheque |
| tasa | Financiero | Distribución de tasas |
| fecha_registro | Todas | Filtro temporal |
| monto_colocado | Financiero | Waterfall |
| no_pagos_vencidos | Financiero | Análisis de atraso |
| maximo_retraso | Financiero | Score de riesgo |

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `Dashboard.html` | Agregar barra de tabs, 4 nuevos `<div>` de contenido, CSS de tabs, JS de switchTab + renderizado de cada tab |
| `codigo.gs` | Agregar cálculos de `executive` en `precomputeAll()`, función `saveHistoricSnapshot_()`, función `getHistoricData()`, agregar columnas a `SLIM_COL_NAMES` si necesario |

**NO se modifica:** Ninguna función existente. Solo se agregan funciones nuevas y se extiende el JSON cacheado.

---

## Restricciones

- Google Apps Script: máximo 6 minutos de ejecución por trigger
- HTML máximo recomendado: ~200KB (actualmente ~60KB, hay margen)
- `_historico`: máximo 60 filas × ~20 columnas = insignificante
- Google Charts ya está cargado, usar para sparklines y gráficas nuevas
