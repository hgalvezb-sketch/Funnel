# Daily AI Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un Google Apps Script standalone que envíe un correo diario a las 8 AM con videos de YouTube (suscripciones + búsqueda) y noticias RSS sobre Claude/IA, curado por Gemini.

**Architecture:** Proyecto Apps Script standalone con 4 archivos .gs (main, youtube, sources, email). Usa YouTube Advanced Service para suscripciones con OAuth implícito, UrlFetchApp con API Key para búsqueda pública, y Gemini 2.5 Flash para curar contenido. Trigger diario time-based.

**Tech Stack:** Google Apps Script, YouTube Data API v3 (Advanced Service), Gemini API, UrlFetchApp, GmailApp

**Spec:** `docs/superpowers/specs/2026-03-22-daily-ai-digest-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `gas-daily-digest/appsscript.json` | Manifest: scopes, timezone, YouTube Advanced Service |
| `gas-daily-digest/youtube.gs` | getSubscriptionVideos(), searchNewVideos() |
| `gas-daily-digest/sources.gs` | fetchRSSNews(), generateGeminiSummary() |
| `gas-daily-digest/email.gs` | buildEmailHTML() |
| `gas-daily-digest/main.gs` | sendDailyDigest(), testDigest(), setupTrigger() |

---

### Task 1: Scaffold del proyecto + appsscript.json

**Files:**
- Create: `gas-daily-digest/appsscript.json`

- [ ] **Step 1: Crear directorio del proyecto**

```bash
mkdir -p gas-daily-digest
```

- [ ] **Step 2: Crear appsscript.json con manifest completo**

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

- [ ] **Step 3: Crear proyecto Apps Script con clasp**

```bash
cd gas-daily-digest
clasp create --type standalone --title "Daily AI Digest" --rootDir .
```

Esto genera `.clasp.json` con el nuevo Script ID. Guardar el Script ID para referencia.

- [ ] **Step 4: Push manifest inicial**

```bash
clasp push
```

Expected: "Pushed 1 file."

- [ ] **Step 5: Commit**

```bash
cd ..
git add gas-daily-digest/appsscript.json gas-daily-digest/.clasp.json
git commit -m "[POC] feat: scaffold daily-ai-digest project with manifest"
```

---

### Task 2: youtube.gs — getSubscriptionVideos()

**Files:**
- Create: `gas-daily-digest/youtube.gs`

- [ ] **Step 1: Crear youtube.gs con constantes y getSubscriptionVideos()**

```javascript
/**
 * Keywords para filtrar videos relevantes de suscripciones
 */
var KEYWORDS = [
  'claude code', 'claude ai', 'anthropic',
  'ai agents', 'llm', 'ai coding',
  'cursor', 'github copilot', 'mcp servers',
  'ai automation', 'google ai', 'openai'
];

/**
 * Obtiene videos recientes de suscripciones del usuario filtrados por keywords de IA.
 * Usa YouTube Advanced Service (OAuth implicito) + activities.list (1 unidad/llamada).
 * @returns {Array<{title: string, channel: string, videoId: string, url: string, publishedAt: string}>}
 */
