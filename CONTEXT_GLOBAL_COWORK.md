# Contexto Global - FINDEP Control Interno

Documento de contexto para compartir con Claude Cowork u otros agentes AI.
Contiene toda la informacion necesaria para trabajar en los proyectos de Control Interno de FINDEP.

---

## Sobre FINDEP

FINDEP (Financiera Independencia) es una empresa mexicana de microfinanzas que atiende sectores de bajos ingresos y autoempleo en Mexico y EE.UU. Opera 1,500+ microservicios en Google Cloud.

### Sistemas clave

| Nombre | Que es |
|--------|--------|
| TYSON | Plataforma digital |
| GESTIONA | Sistema de cobranza |
| FINDEP Movil | App movil |
| Buro Clientes | Dataset principal en BigQuery |
| 360 | CRM |
| Caja Unica | Sistema de disposiciones (desembolsos de credito en sucursales) |

### Dominios

- **Originacion** - Solicitud y aprobacion de creditos
- **Cobranza** - Recuperacion de pagos (GESTIONA)
- **Core** - Pagos, 360, Transaccional/Bancario
- **Back Office** - Operaciones internas
- **Big Data** - Analitica y reportes (BigQuery)

---

## Preferencias del Usuario

- **Idioma:** Siempre responder en espanol
- **Perfil:** Full Stack con Java, JavaScript, HTML
- **Herramienta favorita:** Google Apps Script + Google Sheets como BD para prototipos y herramientas internas
- **GitHub:** hgalvezb-sketch
- **Email corporativo:** hgalvezb@findep.com.mx

### Tools instalados globalmente

- **clasp** (`@google/clasp`) - Google Apps Script CLI
- **gws** v0.17.0 - Google Workspace CLI (Drive, Sheets, Gmail, Calendar)
- **GCP Project:** `gws-cli-personal-490521` (number: `381061370235`)
- **clasp run habilitado** para ejecucion remota de funciones Apps Script

---

## Proyecto 1: Monitor de Disposiciones (bd_Agent_Disp)

### Que es

Dashboard web (Google Apps Script Web App) que monitorea disposiciones de Caja Unica para detectar fraude, lavado de dinero (PLD) y riesgos operativos en sucursales FINDEP.

### Ubicacion

