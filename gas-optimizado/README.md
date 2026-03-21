# Monitor de Disposiciones v3.3 - FINDEP

Dashboard de monitoreo de disposiciones de Caja Unica para FINDEP. Google Apps Script Web App con arquitectura de pre-agregacion server-side, agente de analisis con Gemini AI, sistema de incidencias, exportacion de reportes y entrada de voz.

## URLs del proyecto

### Produccion (v1.0)

| Recurso | URL |
|---------|-----|
| **Dashboard (ejecutable)** | https://script.google.com/a/macros/findep.com.mx/s/AKfycbwbCF2EtDit2Azfhrl5OBqCOCh6il_WdL7s-vmgaV6fK4RgChVWpkQmMm5-IpfUZr5G/exec |
| **Spreadsheet** | https://docs.google.com/spreadsheets/d/1ADKcPFVvHUlLtR2x_A5f74rdJOZa73p3gEwPq_E338I/edit |

### Desarrollo (v3.3)

| Recurso | URL |
|---------|-----|
| **Dashboard v3.3** | https://script.google.com/a/macros/findep.com.mx/s/AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw/exec |
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
```

### Hojas internas (auto-generadas)

| Hoja | Funcion | Creada por |
|------|---------|------------|
| `_dashboard_cache` | JSON pre-computado chunked (KPIs, charts, risks, filters, tabla) | `precomputeAll()` |
| `_dashboard_slim` | Datos reducidos para filtros rapidos (11 cols + flags + rowNum) | `precomputeAll()` |
| `_incidencias` | Registro de incidencias con estado y seguimiento (14 columnas) | `ensureIncidenciasSheet_()` |

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

## Archivos

- `gas-optimizado/codigo.gs` - Backend Apps Script (pre-agregacion, filtros, tabla, chat Gemini, incidencias, exportacion)
- `gas-optimizado/Dashboard.html` - Frontend (10 graficas, 6 KPIs, 8 filtros, chat flotante con voz, incidencias, exportacion)

## Features v2.0 (nuevas - 2026-03-19)

### 1. Chat Flotante (Popup)

El agente de IA ahora es un popup flotante que no bloquea la vista del dashboard.

- **FAB** (Floating Action Button): Boton purpura fijo en esquina inferior derecha
- **Popup draggable**: 400x520px, arrastrable por el header
- **Badge de notificacion**: Indica mensajes nuevos cuando esta cerrado
- **Entrada de voz**: Boton de microfono con Web Speech API (es-MX), transcribe y envia automaticamente
- **Misma funcionalidad**: Historial multi-turno, sugerencias, contexto dinamico

### 2. Formulario de Captura de Incidencias

Modal de registro accesible desde el boton "Registrar Incidencia" en la barra superior.

**Campos del formulario:**
- Sucursal (combo poblado desde datos)
- Contrato y Folio (texto)
- Tipo de hallazgo: Control / Proceso / Riesgo
- Severidad: Alta / Media / Baja
- Descripcion del hallazgo
- Accion recomendada
- Responsable
- Fecha compromiso

**Validacion:** Tipo, Severidad y Descripcion son obligatorios.

**Backend:** `registrarIncidencia()` escribe en hoja `_incidencias` con ID auto-generado (`INC-YYYYMMDD-NNNN`).

### 3. Seguimiento de Incidencias

Seccion dedicada en el dashboard con:

- **4 KPIs mini**: Abiertas, En Revision, Cerradas, Vencidas
- **Filtros**: Por tipo, severidad, estado
- **Tabla interactiva** con botones de cambio de estado:
  - Abierta -> En Revision (boton "Revisar")
  - En Revision -> Cerrada (boton "Cerrar")
- **Deteccion de vencidas**: Compara fecha compromiso con fecha actual
- **Boton Actualizar**: Recarga datos de incidencias

**Backend:** `getIncidencias()` y `updateIncidenciaEstado()`.

### 4. Exportacion de Secciones a Google Sheet

Cada seccion del dashboard tiene un boton de descarga (flecha abajo) en la esquina superior derecha.

**Secciones exportables:**
- KPIs (resumen de indicadores)
- 10 graficos individuales (datos subyacentes de cada chart)
- Analisis de riesgos (tabla de riesgos detectados)
- Seguimiento de incidencias (todas las incidencias)
- Tabla de detalle (registros)

**Backend:** `exportSectionToSheet()` crea un Google Sheet nuevo via `SpreadsheetApp.create()` (no requiere permisos de Drive) y lo abre en nueva pestana. El archivo se crea en la raiz de Google Drive del usuario.

### 5. Entrada de Voz

Boton de microfono en el chat flotante para dictar preguntas al agente.

- **Web Speech API** con idioma `es-MX`
- **Resultados intermedios** mostrados en tiempo real mientras se habla
- **Envio automatico** al terminar de hablar
- **Indicador visual**: Boton rojo con animacion de pulso mientras graba
- **Compatibilidad**: Chrome y Edge (muestra mensaje si no es compatible)

## Agente de Chat - Gemini AI

### Configuracion actual (produccion)

| Propiedad de Script | Valor | Descripcion |
|---------------------|-------|-------------|
| `GEMINI_API_KEY` | `AIzaSy...` | API Key del proyecto GCP `monitor-gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modelo Gemini (configurable) |

