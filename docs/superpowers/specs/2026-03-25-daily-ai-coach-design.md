# Daily AI Coach — Design Spec

**Fecha:** 2026-03-25
**Autor:** hgalvezb
**Estado:** Draft

---

## Objetivo

Sistema automatizado que cada dia:
1. Captura el correo Daily AI Digest al llegar
2. Analiza profundamente el contenido (incluyendo transcripts de videos)
3. Escanea Google Sheets del usuario (fijos + autodescubiertos via Drive)
4. Genera propuestas de mejora contextualizadas a proyectos existentes
5. Presenta todo interactivamente en la terminal de Claude Code
6. Genera un Google Doc listo para NotebookLM (podcast con dos voces)
7. Mantiene un backlog persistente de ideas (Sheet + archivo local)

## Decisiones de diseno

- **Enfoque:** Hibrido — Pipeline Python (Render) + Skill Claude Code
- **Analisis IA:** Claude API (Sonnet) para profundidad estrategica
- **Audio:** Google Doc optimizado para NotebookLM (gratis, mejor calidad)
- **Hosting:** Render.com free tier (mismo patron que CIRO)
- **Backlog:** Google Sheet como fuente de verdad + JSON local como cache
- **Descubrimiento Sheets:** Lista fija inicial + autodescubrimiento via Drive API

## Arquitectura General

```
[Apps Script Trigger cada 10 min]
  - Detecta email "Daily AI Digest" sin label "AI_Coach_Processed"
  - Extrae HTML del correo
  - POST /webhook/digest a Render
      |
      v
[Pipeline Python en Render]
  1. Parsear digest (extraer video URLs + RSS)
  2. Extraer transcripts (youtube-transcript-api)
  3. Barrido Google Sheets (fijos + Drive API autodescubrimiento)
  4. Analisis con Claude API (genera 5 propuestas + plan)
  5. Crear Google Doc para NotebookLM
  6. Depositar resultados (Sheet "Banco de Ideas" + JSON en GitHub)
      |
      v
[Claude Code Terminal]
  - Hook sesion: notifica si hay propuestas nuevas
  - Skill /daily-coach: presenta, elige, implementa
```

## Sub-proyectos

| # | Sub-proyecto | Tecnologia | Dependencia |
|---|-------------|-----------|-------------|
| 1 | Pipeline Python | FastAPI + Claude API + Google APIs en Render | Ninguna |
| 2 | Trigger Apps Script | Extension de gas-daily-digest | Pipeline corriendo |
| 3 | Skill /daily-coach | Claude Code skill + hook | Pipeline corriendo |
| 4 | Agente Gemini Calculadora | Apps Script + Gemini API | Independiente |

**Orden de implementacion:** 1 > 2 > 3 > 4

---

## Sub-proyecto 1: Pipeline Python (Render)

### Repo y Stack

- **Repo:** `daily-ai-coach` (nuevo repo en GitHub, separado de Funnel)
- **Stack:** Python 3.11, FastAPI, Claude API, Google APIs (Drive, Sheets, Docs)
- **Deploy:** Render.com free tier
- **GitHub user:** hgalvezb-sketch

### Endpoints

| Endpoint | Metodo | Funcion |
|----------|--------|---------|
| `/webhook/digest` | POST | Recibe el digest desde Apps Script |
| `/status` | GET | Health check + ultima ejecucion |
| `/results/latest` | GET | Devuelve ultimo JSON de propuestas |

### Flujo del Pipeline

#### Step 1: Parsear Digest

- Input: HTML del correo Daily AI Digest
- Extraer URLs de YouTube (regex o BeautifulSoup)
- Extraer titulos, canales, links RSS
- Output: lista de video_ids + metadata

#### Step 2: Extraer Transcripts

- Libreria: `youtube-transcript-api` (Python, gratis, sin API key)
- Idioma preferido: espanol > fallback ingles
- Si un transcript falla > continuar con los demas
- Output: `{video_id: transcript_text}` para cada video

#### Step 3: Barrido Google Sheets

**Sheets fijos (siempre):**
- Calculadora AI & CI & RO: `14B1kpFukGQ0guGfYMmfnOInAi4TQDDjwla9dyFodavM`
- bd_Agent_Disp v2: `1xbYd4b4aSfnCnrVD8VLQGPBiRTeIXAfOxpk9UP6e1c8`

**Autodescubrimiento (Drive API):**
- Listar Sheets modificados en ultimos 7 dias
- Filtrar por owner = hgalvezb@findep.com.mx
- Leer nombres de pestanas + headers de cada uno
- Maximo 10 Sheets adicionales para no exceder cuota

**Output por Sheet:**
- Nombre del archivo
- Pestanas con sus headers
- Ultimas filas modificadas (resumen, no datos completos)

#### Step 4: Analisis con Claude API

- **Modelo:** claude-sonnet-4-6
- **Prompt incluye:**
  - Transcripts de videos del dia
  - Estado actual de cada Sheet escaneado
  - Perfil del usuario (FINDEP, stack, proyectos conocidos)
  - Backlog existente (ideas previas no implementadas)