- **Path local:** `C:\Users\Administrador\Funnel\`
- **Archivos clave:** `gas-optimizado/codigo.gs` (backend) y `gas-optimizado/Dashboard.html` (frontend)
- **Branch activo:** `feature/monitor-chat-agent`

### URLs

| Recurso | URL |
|---------|-----|
| Dashboard DEV | https://script.google.com/a/macros/findep.com.mx/s/AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw/exec |
| Editor Apps Script | https://script.google.com/u/0/home/projects/1naiQhFZB-6qGxCCr7DcTVAPO0Av6qDL4aDqXffiC4YDv4859HcYS9zTY/edit |
| Spreadsheet DEV | https://docs.google.com/spreadsheets/d/1xbYd4b4aSfnCnrVD8VLQGPBiRTeIXAfOxpk9UP6e1c8/edit |
| Spreadsheet PROD | https://docs.google.com/spreadsheets/d/1ADKcPFVvHUlLtR2x_A5f74rdJOZa73p3gEwPq_E338I/edit |
| GitHub | https://github.com/hgalvezb-sketch/Funnel |

### Arquitectura

```
[Trigger cada 10 min] -> [precomputeAll(): Pre-calcula 50k+ filas] -> [Cache JSON chunked en _cache]
[Usuario abre URL]    -> [Lee cache ~200KB]                         -> [Renderiza en 3-5 seg]
[Filtros/Tabla]       -> [Server-side via google.script.run]        -> [Re-agrega desde _dashboard_slim]
[Chat con Agente]     -> [Gemini 2.5 Flash + systemInstruction]     -> [Respuesta contextual]
[Inteligencia Pred.]  -> [Regresion + Z-Score + Bollinger]          -> [Scores predictivos por sucursal]
```

### Hojas internas (auto-generadas)

| Hoja | Funcion |
|------|---------|
| `_dashboard_cache` | JSON pre-computado chunked (KPIs, charts, risks, filters, tabla, predictive) |
| `_dashboard_slim` | Datos reducidos para filtros rapidos (11 cols + flags + rowNum) |
| `_incidencias` | Registro de incidencias con estado y seguimiento (14 columnas) |
| `_historico` | Rolling 60 dias de metricas diarias para modelos predictivos |
| `_usuarios_autorizados` | Control de acceso por email |

### Features implementadas (v4.1)

1. **6 pestanas:** Monitor Operativo, Resumen Ejecutivo, Mapa de Riesgo, Analisis Financiero, Tendencias, Inteligencia Predictiva
2. **10 graficas** con Google Charts
3. **6 KPIs** principales
4. **8 filtros** server-side
5. **Chat flotante con Gemini AI** - Popup draggable, historial multi-turno, entrada de voz (Web Speech API es-MX)
6. **Sistema de incidencias** - CRUD completo con estados Abierta/En Revision/Cerrada
7. **Exportacion a Google Sheets** por seccion
8. **Inteligencia Predictiva** - Regresion lineal, Z-Score, Bollinger, scores compuestos, heatmap, insights Gemini
9. **Guia interactiva** - Tour de 17 pasos
10. **Autenticacion** por email corporativo

### 13 Banderas de riesgo monitoreadas

| Severidad | Banderas |
|-----------|----------|
| **ALTA** | Fuera de horario, +1 mismo dia, Tel repetido distintos contratos, Tel de Colaborador, Contratos en menos de 3 min, Pago SPEI Colab |
| **MEDIA** | Foraneas efectivo, Monto duplicado mismo dia, Disposiciones >24k, REVERSADO |
| **BAJA** | > 120 dias, Calificacion <= 5, En Quincena |

### Inteligencia Predictiva - Detalle completo

El monitor ejecuta cada 10 minutos un pipeline predictivo sobre el historico de 60 dias.

#### 1. Regresion lineal (`linearRegression_`)

- Toma el historico de 60 dias de `_historico`
- Calcula la pendiente (slope) de: tasa de incidencia, total de incidencias, monto total
- **slope positiva** = la metrica esta empeorando. **slope negativa** = mejorando
- **R2 (coeficiente de determinacion):** R2 > 0.7 = tendencia fuerte. R2 0.3-0.7 = moderada. R2 < 0.3 = no confiable
- Proyecta a 7, 14 y 30 dias: "si la tendencia sigue asi, en 30 dias la tasa sera X%"

#### 2. Z-Score (`zScoreAnalysis_`)

- Calcula media y desviacion estandar de cada metrica por sucursal
- **|Z| > 2** = anomalia (comportamiento significativamente diferente al resto)
- **|Z| > 3** = anomalia critica (comportamiento extremo, atencion urgente)
- Se calcula para: tasa de incidencia, monto promedio, frecuencia de operaciones
- Tambien sobre banderas historicas: Fuera de horario, +1 mismo dia, Tel repetido

#### 3. Bandas de Bollinger (`bollingerBands_`)

- Media movil de 7 dias + bandas a +/- 2 desviaciones estandar
- Cuando la metrica actual rompe la banda superior = alerta (pico anomalo)
- Tecnica de mercados financieros adaptada a deteccion de fraude
- Se calcula para tasa de incidencia y total de incidencias

#### 4. Score predictivo por sucursal (0-100) (`computePredictiveData_`)

Combina los 3 modelos + frecuencia de flags:

```
Score = Tendencia(0.35) + Anomalia(0.30) + Bollinger(0.20) + FlagsAlta(0.15)
```

| Score | Nivel | Significado | Accion |
|-------|-------|-------------|--------|
| 0-30 | Verde | Bajo riesgo | Monitoreo rutinario semanal |
| 31-60 | Amarillo | Moderado | Monitoreo diario, revisar en comite |
| 61-80 | Naranja | Alto | Revision presencial en 48h |
| 81-100 | Rojo | Critico | Escalamiento inmediato |

#### 5. Heatmap sucursal vs banderas

Matriz de calor: top 15 sucursales x 8 tipos de flags.
- Patron horizontal (sucursal con muchos tipos) = problema generalizado, candidata a auditoria integral
- Patron vertical (un flag en pocas sucursales) = posible modus operandi, causa sistemica

#### 6. Insights Gemini (`generatePredictiveInsights_`)

Gemini recibe scores, tendencias, anomalias y top 10 sucursales.
Genera reporte con: estado general, alertas criticas, patrones, proyeccion 7-14 dias, acciones recomendadas.

### Agente de Chat - Configuracion

| Propiedad de Script | Valor |
|---------------------|-------|
| `GEMINI_API_KEY` | API Key del proyecto GCP `monitor-gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` |

El agente tiene system prompt con:
- Conocimiento completo de las 13 banderas de riesgo
- Capacidad de interpretar regresion lineal, Z-Score, Bollinger
- Conocimiento de scores predictivos y como priorizarlos
- Contexto dinamico: KPIs, filtros, riesgos, top sucursales, datos predictivos completos
- Reglas: siempre espanol, no revelar PII, clasificar por severidad, acciones concretas

### Deploy

1. `clasp push` (sube archivos desde `gas-optimizado/`)
2. En el Editor de Apps Script: Implementar > Administrar implementaciones > Editar > Nueva version > Implementar
3. El URL `/exec` usa la version desplegada, NO el codigo del editor

### Roadmap pendiente

| # | Feature | Complejidad |
|---|---------|-------------|
| 1 | RAG para PDFs/Docs | Alta |
| 2 | Reportes en Google Slides | Alta |
| 3 | Migracion a BigQuery | Alta |

---

## Proyecto 2: CIRO - Analisis de Estados de Cuenta

### Que es

App web FastAPI para auditoria crediticia. Analiza estados de cuenta PDF de FINDEP, detecta anomalias en tablas de amortizacion y realiza analisis forense con Claude AI.

### Ubicacion

- **Path local:** `C:\Users\Administrador\google-sheets-agent\`
- **Produccion:** https://ciro-estados-cuenta.onrender.com
- **Repo:** https://github.com/hgalvezb-sketch/ciro-analisis-estados-cuenta
- **Local:** `python webapp.py` -> http://127.0.0.1:8080

### Stack

Python 3.11, FastAPI, Google Sheets/Drive API, pdfplumber, Claude API (anthropic SDK), Render.com

### Archivos clave

| Archivo | Funcion |
|---------|---------|
| `webapp.py` | FastAPI app, rutas principales |
| `pdf_analyzer.py` | Extraccion y analisis de estados de cuenta PDF |
| `forensic_analyzer.py` | Analisis forense con Claude API |
| `sheets_service.py` | Google Sheets/Drive API |
| `credit_analyzer.py` | Analisis de bloques 1/2/3 (tablas de amortizacion) |
| `templates/index.html` | UI completa |
| `CIRO.spec` | Config PyInstaller para generar exe |

### Secciones

1. **Bloques 1-3** - Analisis de tablas de amortizacion desde Google Sheets
2. **Analisis PDF** - Estados de cuenta FINDEP en PDF con deteccion de anomalias
3. **Analisis Forense** - Analisis con Claude AI de cualquier archivo de Drive

### Reglas de deteccion de anomalias

- Regla 1: Capital debe AUMENTAR entre pagos (valor absoluto)
- Regla 2: Capital no debe estancarse (valor absoluto)
- Regla 3: Saldo Insoluto no debe repetirse
- **Excepciones** (no marcar como anomalia):
  - Monto == Capital (todo va a capital)
  - Capital == $0 Y Saldo Insoluto igual al anterior (pago residual)
  - Numero de pago repetido consecutivo (pago fraccionado)
  - Valores negativos: comparar en valor absoluto

---

## Proyecto 3: Cedula AROS - Revision de Riesgo Operativo

### Que es

App React para evaluacion de riesgo operativo en sucursales FINDEP. Reemplazo de Google Sheets.

### Ubicacion

- **Path local:** `C:\Users\Administrador\cedula-aros\`
- **Stack:** React 19 + TypeScript + Tailwind + Vite + html2canvas
- **Port dev:** 5174

### Estructura

- **6 modulos:** Control de Valores, Originacion, Expedientes, Cobranza, Cumplimiento, Seguridad de Informacion
- **71 controles/pruebas** con checklist interactivo Cumple/No Cumple
- **Formula de calificacion:** `ROUNDDOWN(CtrlVal*0.30 + Orig*0.20 + Exp*0.10 + Cobr*0.25 + Cump*0.15)`
- **Outputs:** Tablero card 700x400, Slide FISA (rojo), Slide AEF (purpura) — descarga PNG
- **Proyecto independiente** - NO mezclar con Funnel Dashboard

---

## Patrones y tecnicas a considerar

### Google Apps Script + clasp

- Usar `clasp push` para subir, `clasp pull` para bajar, `clasp open` para abrir en navegador
- `clasp run <funcion>` para ejecucion remota (requiere GCP project vinculado + OAuth Desktop)
- Setup: vincular proyecto GCP al script, habilitar Apps Script API, crear OAuth Client tipo Desktop

### Google Sheets como BD

- Alternativa preferida para prototipos, herramientas internas y soluciones rapidas
- Para busqueda semantica/RAG sobre datos en Sheets: usar `gemini-embedding-2-preview`

### Estandares de Dashboards FINDEP

- Autenticacion por email corporativo
- Control de acceso via hoja `_usuarios_autorizados`
- Pre-agregacion server-side (no enviar datos crudos al cliente)
- Cache chunked para JSON > 50K chars/celda
- Sanitizacion XSS en todo output HTML
- Nunca loguear PII (nombres, telefonos, CURP, RFC)

### Principios de desarrollo

- **Make it work, make it right, make it fast** (en ese orden)
- **No big-bangs** - Trabajo iterativo pequeno
- **You build it, you run it**
- **Document the WHY**
- POC/Experiment: marcar con `poc/` branch prefix y `[POC]` en commits

---

## Seguridad y compliance

- **Nunca loguear PII** - No datos de clientes en logs o mensajes de error
- **No cross-service DB access** - Cada servicio es dueno de sus datos
- **Tokenizar PII** en ambientes no productivos
- **Compliance:** LFPDPPP (Mexico), BSA/AML (operaciones en EE.UU.)
- **Umbral PLD:** Disposiciones > $24,000 MXN requieren reporte

---

## Git workflow

- **Nunca push a master directo** - Siempre feature branch + PR
- **Branch naming:** `feature/WI-[ID]-descripcion` o `fix/WI-[ID]-descripcion`
- **POC branches:** `poc/descripcion` con `[POC]` en commits
- **Commit format:** `#[WorkItemId]: descripcion` (o `[POC] descripcion` para experimentos)
- **CI/CD:** Azure DevOps