### Funcionalidades del agente
- **System prompt FINDEP** con contexto de microfinanzas y 13 banderas de riesgo
- **`systemInstruction`** como campo separado del payload Gemini (endpoint v1beta)
- **Historial multi-turno** (ultimos 6 mensajes)
- **Contexto dinamico** enriquecido: KPIs, filtros activos, riesgos, top sucursales, banderas
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

### Paso a paso
1. Abrir el **Editor de Apps Script** (URL arriba)
2. Seleccionar **Codigo.gs** > Ctrl+A > pegar contenido de `gas-optimizado/codigo.gs`
3. Seleccionar **Dashboard.html** > Ctrl+A > pegar contenido de `gas-optimizado/Dashboard.html`
4. Guardar con **Ctrl+S**
5. Ejecutar **`setupTrigger()`** una vez (seleccionar en dropdown de funciones > Ejecutar)
   - Esto crea `_dashboard_cache`, `_dashboard_slim` e `_incidencias` y configura trigger cada 10 min
6. **Implementar > Administrar implementaciones > Editar (lapiz) > Nueva version > Implementar**

**CRITICO:** Despues de pegar codigo, SIEMPRE crear nueva version en el paso 6. El URL `/exec` usa la version desplegada, NO el codigo guardado en el editor.

### Configurar API Key de Gemini (requerido para el chat)
1. En el Editor de Apps Script: **Configuracion** (engranaje) > **Propiedades de script**
2. Agregar propiedades:
   - `GEMINI_API_KEY` = tu API key (formato `AIzaSy...`)
   - `GEMINI_MODEL` = `gemini-2.5-flash`
3. Obtener key en: https://aistudio.google.com/apikey
4. La key debe pertenecer a un proyecto GCP con facturacion habilitada

### Errores comunes

| Error | Causa | Solucion |
|-------|-------|----------|
| "API Key de Gemini no configurada" | Falta la propiedad de script | Agregar `GEMINI_API_KEY` en Propiedades de script |
| "You exceeded your current quota, limit: 0" | Key de proyecto sin facturacion | Crear API key en proyecto GCP con facturacion habilitada |
| "Error aplicando filtros: undefined" | Version desplegada desactualizada | Crear nueva version: Implementar > Administrar > Editar > Nueva version |
| "Sin datos en cache" al filtrar | Hoja `_dashboard_slim` no existe | Ejecutar `setupTrigger()` en el editor de Apps Script |
| "No cuentas con el permiso para llamar a DriveApp" | `exportSectionToSheet` usaba DriveApp | Corregido en v2.0: ahora usa solo `SpreadsheetApp.create()` |
| "Tu navegador no soporta entrada de voz" | Navegador sin Web Speech API | Usar Chrome o Edge |

## Bugs corregidos

### v1.0 - Rondas 1-4 (2026-03-16)
1. flagStartIdx apuntaba a columnas incorrectas (CRITICO)
2. Cache JSON chunked para >50K chars/celda (CRITICO)
3. Busqueda general no implementada en getTablePage
4. HTML injection via `</script>` en JSON embebido
5. Funciones JS faltantes + chat history + contexto Gemini mejorado
6. 7 vulnerabilidades XSS
7. Montos negativos en categoria "Negativo"
8. Edades invalidas (<18) en categoria "N/D"
9. Gauge max dinamico
10. Batch read inteligente
11. CHAT_BUSY flag anti-doble-envio
12. Error handling para DB vacio
13. Package 'bar' removido de Google Charts
14. Graficas responsivas
15. Listener `window.resize`
16. Chart cards con flexbox
17. Modelo leido de Script Properties
18. Pagina de carga si no hay cache
19. ensureTriggerExists_() async
20. try/catch en getFilteredDashboard()
21. Mejor manejo de error en applyFilters()
22. Migracion a gemini-2.5-flash
23. API Key migrada a proyecto GCP con facturacion

