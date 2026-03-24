# Monitor de Disposiciones v5.0 - FINDEP

Dashboard de monitoreo de disposiciones de Caja Unica para FINDEP. Google Apps Script Web App con arquitectura de pre-agregacion server-side, agente de analisis con Gemini AI, inteligencia predictiva (regresion, Z-Score, Bollinger), seguimiento de eventos con workflow de 7 etapas, sistema de incidencias, exportacion de reportes, entrada de voz y guia interactiva.

## URLs del proyecto

### Produccion (v1.0)

| Recurso | URL |
|---------|-----|
| **Dashboard (ejecutable)** | https://script.google.com/a/macros/findep.com.mx/s/AKfycbwbCF2EtDit2Azfhrl5OBqCOCh6il_WdL7s-vmgaV6fK4RgChVWpkQmMm5-IpfUZr5G/exec |
| **Spreadsheet** | https://docs.google.com/spreadsheets/d/1ADKcPFVvHUlLtR2x_A5f74rdJOZa73p3gEwPq_E338I/edit |

### Desarrollo (v5.0)

| Recurso | URL |
|---------|-----|
| **Dashboard v5.0** | https://script.google.com/a/macros/findep.com.mx/s/AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw/exec |
| **Editor Apps Script** | https://script.google.com/u/0/home/projects/1naiQhFZB-6qGxCCr7DcTVAPO0Av6qDL4aDqXffiC4YDv4859HcYS9zTY/edit |
| **Spreadsheet v2.0** | https://docs.google.com/spreadsheets/d/1xbYd4b4aSfnCnrVD8VLQGPBiRTeIXAfOxpk9UP6e1c8/edit |
| **GitHub repo** | https://github.com/hgalvezb-sketch/Funnel |
| **Branch activo** | `feature/monitor-chat-agent` |

## Arquitectura

```
[Trigger cada 10 min] -> [Pre-calcula 50k+ filas] -> [Cache JSON chunked]
[Usuario abre URL]    -> [Lee cache ~200KB]        -> [Renderiza en 3-5 seg]
[Filtros/Tabla]       -> [Server-side via google.script.run] -> [Re-agrega desde slim sheet]
[Chat con Agente]     -> [Gemini 2.5 Flash + systemInstruction + historial] -> [Respuesta contextual]
[Entrada de Voz]      -> [Web Speech API (es-MX)] -> [Transcripcion -> Chat]
[Incidencias]         -> [CRUD sobre hoja _incidencias] -> [Seguimiento con estados]
[Exportacion]         -> [Crea Google Sheet nuevo via SpreadsheetApp.create()] -> [Abre en nueva pestana]
[Seguimiento Eventos] -> [Auto-deteccion flags + workflow 7 etapas] -> [Kanban + SVG diagrama]
[Inteligencia Pred.]  -> [Regresion + Z-Score + Bollinger] -> [Scores predictivos por sucursal]
```

### Hojas internas (auto-generadas)

| Hoja | Funcion | Creada por |
|------|---------|------------|
| `_dashboard_cache` | JSON pre-computado chunked (KPIs, charts, risks, filters, tabla, seguimiento, predictivo) | `precomputeAll()` |
| `_dashboard_slim` | Datos reducidos para filtros rapidos (11 cols + flags + rowNum) | `precomputeAll()` |
| `_incidencias` | Registro de incidencias con estado y seguimiento (14 columnas) | `ensureIncidenciasSheet_()` |
| `_historico` | Rolling 60 dias de metricas diarias para modelos predictivos | `precomputeAll()` |
| `_seguimiento_eventos` | Eventos de seguimiento con workflow de 7 etapas (19 columnas) | `ensureSeguimientoSheet_()` |
| `_usuarios_autorizados` | Control de acceso por email | Manual |

### Estructura de hoja `_incidencias`

| Columna | Campo | Descripcion |
|---------|-------|-------------|
| A | ID | Auto-generado: `INC-YYYYMMDD-NNNN` |
| B | Fecha_Registro | Timestamp de creacion |
| C | Sucursal | Sucursal seleccionada |
| D | Contrato | Numero de contrato |
| E | Folio | Numero de folio |
| F | Tipo_Hallazgo | Control / Proceso / Riesgo |
| G | Severidad | Alta / Media / Baja |
| H | Descripcion | Texto libre del hallazgo |
| I | Accion_Recomendada | Accion correctiva/preventiva |
| J | Responsable | Nombre del responsable |
| K | Fecha_Compromiso | Fecha limite |
| L | Estado | Abierta / En Revision / Cerrada |
| M | Fecha_Actualizacion | Ultima modificacion |
| N | Registrado_Por | Email del usuario |