function getSubscriptionVideos() {
  var results = [];
  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Obtener canales suscritos (max 50)
    var subsResponse = YouTube.Subscriptions.list('snippet', {
      mine: true,
      maxResults: 50
    });

    if (!subsResponse.items || subsResponse.items.length === 0) {
      Logger.log('No se encontraron suscripciones');
      return results;
    }

    var channels = subsResponse.items.map(function(item) {
      return {
        id: item.snippet.resourceId.channelId,
        title: item.snippet.title
      };
    });

    // 2. Limitar a 10 canales para acotar cuota
    var channelsToCheck = channels.slice(0, 10);

    // 3. Por cada canal, obtener actividades recientes (uploads)
    channelsToCheck.forEach(function(channel) {
      try {
        var activities = YouTube.Activities.list('snippet,contentDetails', {
          channelId: channel.id,
          publishedAfter: since,
          maxResults: 10
        });

        if (!activities.items) return;

        activities.items.forEach(function(activity) {
          if (activity.snippet.type !== 'upload') return;

          var title = activity.snippet.title.toLowerCase();
          var matchesKeyword = KEYWORDS.some(function(kw) {
            return title.indexOf(kw) !== -1;
          });

          if (matchesKeyword) {
            var videoId = activity.contentDetails.upload.videoId;
            results.push({
              title: activity.snippet.title,
              channel: channel.title,
              videoId: videoId,
              url: 'https://www.youtube.com/watch?v=' + videoId,
              publishedAt: activity.snippet.publishedAt
            });
          }
        });
      } catch (e) {
        Logger.log('Error en canal ' + channel.title + ': ' + e.message);
      }
    });

    // 4. Ordenar por fecha y limitar a 10
    results.sort(function(a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
    results = results.slice(0, 10);

  } catch (e) {
    Logger.log('Error en getSubscriptionVideos: ' + e.message);
  }

  return results;
}
```

- [ ] **Step 2: Push y verificar que no hay errores de sintaxis**

```bash
cd gas-daily-digest && clasp push
```

Expected: "Pushed 2 files."

- [ ] **Step 3: Commit**

```bash
cd .. && git add gas-daily-digest/youtube.gs
git commit -m "[POC] feat: getSubscriptionVideos with YouTube Advanced Service"
```

---

### Task 3: youtube.gs — searchNewVideos()

**Files:**
- Modify: `gas-daily-digest/youtube.gs`

- [ ] **Step 1: Agregar searchNewVideos() al final de youtube.gs**

```javascript
/**
 * Busca videos recientes sobre Claude/IA en YouTube (busqueda publica con API Key).
 * Agrupa 12 keywords en 2 queries para minimizar cuota (200 unidades).
 * @param {Array<string>} excludeIds - videoIds a excluir (ya encontrados en suscripciones)
 * @returns {Array<{title: string, channel: string, videoId: string, url: string, publishedAt: string}>}
 */
function searchNewVideos(excludeIds) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  if (!apiKey) {
    Logger.log('YOUTUBE_API_KEY no configurada');
    return [];
  }

  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var excludeSet = {};
  (excludeIds || []).forEach(function(id) { excludeSet[id] = true; });

  // Dividir keywords en 2 grupos de 6
  var queries = [
    '"Claude Code"|"Claude AI"|"Anthropic"|"AI agents"|"LLM"|"AI coding"',
    '"Cursor"|"GitHub Copilot"|"MCP servers"|"AI automation"|"Google AI"|"OpenAI"'
  ];

  var results = [];

  queries.forEach(function(q) {
    try {
      var url = 'https://www.googleapis.com/youtube/v3/search'
        + '?part=snippet'
        + '&q=' + encodeURIComponent(q)
        + '&publishedAfter=' + encodeURIComponent(since)
        + '&type=video'
        + '&order=relevance'
        + '&maxResults=10'
        + '&key=' + apiKey;

      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var code = response.getResponseCode();

      if (code !== 200) {
        Logger.log('YouTube search error (' + code + '): ' + response.getContentText().substring(0, 200));
        return;
      }

      var data = JSON.parse(response.getContentText());

      (data.items || []).forEach(function(item) {
        var videoId = item.id.videoId;
        if (excludeSet[videoId]) return;
        excludeSet[videoId] = true; // evitar duplicados entre queries

        results.push({
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          videoId: videoId,
          url: 'https://www.youtube.com/watch?v=' + videoId,
          publishedAt: item.snippet.publishedAt
        });
      });
    } catch (e) {
      Logger.log('Error en searchNewVideos query: ' + e.message);
    }
  });

  // Limitar a 10
  return results.slice(0, 10);
}
```

- [ ] **Step 2: Push y verificar**

```bash
cd gas-daily-digest && clasp push
```

Expected: "Pushed 2 files."

- [ ] **Step 3: Commit**

```bash
cd .. && git add gas-daily-digest/youtube.gs
git commit -m "[POC] feat: searchNewVideos with public YouTube API"
```

---

### Task 4: sources.gs — fetchRSSNews()

**Files:**
- Create: `gas-daily-digest/sources.gs`

- [ ] **Step 1: Crear sources.gs con fetchRSSNews()**

```javascript
/**
 * URLs de fuentes RSS a consultar.
 */
var RSS_FEEDS = [
  { name: 'Anthropic Blog', url: 'https://www.anthropic.com/rss.xml', type: 'rss' },
  { name: 'Claude Code Releases', url: 'https://github.com/anthropics/claude-code/releases.atom', type: 'atom' }
];

/**
 * Obtiene noticias recientes de fuentes RSS/Atom (ultimas 24h).
 * Si una fuente falla, se omite sin afectar las demas.
 * @returns {Array<{title: string, link: string, source: string, publishedAt: string}>}
 */