### v2.0 - Nuevas features (2026-03-19)
24. Chat flotante popup draggable con FAB y badge de notificacion
25. Modal de registro de incidencias con validacion
26. Seccion de seguimiento de incidencias con KPIs, filtros y cambio de estado
27. Botones de exportacion a Google Sheet en cada seccion del dashboard
28. Hoja `_incidencias` con CRUD completo (14 columnas)
29. Funcion `exportSectionToSheet()` sin DriveApp (solo SpreadsheetApp.create)
30. Toast notifications para feedback visual
31. Entrada de voz con Web Speech API (es-MX) en chat flotante
32. Fix error de permisos DriveApp.getRootFolder() en exportacion

### v3.3 - Ajustes UI (2026-03-20)
33. Logos SVG incorrectos removidos de la barra superior
34. Barra superior, filtros y pestanas ya no son sticky/fixed (se desplazan con scroll)

## Plan v4.0 - Pestana Inteligencia Predictiva

Nueva pestana en el monitor que combina modelos estadisticos clasicos con analisis de Gemini AI para detectar patrones de riesgo antes de que se materialicen.

### Arquitectura hibrida (Nivel 1 + Nivel 2)

```
[precomputeAll()] -> [Regresion lineal + Z-Score + Media movil] -> [Scores predictivos]
                  -> [Gemini 2.5 Flash] -> [Interpretacion + alertas en lenguaje natural]
                  -> [Cache en _cache] -> [Pestana "Inteligencia Predictiva"]
```

### Componentes del backend (`codigo.gs`)

#### 1. Regresion lineal por sucursal
- Funcion: `computeLinearRegression_(histData, sucursal, metrica)`
- Calcula pendiente (slope) y R2 sobre datos de `_historico` (rolling 60 dias)
- Metricas: tasa de incidencia, monto promedio, conteo de flags
- Proyeccion a 7, 14 y 30 dias
- Si la pendiente es positiva y R2 > 0.5: sucursal en tendencia ascendente de riesgo

#### 2. Deteccion de anomalias (Z-Score)
- Funcion: `computeAnomalyScores_(allData, COL, sucTotal)`
- Calcula Z-Score para cada sucursal en: monto promedio, tasa de incidencia, frecuencia de operaciones
- Umbral: |Z| > 2.0 = anomalia, |Z| > 3.0 = anomalia critica
- Detecta operaciones atipicas en tiempo real (hora, monto, frecuencia)

#### 3. Media movil + Bandas de Bollinger
- Funcion: `computeBollingerBands_(histData, ventana, desviaciones)`
- Ventana: 7 dias (corto plazo) y 14 dias (mediano plazo)
- Bandas: +/- 2 desviaciones estandar
- Alerta cuando la metrica actual rompe la banda superior

#### 4. Indice de riesgo compuesto (Risk Score Predictivo)
- Funcion: `computePredictiveRiskScore_(sucursal, regression, anomaly, bollinger)`
- Formula ponderada:
  - Tendencia regresion (peso 0.35)
  - Z-Score anomalia (peso 0.30)
  - Ruptura de Bollinger (peso 0.20)
  - Concentracion de flags alta severidad (peso 0.15)
- Resultado: score 0-100 por sucursal
- Clasificacion: Verde (0-30), Amarillo (31-60), Naranja (61-80), Rojo (81-100)

#### 5. Analisis predictivo con Gemini
- Funcion: `generatePredictiveInsights_(predictiveData)`
- Alimenta Gemini con: scores, tendencias, anomalias, historico
- System prompt especializado en modelos predictivos y prevencion
- Gemini genera:
  - Interpretacion de patrones detectados
  - Correlaciones entre sucursales (posible contagio de modus operandi)
  - Alertas en lenguaje natural con nivel de confianza
  - Recomendaciones accionables priorizadas

### Componentes del frontend (`Dashboard.html`)

#### Pestana "Inteligencia Predictiva" (6ta pestana)

| Seccion | Contenido |
|---------|-----------|
| **Semaforo predictivo** | Grid de sucursales con color Verde/Amarillo/Naranja/Rojo segun score predictivo |
| **Top 10 riesgo futuro** | Tabla: sucursal, score, tendencia (flecha), proyeccion 7/14/30 dias |
| **Grafica de tendencias** | Linea temporal con bandas de Bollinger y proyeccion punteada |
| **Mapa de calor de anomalias** | Heatmap sucursal vs tipo de flag, intensidad por Z-Score |
| **Alertas Gemini** | Cards con alertas generadas por IA, nivel de confianza y accion recomendada |
| **Correlaciones** | Sucursales con patrones similares (posible propagacion de riesgo) |