### Estructura de hoja `_seguimiento_eventos`

| Columna | Campo | Descripcion |
|---------|-------|-------------|
| A | ID | Auto-generado: `EVT-YYYYMMDD-NNNN` |
| B | Fecha_Deteccion | Timestamp de deteccion automatica |
| C | Tipo | CONTROL o WARNING |
| D | Categoria | Nombre de la bandera (ej: "Tel repetido distintos contratos") |
| E | Columna_Flag | Columna del flag en datos (ej: CX, CR) |
| F | Sucursal | Sucursal donde se detecto |
| G | Contrato | Numero de contrato |
| H | Folio | Numero de folio |
| I | Monto | Monto de la disposicion |
| J | Etapa | DETECTADO/EN_ANALISIS/CONFIRMADO/ASIGNADO/EN_INVESTIGACION/DICTAMINADO/CERRADO |
| K | Prioridad | CRITICA/ALTA/MEDIA/BAJA |
| L | Asignado_A | Email del coordinador/ARO asignado |
| M | Notas | Notas del analisis/dictamen |
| N | Hallazgo | Tipo: FRAUDE/INCUMPLIMIENTO/MALA_PRACTICA/FALSO_POSITIVO |
| O | Suma_Alertas | Cantidad total de flags activos en la disposicion |
| P | Registrado_Por | SISTEMA (auto-deteccion) o email del usuario |
| Q | Fecha_Actualizacion | Ultima modificacion |
| R | Fila_Origen | Numero de fila en la hoja de datos original |
| S | Datos_Contexto | JSON con datos adicionales de la disposicion |

## Archivos

- `gas-optimizado/codigo.gs` - Backend Apps Script (pre-agregacion, filtros, tabla, chat Gemini, incidencias, exportacion, inteligencia predictiva, seguimiento de eventos)
- `gas-optimizado/Dashboard.html` - Frontend (7 pestanas, 10+ graficas, 6 KPIs, 8 filtros, chat flotante con voz, incidencias, exportacion, tour interactivo, kanban, SVG diagrama de flujo)

## 7 Pestanas del Dashboard

| # | Pestana | Contenido principal |
|---|---------|---------------------|
| 1 | **Monitor Operativo** | KPIs, 10 graficas, riesgos, incidencias, tabla de detalle |
| 2 | **Resumen Ejecutivo** | Headline, metricas clave, distribucion, top sucursales |
| 3 | **Mapa de Riesgo** | Analisis por severidad, sucursales criticas |
| 4 | **Analisis Financiero** | Montos, tendencias financieras, alertas PLD |
| 5 | **Tendencias** | Historico 60 dias, evolucion temporal |
| 6 | **Inteligencia Predictiva** | Regresion, Z-Score, Bollinger, scores, heatmap, Gemini |
| 7 | **Seguimiento** | KPIs controles/warnings, diagrama SVG, kanban 7 etapas, tabla detalle |

## Features por version

### v2.0 - Chat, Incidencias, Exportacion, Voz (2026-03-19)

- Chat flotante popup draggable con FAB, badge, historial multi-turno
- Entrada de voz con Web Speech API (es-MX)
- Modal de registro de incidencias con validacion
- Seccion de seguimiento de incidencias con 4 KPIs, filtros y cambio de estado
- Exportacion de secciones a Google Sheet (KPIs, graficos, riesgos, incidencias, tabla)

### v3.0 - 5 Pestanas (2026-03-20)

- Resumen Ejecutivo, Mapa de Riesgo, Analisis Financiero, Tendencias
- Lazy rendering por pestana

### v4.0 - Inteligencia Predictiva (2026-03-20)

- Regresion lineal: pendiente, R2, proyecciones a 7/14/30 dias
- Z-Score por sucursal: anomalia (|Z|>2), critica (|Z|>3)
- Bandas de Bollinger: media movil 7 dias +/- 2 desviaciones
- Score predictivo compuesto 0-100 por sucursal
- Heatmap sucursal vs banderas (top 15 x 8 tipos)
- Insights predictivos con Gemini AI

### v4.1 - Guia Interactiva (2026-03-20)