function fetchRSSNews() {
  var since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var results = [];

  RSS_FEEDS.forEach(function(feed) {
    try {
      var response = UrlFetchApp.fetch(feed.url, {
        muteHttpExceptions: true,
        followRedirects: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log('RSS feed ' + feed.name + ' retorno ' + response.getResponseCode());
        return;
      }

      var xml = XmlService.parse(response.getContentText());
      var root = xml.getRootElement();
      var entries = [];

      if (feed.type === 'atom') {
        // Atom feed (GitHub releases)
        var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
        entries = root.getChildren('entry', atomNs) || [];

        entries.forEach(function(entry) {
          var title = entry.getChildText('title', atomNs) || '';
          var link = '';
          var linkEl = entry.getChild('link', atomNs);
          if (linkEl) link = linkEl.getAttribute('href').getValue();
          var updated = entry.getChildText('updated', atomNs) || '';
          var pubDate = new Date(updated);

          if (pubDate >= since) {
            results.push({
              title: title,
              link: link,
              source: feed.name,
              publishedAt: updated
            });
          }
        });
      } else {
        // RSS feed (Anthropic blog)
        var channel = root.getChild('channel');
        if (!channel) return;
        var items = channel.getChildren('item') || [];

        items.forEach(function(item) {
          var title = item.getChildText('title') || '';
          var link = item.getChildText('link') || '';
          var pubDateStr = item.getChildText('pubDate') || '';
          var pubDate = new Date(pubDateStr);

          if (pubDate >= since) {
            results.push({
              title: title,
              link: link,
              source: feed.name,
              publishedAt: pubDateStr
            });
          }
        });
      }
    } catch (e) {
      Logger.log('Error en RSS feed ' + feed.name + ': ' + e.message);
    }
  });

  return results;
}
```

- [ ] **Step 2: Push y verificar**

```bash
cd gas-daily-digest && clasp push
```

Expected: "Pushed 3 files."

- [ ] **Step 3: Commit**

```bash
cd .. && git add gas-daily-digest/sources.gs
git commit -m "[POC] feat: fetchRSSNews with RSS/Atom parser"
```

---

### Task 5: sources.gs — generateGeminiSummary()

**Files:**
- Modify: `gas-daily-digest/sources.gs`

- [ ] **Step 1: Agregar generateGeminiSummary() al final de sources.gs**

```javascript
/**
 * Genera un resumen curado usando Gemini 2.5 Flash.
 * @param {Array} subscriptionVideos - Videos de suscripciones
 * @param {Array} searchVideos - Videos de busqueda
 * @param {Array} rssNews - Noticias RSS
 * @returns {string} Resumen en HTML (2-3 parrafos en espanol)
 */
function generateGeminiSummary(subscriptionVideos, searchVideos, rssNews) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    Logger.log('GEMINI_API_KEY no configurada');
    return '';
  }

  // Construir contexto con todos los contenidos del dia
  var contentParts = [];

  if (subscriptionVideos.length > 0) {
    contentParts.push('VIDEOS DE SUSCRIPCIONES:');
    subscriptionVideos.forEach(function(v) {
      contentParts.push('- ' + v.title + ' (canal: ' + v.channel + ')');
    });
  }

  if (searchVideos.length > 0) {
    contentParts.push('\nNOVEDADES ENCONTRADAS:');
    searchVideos.forEach(function(v) {
      contentParts.push('- ' + v.title + ' (canal: ' + v.channel + ')');
    });
  }

  if (rssNews.length > 0) {
    contentParts.push('\nBLOG & RELEASES:');
    rssNews.forEach(function(n) {
      contentParts.push('- ' + n.title + ' (' + n.source + ')');
    });
  }

  if (contentParts.length === 0) return '';

  var prompt = 'Eres un curador de noticias de IA para un profesional de tecnologia financiera. '
    + 'A continuacion tienes los titulos de videos y noticias del dia sobre Claude Code, '
    + 'inteligencia artificial y herramientas de desarrollo.\n\n'
    + contentParts.join('\n')
    + '\n\nGenera un resumen de maximo 3 parrafos en espanol. '
    + 'Se conciso, destaca lo mas relevante, y menciona tendencias si las hay. '
    + 'Formato: texto plano, sin markdown ni bullet points.';

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    var payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('Gemini error (' + response.getResponseCode() + '): ' + response.getContentText().substring(0, 200));
      return '';
    }

    var data = JSON.parse(response.getContentText());
    var text = data.candidates[0].content.parts[0].text || '';
    return text.trim();
  } catch (e) {
    Logger.log('Error en generateGeminiSummary: ' + e.message);
    return '';
  }
}
```

- [ ] **Step 2: Push y verificar**

```bash
cd gas-daily-digest && clasp push
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add gas-daily-digest/sources.gs
git commit -m "[POC] feat: generateGeminiSummary with Gemini 2.5 Flash"
```

---

### Task 6: email.gs — buildEmailHTML()

**Files:**
- Create: `gas-daily-digest/email.gs`

- [ ] **Step 1: Crear email.gs con buildEmailHTML()**

```javascript
/**
 * Construye el HTML del email digest con estilos inline.
 * Secciones vacias se omiten automaticamente.
 * @param {Object} data - { summary, subscriptionVideos, searchVideos, rssNews }
 * @returns {string} HTML del email
 */