### Plan de implementacion

| Paso | Tarea | Estimacion |
|------|-------|------------|
| 1 | Agregar funciones de regresion lineal y Z-Score en `codigo.gs` | Backend |
| 2 | Agregar media movil y Bollinger en `codigo.gs` | Backend |
| 3 | Crear `computePredictiveData_()` que integre los 4 modelos | Backend |
| 4 | Agregar llamada a Gemini con prompt predictivo especializado | Backend |
| 5 | Incluir datos predictivos en `precomputeAll()` -> cache | Backend |
| 6 | Crear pestana "Inteligencia Predictiva" en `Dashboard.html` | Frontend |
| 7 | Renderizar semaforo, tabla top 10, graficas y alertas | Frontend |
| 8 | Testing y calibracion de umbrales con datos reales | QA |

### Consideraciones tecnicas

- **Tiempo de ejecucion:** `precomputeAll()` tiene limite de 6 min en Apps Script. Los calculos estadisticos son O(n) por sucursal, factible con ~10k registros
- **Historico:** Requiere al menos 7 dias de datos en `_historico` para regresion significativa. Con 60 dias rolling es optimo
- **Gemini:** Una llamada adicional por ciclo de precomputo (~2 seg). Se cachea el resultado
- **Sin dependencias externas:** Todo corre en vanilla JavaScript (Apps Script). No requiere librerias de ML
- **Datos sensibles:** Los scores son agregados por sucursal, no exponen datos de clientes individuales

### Tecnicas avanzadas (Nivel 3 - futuro, requiere Python/BigQuery)

| Tecnica | Ventaja | Requisito |
|---------|---------|-----------|
| Isolation Forest | Detecta fraude sin datos etiquetados | Python + scikit-learn |
| Prophet (Meta) | Forecasting con estacionalidad | Python + prophet |
| XGBoost + SHAP | Explica POR QUE una operacion es riesgosa | Python + xgboost + shap |
| Graph Neural Networks | Detecta redes de colusion entre sucursales/operadores | Python + PyTorch Geometric |

Estas tecnicas se ejecutarian como Cloud Functions o en Vertex AI, alimentando resultados de vuelta al Sheet.

## Roadmap futuro (evaluado 2026-03-20)

Priorizado por valor e impacto:

| # | Feature | Complejidad | Requisitos |
|---|---------|-------------|------------|
| 1 | **Inteligencia Predictiva (v4.0)** | Media-Alta | Datos historicos en `_historico` (min 7 dias), Gemini API |
| 2 | **RAG para PDFs/Docs** | Alta | Gemini puede recibir contenido extraido como contexto |
| 3 | **Reportes en Google Slides** | Alta | Slides API disponible desde GAS |
| 4 | **Migracion a BigQuery** | Alta | Permisos: `bigquery.dataViewer`, `bigquery.dataEditor`, `bigquery.jobUser` en proyecto `ws-ctrol-interno` |

### Migracion a BigQuery - Permisos necesarios

Para migrar de Sheets a BigQuery como backend:
- **Dataset existente:** `ws-ctrol-interno.CAJA_UNICA.disposicion`
- **Roles IAM necesarios:** `bigquery.dataViewer` + `bigquery.dataEditor` + `bigquery.jobUser`
- **Opcion hibrida:** Lectura de BigQuery + escritura de incidencias en Sheets (no requiere permisos de escritura en BQ)
- **El frontend no cambia** - la migracion es transparente para el usuario

## Puntos de restauracion

| Version | Commit | Restaurar |
|---------|--------|-----------|
| **v3.3 - Sin logos + barras no fijas** | pendiente | `git checkout feature/monitor-chat-agent` |
| v2.0 - Chat flotante + Incidencias + Export + Voz | pendiente | ver commits anteriores |
| v1.0 - Monitor + Chat + Filtros fix | pendiente | ver commits anteriores |
| Monitor pre-fix filtros | `a3a62a7` | `git checkout a3a62a7` |
| Monitor pre-agentes | `d3ffaff` | `git checkout d3ffaff` |
| Monitor chat agent | `703832f` | `git checkout 703832f` |

## Para retomar trabajo

1. Abrir VS Code en `C:\Users\Administrador\Funnel`
2. Abrir Claude Code (Ctrl+Shift+P > "Claude Code")
3. Branch activo: `feature/monitor-chat-agent`
4. Archivos clave: `gas-optimizado/codigo.gs` y `gas-optimizado/Dashboard.html`
5. Este README tiene todo el contexto necesario para continuar