- Tour de 17 pasos con boton "?"
- Highlight de elementos con box-shadow y tooltip

### v5.0 - Seguimiento de Incidencias y Fallas a los Controles (2026-03-21)

#### Clasificacion de flags

| Tipo | Columnas | Descripcion |
|------|----------|-------------|
| **CONTROLES C-535** | CQ, CU, CV, DC, CX, CY | Ligados a normatividad C-535, requieren reporteo ejecutivo |
| **WARNINGS** | CR, CS, CT, CW, CZ, DA, DB, DD | Alertas operativas para deteccion de anomalias y fraude |

#### Deteccion automatica de eventos

- `autoDetectNewEvents_()`: Escanea datos, detecta flags activos (`SI`/`YES`/`TRUE`/`1`), crea eventos en etapa DETECTADO
- Prioridad calculada: CRITICA (>=5 alertas o CX/CY), ALTA (3-4), MEDIA (2), BAJA (1)
- Max 100 eventos nuevos por ejecucion (proteccion contra saturacion)

#### Workflow de 7 etapas

```
DETECTADO -> EN_ANALISIS -> CONFIRMADO -> ASIGNADO -> EN_INVESTIGACION -> DICTAMINADO -> CERRADO
```

| Etapa | Accion del usuario | Datos requeridos |
|-------|-------------------|------------------|
| DETECTADO | Analizar | - |
| EN_ANALISIS | Confirmar/Descartar | Notas del analisis |
| CONFIRMADO | Asignar | Email del coordinador/ARO |
| ASIGNADO | Investigar | - |
| EN_INVESTIGACION | Dictaminar | Tipo hallazgo + notas |
| DICTAMINADO | Cerrar | Accion tomada |
| CERRADO | - | - |

#### Frontend Tab 7

| Zona | Contenido |
|------|-----------|
| **KPIs** | 6 cards: Universo Total, Controles Activados (%), Warnings Activados (%), Disp. Limpias (%), En Seguimiento, Cerrados |
| **Tablas** | Controles C-535 (5 tipos con columna normativa) y Warnings (8 tipos) — clickeables para filtrar kanban |
| **Diagrama SVG** | Flujo interactivo con 2 swimlanes (Controles/Warnings), nodos coloreados por conteo, diamantes de decision |
| **Kanban** | 7 columnas con tarjetas de evento, botones de accion, formularios inline, filtros por etapa/flag |
| **Tabla detalle** | 50 eventos con filtros (tipo/etapa/prioridad), boton exportar a Sheet |

#### Backend Tab 7

| Funcion | Descripcion |
|---------|-------------|
| `ensureSeguimientoSheet_()` | Crea hoja `_seguimiento_eventos` con 19 columnas |
| `autoDetectNewEvents_(allData, COL, flagColNames, flagStartIdx, ss)` | Escanea datos y crea eventos DETECTADO |
| `computeSeguimientoData_()` | Calcula KPIs, clasifica controles/warnings, cuenta etapas |
| `getSeguimientoEvents(filtrosJson)` | Lectura filtrada de eventos |
| `updateEventoEtapa(eventoId, nuevaEtapa, datosJson)` | Avanza evento en workflow |
| `getEventoDetalle(eventoId)` | Detalle de un evento |
| `asignarEvento(eventoId, email)` | Asigna coordinador/ARO |
| `dictaminarEvento(eventoId, hallazgo, notas)` | Registra dictamen |
| `exportSeguimientoToSheet()` | Exporta todos los eventos a Google Sheet nuevo |

## Agente de Chat - Gemini AI

### Configuracion

