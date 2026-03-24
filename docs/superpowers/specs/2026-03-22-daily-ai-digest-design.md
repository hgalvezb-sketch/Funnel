# Daily AI Digest — Design Spec

**Fecha:** 2026-03-22
**Autor:** hgalvezb
**Estado:** Reviewed

---

## Objetivo

Crear un sistema automatizado en Google Apps Script que envíe un correo diario a las 8 AM con:
1. Videos relevantes de suscripciones de YouTube del usuario
2. Búsqueda de novedades sobre Claude/IA en YouTube
3. Noticias de RSS (blog Anthropic, GitHub releases)
4. Resumen curado por Gemini AI

## Decisiones de diseño

- **Enfoque:** Apps Script standalone (proyecto nuevo, aislado de bd_Agent_Disp)
- **GCP Project:** `gws-cli-personal-490521`
- **Formato email:** Digest compacto (links + resumen Gemini 2-3 párrafos)
- **Destinatario:** `hgalvezb@findep.com.mx`

## Arquitectura

```
[Trigger diario 8AM CST]
    -> getSubscriptionVideos()     // YouTube API: suscripciones filtradas por keywords
    -> searchNewVideos()           // YouTube API: búsqueda por keywords (últimas 24h)
    -> fetchRSSNews()              // UrlFetchApp: blog Anthropic, GitHub releases
    -> deduplicar resultados       // Por videoId
    -> generateGeminiSummary()     // Gemini 2.5 Flash: resumen curado
    -> buildEmailHTML()            // HTML con estilos inline
    -> GmailApp.sendEmail()        // Enviar digest
```

## Estructura del proyecto

```
gas-daily-digest/
├── appsscript.json        # Manifest con scopes OAuth + YouTube Advanced Service
├── main.gs                # sendDailyDigest(), setupTrigger(), testDigest()
├── youtube.gs             # getSubscriptionVideos(), searchNewVideos()
├── sources.gs             # fetchRSSNews(), generateGeminiSummary()
├── email.gs               # buildEmailHTML()
└── .clasp.json            # Script ID del nuevo proyecto
```

## Script Properties

| Property | Descripción |
|----------|-------------|
| `YOUTUBE_API_KEY` | API Key de YouTube Data API v3 (proyecto GCP gws-cli-personal) |
| `GEMINI_API_KEY` | API Key de Gemini |
| `RECIPIENT_EMAIL` | `hgalvezb@findep.com.mx` |

## Keywords de búsqueda

```javascript
const KEYWORDS = [
  "Claude Code", "Claude AI", "Anthropic",
  "AI agents", "LLM", "AI coding",
  "Cursor", "GitHub Copilot", "MCP servers",
  "AI automation", "Google AI", "OpenAI"
];
```

## Componentes

### 1. getSubscriptionVideos()

- Usa **YouTube Advanced Service** (`YouTube.Subscriptions.list`) con OAuth implícito
- Llama `YouTube.Subscriptions.list('snippet', {mine: true, maxResults: 50})`
- Obtiene IDs de canales suscritos
- **Estrategia de cuota:** NO hacer `search.list` por cada canal (100 unidades c/u)
  - En su lugar, usar `YouTube.Activities.list('snippet,contentDetails', {channelId: X, publishedAfter: <24h>})` (1 unidad por llamada)
  - Filtrar actividades tipo `upload` que coincidan con keywords en el título
  - **Limitar a máximo 10 canales** más activos para acotar cuota
- Retorna top 10 videos ordenados por fecha
- **Requiere OAuth** vía YouTube Advanced Service

### 2. searchNewVideos()

- Usa `UrlFetchApp.fetch()` con API Key (búsqueda pública, no requiere OAuth)
- Llama `GET https://www.googleapis.com/youtube/v3/search?q="Claude Code"|"Anthropic"|...&publishedAfter=<24h>&type=video&order=relevance&maxResults=10&key=API_KEY`
- Agrupa keywords con `|` en **2 queries** para cubrir todos los términos (6 keywords c/u) = 200 unidades
- Deduplica contra videos ya encontrados en suscripciones (por `videoId`)
- Retorna top 10 videos

### 3. fetchRSSNews()

- Fuentes (con fallback si fallan):
  - `https://www.anthropic.com/rss.xml` (blog Anthropic — verificar URL en setup)
  - `https://github.com/anthropics/claude-code/releases.atom` (releases GitHub)
- Usa `UrlFetchApp.fetch()` con `muteHttpExceptions: true` + `XmlService.parse()`
- Filtra entradas de las últimas 24h
- Extrae: título, link, fecha
- Si una fuente falla (404, timeout), se omite sin afectar las demás

### 4. generateGeminiSummary()

