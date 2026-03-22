# Daily AI Digest

Proyecto Google Apps Script standalone que envía un email diario con videos de YouTube sobre **Claude Code, herramientas de Google desde terminal/CLI y coding agents**, filtrados en español y curados por Gemini 2.5 Flash.

## Arquitectura

```
gas-daily-digest/
├── main.gs          # Orquestación: sendDailyDigest(), testDigest(), setupTrigger()
├── youtube.gs       # YouTube API: suscripciones, likes insights, búsqueda pública
├── sources.gs       # RSS feeds + Gemini API (resumen, mini-resúmenes, clasificación idioma/relevancia)
├── email.gs         # Constructor HTML del email con estilos inline
├── appsscript.json  # Manifest: scopes OAuth, YouTube Advanced Service, timezone
└── .clasp.json      # Config clasp: scriptId, projectId, rootDir
```

## Flujo de ejecución (sendDailyDigest)

1. **Suscripciones** — Videos de canales suscritos (últimas 24h) filtrados por keywords técnicos
2. **Likes insights** — Extrae top 5 canales y keywords de videos con "Me gusta" (playlist LL)
3. **Liked channels** — Videos recientes de canales donde el usuario dio like
4. **Búsqueda pública** — 3 queries específicos (Claude Code, Cursor/Copilot, Google CLI) + keywords personalizados de likes
5. **RSS** — Anthropic Blog + Claude Code GitHub Releases
6. **Gemini summary** — Resumen general en español (3 párrafos)
7. **Mini-resúmenes** — Por cada video: título traducido, resumen, clasificación de idioma y relevancia
8. **Filtro** — Solo videos en español (`idioma=es`) Y relevantes (`relevante=si`)
9. **Email** — HTML con secciones color-coded, fecha de publicación por video

## APIs y cuota

| API | Uso | Costo cuota |
|-----|-----|-------------|
| YouTube Subscriptions.list | 1 llamada (mine=true) | 1 unidad |
| YouTube PlaylistItems.list | 1 llamada (playlist LL) | 1 unidad |
| YouTube Activities.list | 1 por canal (max 15) | 1 unidad/canal |
| YouTube Search (UrlFetchApp) | 3 queries | 100 unidades/query |
| Gemini 2.5 Flash | 2 llamadas (resumen + mini-resúmenes) | Gratis (API key) |
| GmailApp.sendEmail | 1 email | N/A |

## Configuración

### Script Properties (en el editor > Configuración del proyecto > Propiedades del script)

| Propiedad | Descripción |
|-----------|-------------|
| `YOUTUBE_API_KEY` | API key de YouTube Data API v3 |
| `GEMINI_API_KEY` | API key de Gemini (Google AI Studio) |
| `RECIPIENT_EMAIL` | Email destino (default: hgalvezb@findep.com.mx) |

### GCP Project

- **Project:** `gws-cli-personal-490521` (number: `381061370235`)
- **Script ID:** `14LLKiYxLIx2UqJHEp4pGN9akJLYXEd7oMceGJHrvScCH_SY8uLp-XkVP`

### OAuth Scopes

- `youtube.readonly` — Leer suscripciones, likes, actividades
- `gmail.send` — Enviar email
- `script.external_request` — UrlFetchApp (YouTube Search, Gemini, RSS)
- `script.scriptapp` — Triggers

## Cómo ejecutar

### Desde el editor de Apps Script

1. Abrir: https://script.google.com/d/14LLKiYxLIx2UqJHEp4pGN9akJLYXEd7oMceGJHrvScCH_SY8uLp-XkVP/edit
2. Seleccionar archivo `main.gs`
3. Seleccionar función `sendDailyDigest` en el dropdown
4. Click en "Ejecutar"

### Desde clasp (terminal)

```bash
cd c:/Users/Administrador/Funnel/gas-daily-digest

# Subir cambios locales al script
clasp push --force

# Abrir editor en navegador
clasp open
```

> Nota: `clasp run` requiere que el script tenga Execution API habilitada y deployment como API ejecutable.

### Trigger automático (diario 8 AM CST)

Ejecutar `setupTrigger()` **una sola vez** desde el editor para configurar el trigger diario.

## Keywords de búsqueda

Los videos se filtran por estos temas específicos:
- **Claude Code** — CLI, terminal, MCP servers
- **Coding agents** — Cursor, Copilot, Windsurf, Cline, Aider
- **Google desde terminal** — gcloud, clasp, Apps Script, Firebase CLI, Gemini CLI/API

Videos de IA general (opinión, filosofía, noticias genéricas) son filtrados por Gemini.

## Personalización con likes

El sistema aprende de tus "Me gusta" en YouTube:
- Extrae los **5 canales más frecuentes** donde das like
- Extrae **5 keywords** de los títulos de videos que te gustan
- Usa esos keywords como query adicional en la búsqueda
- Revisa videos recientes de esos canales

## Filtro de calidad (Gemini)

Cada video pasa por Gemini 2.5 Flash que clasifica:
- **idioma**: `es` (español) o `en` (inglés), etc.
- **relevante**: `si` o `no` — solo pasan tutoriales técnicos prácticos

## Mejoras pendientes

- [ ] Fix RSS Anthropic Blog (URL feed.xml retorna 404)
- [ ] Ampliar ventana de suscripciones/liked channels a 48-72h si 24h da 0 resultados
- [ ] Agregar más fuentes RSS (Cursor blog, Google Cloud blog)
- [ ] Caché de videoIds ya enviados para evitar duplicados entre días
- [ ] Thumbnail de video en el email