| Propiedad de Script | Valor | Descripcion |
|---------------------|-------|-------------|
| `GEMINI_API_KEY` | `AIzaSy...` | API Key del proyecto GCP `monitor-gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modelo Gemini (configurable) |

### Funcionalidades del agente
- **System prompt FINDEP** con contexto de microfinanzas y 13 banderas de riesgo
- **`systemInstruction`** como campo separado del payload Gemini (endpoint v1beta)
- **Historial multi-turno** (ultimos 6 mensajes)
- **Contexto dinamico** enriquecido: KPIs, filtros activos, riesgos, top sucursales, banderas, datos de seguimiento
- **Contexto de seguimiento**: universo, controles/warnings activos, eventos por etapa, top 5 flags, eventos vencidos >48h
- **4 preguntas sugeridas** con botones clickeables
- **Renderizado markdown** en respuestas
- **Temperature 0.4** para respuestas deterministas
- **Entrada de voz** con Web Speech API

### 13 Banderas de riesgo monitoreadas

| Severidad | Banderas |
|-----------|----------|
| **ALTA** | Fuera de horario, +1 mismo dia, Tel repetido distintos contratos, Tel de Colaborador, Contratos en menos de 3 min, Pago SPEI Colab |
| **MEDIA** | Foraneas efectivo, Monto duplicado mismo dia, Disposiciones >24k, REVERSADO |
| **BAJA** | > 120 dias, Calificacion <= 5, En Quincena |

## Despliegue

### Con clasp (recomendado)

```bash
clasp push --force              # Sube codigo al proyecto Apps Script
clasp deploy --deploymentId <ID> -d "vN: descripcion"  # Actualiza deployment existente
clasp run precomputeAll         # Ejecuta pre-computo remotamente
```

### Manual
1. Abrir el **Editor de Apps Script** (URL arriba)
2. Seleccionar **Codigo.gs** > Ctrl+A > pegar contenido de `gas-optimizado/codigo.gs`
3. Seleccionar **Dashboard.html** > Ctrl+A > pegar contenido de `gas-optimizado/Dashboard.html`
4. Guardar con **Ctrl+S**
5. **Implementar > Administrar implementaciones > Editar (lapiz) > Nueva version > Implementar**

**CRITICO:** Despues de pegar codigo, SIEMPRE crear nueva version. El URL `/exec` usa la version desplegada, NO el codigo guardado en el editor.

### Configurar API Key de Gemini (requerido para el chat)
1. En el Editor de Apps Script: **Configuracion** (engranaje) > **Propiedades de script**
2. Agregar propiedades:
   - `GEMINI_API_KEY` = tu API key (formato `AIzaSy...`)
   - `GEMINI_MODEL` = `gemini-2.5-flash`

## Inteligencia Predictiva - Arquitectura

```
[precomputeAll()] -> [linearRegression_() + zScoreAnalysis_() + bollingerBands_()] -> [Scores predictivos]
                  -> [generatePredictiveInsights_()] -> [Gemini 2.5 Flash] -> [Alertas en lenguaje natural]
                  -> [Cache en _cache] -> [Pestana "Inteligencia Predictiva"]
```

### Score predictivo por sucursal (0-100)

```
Score = Tendencia(0.35) + Anomalia(0.30) + Bollinger(0.20) + FlagsAlta(0.15)
```

| Score | Nivel | Accion |
|-------|-------|--------|
| 0-30 | Verde | Monitoreo rutinario semanal |
| 31-60 | Amarillo | Monitoreo diario, revisar en comite |
| 61-80 | Naranja | Revision presencial en 48h |
| 81-100 | Rojo | Escalamiento inmediato |

## Roadmap futuro

| # | Feature | Complejidad | Estado |
|---|---------|-------------|--------|
| 1 | ~~Inteligencia Predictiva~~ | Media-Alta | **Implementado v4.0** |
| 2 | ~~Guia Interactiva~~ | Media | **Implementado v4.1** |
| 3 | ~~Seguimiento de Eventos~~ | Alta | **Implementado v5.0** |
| 4 | **RAG para PDFs/Docs** | Alta | Pendiente |
| 5 | **Reportes en Google Slides** | Alta | Pendiente |
| 6 | **Migracion a BigQuery** | Alta | Pendiente |

## Puntos de restauracion

| Version | Commit | Restaurar |
|---------|--------|-----------|
| **v5.0 - Seguimiento de Eventos** | `HEAD` | `git checkout feature/monitor-chat-agent` |
| **v4.1 - Guia interactiva** | `0c7d9cb` | `git checkout 0c7d9cb` |
| **v4.0 - Inteligencia Predictiva** | `21514f1` | `git checkout 21514f1` |
| v3.3 - Sin logos + barras no fijas | `23307d8` | `git checkout 23307d8` |
| v3.0 - 5 pestanas | `a799190` | `git checkout a799190` |

## Para retomar trabajo

1. Abrir VS Code en `C:\Users\Administrador\Funnel`
2. Abrir Claude Code (Ctrl+Shift+P > "Claude Code")
3. Branch activo: `feature/monitor-chat-agent`
4. Archivos clave: `gas-optimizado/codigo.gs` y `gas-optimizado/Dashboard.html`
5. Este README tiene todo el contexto necesario para continuar