function buildEmailHTML(data) {
  var today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd MMM yyyy');

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">';

  // Header
  html += '<div style="background:#1a1a2e;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0;">';
  html += '<h1 style="margin:0;font-size:22px;">Daily AI Digest</h1>';
  html += '<p style="margin:5px 0 0;font-size:14px;color:#a0a0c0;">' + today + '</p>';
  html += '</div>';

  // Body container
  html += '<div style="padding:20px;background:#f9f9fb;border:1px solid #e0e0e0;border-top:none;">';

  // Seccion: Resumen Gemini
  if (data.summary) {
    html += '<div style="margin-bottom:24px;">';
    html += '<h2 style="font-size:16px;color:#1a1a2e;border-bottom:2px solid #6c63ff;padding-bottom:6px;margin-bottom:12px;">RESUMEN DEL DIA</h2>';
    var paragraphs = data.summary.split('\n').filter(function(p) { return p.trim(); });
    paragraphs.forEach(function(p) {
      html += '<p style="font-size:14px;line-height:1.6;margin:0 0 10px;">' + escapeHtml_(p) + '</p>';
    });
    html += '</div>';
  }

  // Seccion: Videos de suscripciones
  if (data.subscriptionVideos && data.subscriptionVideos.length > 0) {
    html += buildVideoSection_('DE TUS SUSCRIPCIONES', data.subscriptionVideos, '#16a085');
  }

  // Seccion: Novedades busqueda
  if (data.searchVideos && data.searchVideos.length > 0) {
    html += buildVideoSection_('NOVEDADES CLAUDE & IA', data.searchVideos, '#e74c3c');
  }

  // Seccion: RSS
  if (data.rssNews && data.rssNews.length > 0) {
    html += '<div style="margin-bottom:24px;">';
    html += '<h2 style="font-size:16px;color:#1a1a2e;border-bottom:2px solid #f39c12;padding-bottom:6px;margin-bottom:12px;">BLOG & RELEASES</h2>';
    data.rssNews.forEach(function(item) {
      html += '<div style="margin-bottom:10px;">';
      html += '<a href="' + escapeHtml_(item.link) + '" style="color:#2980b9;text-decoration:none;font-size:14px;font-weight:bold;">' + escapeHtml_(item.title) + '</a>';
      html += '<span style="color:#888;font-size:12px;"> — ' + escapeHtml_(item.source) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Footer
  html += '<div style="text-align:center;padding-top:16px;border-top:1px solid #e0e0e0;color:#999;font-size:11px;">';
  html += 'Generado automaticamente por Daily AI Digest | Apps Script';
  html += '</div>';

  html += '</div></div>';
  return html;
}

/**
 * Construye una seccion de videos con titulo y color de acento.
 */
function buildVideoSection_(title, videos, accentColor) {
  var html = '<div style="margin-bottom:24px;">';
  html += '<h2 style="font-size:16px;color:#1a1a2e;border-bottom:2px solid ' + accentColor + ';padding-bottom:6px;margin-bottom:12px;">' + title + '</h2>';

  videos.forEach(function(video) {
    html += '<div style="margin-bottom:10px;">';
    html += '<a href="' + escapeHtml_(video.url) + '" style="color:#2980b9;text-decoration:none;font-size:14px;font-weight:bold;">' + escapeHtml_(video.title) + '</a>';
    html += '<span style="color:#888;font-size:12px;"> — ' + escapeHtml_(video.channel) + '</span>';
    html += '</div>';
  });

  html += '</div>';
  return html;
}

/**
 * Escapa HTML para prevenir XSS.
 */
function escapeHtml_(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Push y verificar**

```bash
cd gas-daily-digest && clasp push
```

Expected: "Pushed 4 files."

- [ ] **Step 3: Commit**

```bash
cd .. && git add gas-daily-digest/email.gs
git commit -m "[POC] feat: buildEmailHTML with inline styles"
```

---

### Task 7: main.gs — sendDailyDigest(), testDigest(), setupTrigger()

**Files:**
- Create: `gas-daily-digest/main.gs`

- [ ] **Step 1: Crear main.gs con las 3 funciones principales**

```javascript
/**
 * Funcion principal que orquesta el digest diario.
 * Llamada por el trigger diario a las 8 AM.
 */
function sendDailyDigest() {
  var props = PropertiesService.getScriptProperties();
  var recipient = props.getProperty('RECIPIENT_EMAIL') || 'hgalvezb@findep.com.mx';

  // Registrar ejecucion
  props.setProperty('LAST_RUN', new Date().toISOString());

  var subscriptionVideos = [];
  var searchVideos = [];
  var rssNews = [];
  var errors = [];

  // 1. Videos de suscripciones
  try {
    subscriptionVideos = getSubscriptionVideos();
    Logger.log('Suscripciones: ' + subscriptionVideos.length + ' videos');
  } catch (e) {
    Logger.log('Error YouTube suscripciones: ' + e.message);
    errors.push('YouTube suscripciones: ' + e.message);
  }

  // 2. Busqueda publica
  try {
    var excludeIds = subscriptionVideos.map(function(v) { return v.videoId; });
    searchVideos = searchNewVideos(excludeIds);
    Logger.log('Busqueda: ' + searchVideos.length + ' videos');
  } catch (e) {
    Logger.log('Error YouTube busqueda: ' + e.message);
    errors.push('YouTube busqueda: ' + e.message);
  }

  // 3. RSS
  try {
    rssNews = fetchRSSNews();
    Logger.log('RSS: ' + rssNews.length + ' noticias');
  } catch (e) {
    Logger.log('Error RSS: ' + e.message);
    errors.push('RSS: ' + e.message);
  }

  // 4. Verificar si hay contenido
  var totalContent = subscriptionVideos.length + searchVideos.length + rssNews.length;
  if (totalContent === 0) {
    Logger.log('Sin contenido hoy. No se envia email.');
    checkStaleDigest_(props, recipient);
    return;
  }

  // 5. Resumen Gemini
  var summary = '';
  try {
    summary = generateGeminiSummary(subscriptionVideos, searchVideos, rssNews);
    Logger.log('Gemini summary: ' + (summary ? 'OK' : 'vacio'));
  } catch (e) {
    Logger.log('Error Gemini: ' + e.message);
    errors.push('Gemini: ' + e.message);
  }

  // 6. Construir y enviar email
  var emailData = {
    summary: summary,
    subscriptionVideos: subscriptionVideos,
    searchVideos: searchVideos,
    rssNews: rssNews
  };

  var htmlBody = buildEmailHTML(emailData);

  // Agregar nota de errores si hubo
  if (errors.length > 0) {
    htmlBody += '<div style="padding:10px;background:#fff3cd;border:1px solid #ffc107;margin-top:10px;font-size:12px;color:#856404;">';
    htmlBody += '<strong>Nota:</strong> Algunas fuentes tuvieron errores: ' + escapeHtml_(errors.join(', '));
    htmlBody += '</div>';
  }

  var today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd MMM yyyy');

  GmailApp.sendEmail(recipient, 'Daily AI Digest — ' + today, '', {
    htmlBody: htmlBody,
    name: 'Daily AI Digest'
  });

  props.setProperty('LAST_SEND', new Date().toISOString());
  Logger.log('Email enviado a ' + recipient);
}

/**
 * Verifica si el digest lleva 3+ dias sin enviar y envia alerta.
 */
function checkStaleDigest_(props, recipient) {
  var lastSend = props.getProperty('LAST_SEND');
  if (!lastSend) return;

  var daysSinceSend = (Date.now() - new Date(lastSend).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceSend >= 3) {
    GmailApp.sendEmail(recipient, 'ALERTA: Daily AI Digest sin contenido por ' + Math.floor(daysSinceSend) + ' dias',
      'Tu Daily AI Digest lleva ' + Math.floor(daysSinceSend) + ' dias sin encontrar contenido relevante.\n\n'
      + 'Posibles causas:\n'
      + '- YouTube API Key expirada o sin cuota\n'
      + '- RSS feeds caidos\n'
      + '- Keywords demasiado restrictivos\n\n'
      + 'Ultima ejecucion: ' + (props.getProperty('LAST_RUN') || 'desconocida') + '\n'
      + 'Ultimo envio exitoso: ' + lastSend
    );
  }
}

/**
 * Funcion de prueba: ejecuta todo el flujo pero loguea en vez de enviar email.
 * Ejecutar desde el editor de Apps Script para validar APIs.
 */
function testDigest() {
  Logger.log('=== TEST DIGEST START ===');

  // 1. Suscripciones
  var subs = getSubscriptionVideos();
  Logger.log('Suscripciones encontradas: ' + subs.length);
  subs.forEach(function(v) { Logger.log('  [SUB] ' + v.title + ' — ' + v.channel); });

  // 2. Busqueda
  var excludeIds = subs.map(function(v) { return v.videoId; });
  var search = searchNewVideos(excludeIds);
  Logger.log('Busqueda encontrada: ' + search.length);
  search.forEach(function(v) { Logger.log('  [SEARCH] ' + v.title + ' — ' + v.channel); });

  // 3. RSS
  var rss = fetchRSSNews();
  Logger.log('RSS encontradas: ' + rss.length);
  rss.forEach(function(n) { Logger.log('  [RSS] ' + n.title + ' — ' + n.source); });

  // 4. Gemini
  var summary = generateGeminiSummary(subs, search, rss);
  Logger.log('Gemini summary:\n' + summary);

  // 5. Email HTML (solo loguear tamano)
  var html = buildEmailHTML({
    summary: summary,
    subscriptionVideos: subs,
    searchVideos: search,
    rssNews: rss
  });
  Logger.log('Email HTML generado: ' + html.length + ' chars');

  Logger.log('=== TEST DIGEST END ===');
  Logger.log('Total: ' + subs.length + ' subs + ' + search.length + ' search + ' + rss.length + ' rss');
}

/**
 * Configura el trigger diario a las 8 AM (America/Mexico_City).
 * Ejecutar UNA SOLA VEZ desde el editor.
 */
function setupTrigger() {
  // Eliminar triggers existentes para evitar duplicados
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendDailyDigest') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .create();

  Logger.log('Trigger configurado: sendDailyDigest diario a las 8 AM CST');
}
```

- [ ] **Step 2: Push y verificar todos los archivos**

```bash
cd gas-daily-digest && clasp push
```

Expected: "Pushed 5 files." (appsscript.json, youtube.gs, sources.gs, email.gs, main.gs)

- [ ] **Step 3: Commit**

```bash
cd .. && git add gas-daily-digest/main.gs
git commit -m "[POC] feat: main.gs with sendDailyDigest, testDigest, setupTrigger"
```

---

### Task 8: Setup y validacion

**Files:** Ninguno nuevo

- [ ] **Step 1: Vincular proyecto GCP**

Abrir el editor de Apps Script (`clasp open`) y en Configuracion del proyecto > Proyecto de Google Cloud Platform, vincular al proyecto `gws-cli-personal-490521` (number: `381061370235`).

- [ ] **Step 2: Habilitar YouTube Data API v3**

En la consola de GCP (https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=gws-cli-personal-490521), habilitar "YouTube Data API v3" si no esta habilitada.

- [ ] **Step 3: Habilitar YouTube Advanced Service en Apps Script**

En el editor de Apps Script > Servicios > Agregar > YouTube Data API v3.

- [ ] **Step 4: Configurar Script Properties**

En el editor de Apps Script > Configuracion del proyecto > Propiedades del script, agregar:
- `YOUTUBE_API_KEY` = (API Key del proyecto GCP)
- `GEMINI_API_KEY` = (API Key de Gemini)
- `RECIPIENT_EMAIL` = `hgalvezb@findep.com.mx`

- [ ] **Step 5: Ejecutar testDigest() desde el editor**

En el editor, seleccionar `testDigest` y ejecutar. Autorizar scopes OAuth cuando se solicite.
Verificar en los logs que:
- Se encontraron suscripciones (o 0 si no hay videos de IA en las ultimas 24h)
- La busqueda publica retorna videos
- RSS retorna entradas (o 0 si no hay en 24h)
- Gemini genera un resumen

- [ ] **Step 6: Ejecutar setupTrigger() desde el editor**

Ejecutar `setupTrigger()` una vez. Verificar en los logs: "Trigger configurado".

- [ ] **Step 7: Commit final con notas de setup**

```bash
git add -A gas-daily-digest/
git commit -m "[POC] feat: Daily AI Digest complete - YouTube + RSS + Gemini daily email"
```