- **Output estructurado (JSON):**

```json
{
  "fecha": "2026-03-25",
  "resumen_dia": "Resumen de 2-3 lineas del digest",
  "propuestas": [
    {
      "id": 1,
      "titulo": "Titulo descriptivo",
      "descripcion": "Que implementar concretamente (2-3 lineas)",
      "sheet_relacionado": "Nombre del Sheet",
      "video_fuente": "Titulo del video que inspira",
      "impacto": "alto|medio|bajo",
      "esfuerzo": "1h|4h|1d|3d",
      "plan_rapido": ["paso 1", "paso 2", "paso 3"],
      "motivacion": "Por que arrancar HOY con esto"
    }
  ],
  "proyecto_recomendado": 1,
  "guion_notebooklm": "Texto largo optimizado para NotebookLM..."
}
```

- Genera exactamente 5 propuestas
- `proyecto_recomendado` indica el indice de la mejor propuesta

#### Step 5: Google Doc para NotebookLM

- Crea un Google Doc en Drive (carpeta "Daily AI Coach")
- Titulo: "Daily AI Coach -- YYYY-MM-DD"
- Contenido optimizado para que NotebookLM genere buen podcast:
  - Seccion 1 "Contexto": quien es el usuario, que proyectos tiene, stack tecnologico
  - Seccion 2 "Lo que paso hoy": resumen del digest con insights clave de los transcripts
  - Seccion 3 "Tus proyectos hoy": estado actual de los Sheets escaneados, que cambio, que destaca
  - Seccion 4 "5 Ideas para ti": las propuestas con detalle, motivacion y conexion digest-proyectos
  - Seccion 5 "Mi recomendacion": por que la propuesta recomendada es la mejor para hoy
  - Seccion 6 "Plan de accion": pasos concretos para arrancar la implementacion
- Formato: prosa narrativa (no listas ni tablas) para que NotebookLM lo convierta en dialogo natural
- Longitud: 1500-2500 palabras (optimo para podcast de 3-5 min)
- Tono: entusiasta pero concreto, como un mentor tecnico hablando con un colega
- El link al Doc se incluye en el JSON de resultados

#### Step 6: Depositar Resultados

**Google Sheet "Banco de Ideas":**
- Sheet nuevo dedicado (crear en setup)
- Una fila por propuesta con columnas:
  - fecha_digest, id, titulo, descripcion, sheet_relacionado
  - video_fuente, impacto, esfuerzo, estado, fecha_estado
- Columna `estado`: pendiente | en_progreso | completado | descartado

**JSON en GitHub (via GitHub API):**
- `results/latest.json` -- siempre el mas reciente (sobreescribe)
- `results/YYYY-MM-DD.json` -- historico (acumula)
- Incluye link al Google Doc

### Credenciales (env vars en Render)

| Variable | Fuente |
|----------|--------|
| `ANTHROPIC_API_KEY` | Claude API |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account del GCP project gws-cli-personal-490521 |
| `GITHUB_TOKEN` | Para escribir JSON al repo daily-ai-coach |
| `WEBHOOK_SECRET` | Para validar que el POST viene de Apps Script |

### Costos estimados mensuales

| Servicio | Costo |
|----------|-------|
| Render free tier | $0 |
| Claude Sonnet (~4K tokens/dia) | ~$1-2 |
| YouTube Transcript API | $0 |
| Google APIs (Drive, Sheets, Docs) | $0 |
| NotebookLM | $0 |
| **Total** | **~$1-2/mes** |

### Estructura del proyecto

```
daily-ai-coach/
├── app/
│   ├── main.py              # FastAPI app, endpoints
│   ├── digest_parser.py     # Step 1: parsear HTML del digest
│   ├── transcripts.py       # Step 2: extraer transcripts YouTube
│   ├── sheets_scanner.py    # Step 3: barrido Google Sheets
│   ├── analyzer.py          # Step 4: analisis Claude API
│   ├── doc_generator.py     # Step 5: crear Google Doc
│   ├── results_writer.py    # Step 6: escribir Sheet + GitHub
│   └── config.py            # Settings y constantes
├── results/
│   └── latest.json          # Cache local del ultimo resultado
├── requirements.txt
├── render.yaml
├── .env.example
└── README.md
```

---

## Sub-proyecto 2: Trigger Apps Script

Extension minima del proyecto `gas-daily-digest` existente. ~30 lineas adicionales.

### Funcion: onDigestArrive()

```
1. Buscar emails con subject contiene "Daily AI Digest"
   que NO tengan label "AI_Coach_Processed"
2. Extraer HTML body del correo
3. POST a Render /webhook/digest con:
   {
     html_content: "<html>...",
     date: "2026-03-25",
     subject: "Daily AI Digest -- 25 Mar 2026",
     secret: WEBHOOK_SECRET
   }
4. Si Render responde 200 -> aplicar label "AI_Coach_Processed"
5. Si falla -> no aplicar label (reintentara en proximo trigger)
```

### Trigger

- `ScriptApp.newTrigger('onDigestArrive').timeBased().everyMinutes(10).create()`
- El digest llega ~8 AM, se procesa entre 8:00 y 8:10