- Input: títulos + descripciones cortas de videos + títulos RSS
- Modelo: `gemini-2.5-flash`
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Prompt: "Eres un curador de noticias de IA. Resume las novedades más importantes del día sobre Claude Code, inteligencia artificial y herramientas de desarrollo. Máximo 3 párrafos en español. Sé conciso y destaca lo más relevante."
- Output: 2-3 párrafos en español

### 5. buildEmailHTML()

- HTML con estilos inline (compatibilidad email)
- Secciones:
  1. Header con fecha
  2. Resumen del día (Gemini)
  3. Videos de suscripciones (título + canal + link)
  4. Novedades Claude & IA (título + canal + link)
  5. Blog & Releases (título + link)
- Secciones vacías se omiten
- Máximo 20 videos total (10 suscripciones + 10 búsqueda)

### 6. sendDailyDigest() — Función principal

- Orquesta todo el flujo
- Manejo de errores:
  - YouTube API falla → enviar solo RSS + nota de error
  - Gemini falla → enviar sin resumen, solo links
  - Sin contenido → no enviar email
- Registra última ejecución exitosa y último envío en `PropertiesService`
- Si pasan 3+ días sin envío, envía email de alerta ("tu digest lleva 3 días sin contenido, verifica las APIs")

### 7. testDigest()

- Ejecuta todo el flujo pero loguea con `Logger.log()` en vez de enviar email
- Útil para validar que las APIs funcionan antes de activar el trigger

### 8. setupTrigger()

- `ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(8).nearMinute(0).create()`
- Zona horaria: `America/Mexico_City` (en appsscript.json)
- Se ejecuta una vez para configurar

## Cuota YouTube API

| Operación | Costo unitario | Llamadas | Total |
|-----------|---------------|----------|-------|
| `subscriptions.list` | 1 | 1 | 1 |
| `activities.list` (por canal, max 10) | 1 | 10 | 10 |
| `search.list` (búsqueda pública, 2 queries) | 100 | 2 | 200 |
| **Total estimado** | | | **~211 de 10,000** |

Estrategia de optimización:
- **Suscripciones:** Usar `activities.list` (1 unidad) en vez de `search.list` (100 unidades) por canal
- **Búsqueda:** Agrupar 12 keywords en 2 queries con operador `|`
- **Límite:** Máximo 10 canales de suscripciones para acotar

## OAuth Scopes (appsscript.json)

```json
{
  "timeZone": "America/Mexico_City",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "YouTube",
        "version": "v3",
        "serviceId": "youtube"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

Notas:
- `YouTube` Advanced Service habilitado para `subscriptions.list(mine=true)` y `activities.list` con OAuth implícito
- `search.list` usa `UrlFetchApp` con API Key (no requiere OAuth)
- Se removió `script.scriptapp` (no necesario, el scope se concede implícitamente al ejecutar `setupTrigger()` desde el editor)

## Formato del email

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Daily AI Digest — 22 Mar 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESUMEN DEL DIA (por Gemini)
────────────────────────────
[2-3 párrafos curados por Gemini con lo más relevante]

DE TUS SUSCRIPCIONES
────────────────────
* Título del video — Canal Name
  https://youtube.com/watch?v=xxx

* Otro video relevante — Canal 2
  https://youtube.com/watch?v=yyy

NOVEDADES CLAUDE & IA
─────────────────────
* Claude Code 2.0 Released — Anthropic
  https://youtube.com/watch?v=zzz

BLOG & RELEASES
────────────────
* Anthropic Blog: "Título del post"
  https://anthropic.com/blog/...
```

## Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| YouTube API falla | Enviar email solo con RSS + nota de error |
| Gemini falla | Enviar email sin resumen, solo links |
| RSS falla | Enviar email solo con videos |
| Sin contenido en ninguna fuente | No enviar email |
| Cuota YouTube excedida | Log error, enviar solo RSS |

## Setup inicial (una vez)

1. Crear proyecto Apps Script nuevo via `clasp create --type standalone --title "Daily AI Digest"`
2. Vincular al proyecto GCP `gws-cli-personal-490521`
3. Habilitar YouTube Data API v3 en el proyecto GCP (si no está habilitada)
4. Habilitar YouTube Advanced Service en el editor de Apps Script
5. Configurar Script Properties (YOUTUBE_API_KEY, GEMINI_API_KEY, RECIPIENT_EMAIL)
6. `clasp push` para subir archivos
7. Ejecutar `testDigest()` para validar que las APIs funcionan
8. Ejecutar `setupTrigger()` una vez
9. Autorizar scopes OAuth en primera ejecución

## Validación de fuentes RSS

En el setup, verificar manualmente que las URLs RSS devuelven contenido válido:
- `curl https://www.anthropic.com/rss.xml` → debe retornar XML válido
- `curl https://github.com/anthropics/claude-code/releases.atom` → debe retornar Atom feed
- Si alguna URL no funciona, buscar la URL correcta y actualizar en el código