### Script Properties adicionales

| Property | Valor |
|----------|-------|
| `COACH_WEBHOOK_URL` | URL del endpoint Render |
| `COACH_WEBHOOK_SECRET` | Secreto compartido |

---

## Sub-proyecto 3: Skill /daily-coach

### Hook de sesion (al iniciar Claude Code)

- Lee `results/latest.json` del repo local
- Si hay resultados de HOY no vistos:
  - Muestra: "Tu Daily AI Coach tiene 5 propuestas nuevas. Escribe /daily-coach para verlas."
- Si no hay resultados nuevos: silencio

### Skill /daily-coach

**Fase 1: Presentacion**
- Lee results/latest.json
- Muestra resumen del digest (2-3 lineas)
- Presenta las 5 propuestas en tabla:

```
| # | Propuesta              | Sheet relacionado  | Impacto | Esfuerzo |
|---|------------------------|--------------------|---------|----------|
| 1 | ...                    | Calculadora RO     | Alto    | 4h       |
|*2 | ...                    | bd_Agent_Disp      | Alto    | 1h       |
```

(*= recomendada por el agente)

- Link al Google Doc para NotebookLM

**Fase 2: Eleccion**
- Pregunta: "Con cual arrancamos hoy? (numero, o 'ninguna')"
- Usuario elige un numero:
  - Expande el plan_rapido a detalle
  - Las no elegidas se marcan como "descartadas" en Sheet via gws CLI
- Usuario dice "ninguna":
  - Todas se marcan como "descartadas" en el Sheet

**Fase 3: Implementacion**
- Invoca el skill writing-plans con el plan de la propuesta elegida
- Arranca a implementar de inmediato en la misma sesion

### Archivos

```
skills/daily-coach/
├── daily-coach.md         # Definicion del skill
└── session-hook.md        # Instrucciones para el hook
```

### Configuracion en settings.json

Hook pre-session que verifica si hay resultados nuevos y notifica.

---

## Sub-proyecto 4: Agente Gemini en Calculadora de Riesgos

**Spreadsheet:** `14B1kpFukGQ0guGfYMmfnOInAi4TQDDjwla9dyFodavM`
**Independiente** de los sub-proyectos 1-3. Se implementa despues.

### Sidebar Chat

- Panel lateral HTML + JS embebido en el Sheet
- Campo de texto libre para preguntas en lenguaje natural
- Ejemplos de preguntas:
  - "Que sucursales tienen FPD > 5%?"
  - "Compara el riesgo operativo de marzo vs febrero"
  - "Que tendencia tiene la cartera vencida?"
- Flujo:
  1. Lee la pregunta del usuario
  2. Lee datos relevantes del Sheet (pestanas activas)
  3. Envia a Gemini 2.5 Flash con contexto de los datos
  4. Gemini responde con analisis + referencia a celdas
  5. Muestra respuesta en el sidebar
- Historial de conversacion dentro de la sesion

### Menu "AI Coach"

| Opcion | Funcion |
|--------|---------|
| Abrir Chat | Abre el sidebar conversacional |
| Analizar Tendencias | Analisis automatico de ultimas semanas |
| Alertas de Riesgo | Identifica valores fuera de rango |
| Generar Reporte | Resumen ejecutivo en pestana nueva |
| Sugerir Mejoras | Propuestas basadas en datos actuales |

### Credenciales

- `GEMINI_API_KEY` en Script Properties (reusar la del digest)
- No requiere service account -- usa OAuth del usuario

### Estructura

```
(dentro del mismo Spreadsheet, bound script)
├── sidebar.html          # UI del chat
├── menu.gs               # Menu + funciones de los botones
└── gemini-agent.gs       # Llamadas a Gemini API + contexto
```

### Conexion con Daily AI Coach

Cuando el pipeline central genera propuestas relacionadas a la Calculadora de Riesgos, el plan de implementacion puede incluir cambios directos a este agente.

---

## Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| Transcript de un video falla | Continuar con los demas, nota en el JSON |
| Claude API falla | Reintentar 1 vez, si falla guardar error en JSON |
| Drive API sin resultados nuevos | Usar solo Sheets fijos |
| Google Doc no se puede crear | Incluir el guion como texto plano en el JSON |
| Webhook no llega | El trigger reintenta cada 10 min |
| Render esta caido | Apps Script no aplica label, reintenta |
| Sheet Banco de Ideas falla | Log error, el JSON en GitHub es suficiente |

## Setup inicial (una vez)

1. Crear repo `daily-ai-coach` en GitHub
2. Crear service account en GCP project `gws-cli-personal-490521`
3. Compartir los Sheets fijos con el service account
4. Crear carpeta "Daily AI Coach" en Google Drive
5. Crear Sheet "Banco de Ideas" con headers definidos
6. Deploy en Render con env vars configuradas
7. Agregar `onDigestArrive()` al gas-daily-digest + trigger
8. Crear skill /daily-coach + hook de sesion
9. Validar flujo end-to-end con un digest de prueba
