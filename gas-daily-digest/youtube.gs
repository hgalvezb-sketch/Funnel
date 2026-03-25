/**
 * Keywords para filtrar videos relevantes de suscripciones
 */
var KEYWORDS = [
  // Claude & Anthropic (ecosistema completo)
  'claude code', 'claude cli', 'claude terminal', 'claude sonnet', 'claude opus', 'claude haiku',
  'claude desktop', 'claude artifacts', 'claude projects', 'claude api',
  'anthropic cli', 'anthropic api', 'anthropic mcp', 'mcp server', 'mcp servers',
  'claude new features', 'claude update', 'claude novedades',
  // Gemini ecosistema completo (CLI, NotebookLM, AI Studio, etc)
  'gemini cli', 'gemini api', 'gemini terminal', 'gemini code', 'google ai studio',
  'gemini 2.5', 'gemini flash', 'gemini pro', 'gemini advanced',
  'notebooklm', 'notebook lm', 'google notebooklm',
  'gemini update', 'gemini novedades', 'gemini new features',
  'gemini workspace', 'gemini google docs', 'gemini google sheets',
  // Coding agents & IDEs
  'cursor ide', 'cursor editor', 'github copilot', 'copilot workspace',
  'windsurf', 'cline', 'aider', 'coding agent', 'ai coding',
  // Google Workspace & automatizacion
  'google apps script', 'apps script', 'clasp', 'google sheets automatiz',
  'google workspace api', 'gws cli', 'google sheets api',
  'automatizar google', 'automatizacion google', 'google sheets formula',
  'appsheet', 'google workspace addon',
  // Google Cloud CLI
  'google cloud cli', 'gcloud', 'firebase cli',
  // Herramientas IA para devs, analistas, data science
  'ai tools developer', 'herramientas ia', 'ia para desarrolladores',
  'ia para analistas', 'data science ai', 'ciencia de datos ia',
  'machine learning tutorial', 'python ai', 'jupyter ai',
  'copilot data', 'ai automation', 'automatizacion ia',
  // Herramientas corporativas & productividad con GWS
  'enterprise ai', 'herramientas corporativas',
  'productividad ia', 'google workspace automation'
];


/**
 * Obtiene videos recientes de TODAS las suscripciones del usuario.
 * Pagina para obtener todas las suscripciones, revisa cada canal,
 * y deja que Gemini filtre por idioma y relevancia despues.
 * @returns {Array<{title: string, channel: string, videoId: string, url: string, publishedAt: string}>}
 */
function getSubscriptionVideos() {
  var results = [];
  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Obtener TODOS los canales suscritos (paginando)
    var channels = [];
    var pageToken = null;

    do {
      var params = { mine: true, maxResults: 50 };
      if (pageToken) params.pageToken = pageToken;

      var subsResponse = YouTube.Subscriptions.list('snippet', params);

      if (subsResponse.items && subsResponse.items.length > 0) {
        subsResponse.items.forEach(function(item) {
          channels.push({
            id: item.snippet.resourceId.channelId,
            title: item.snippet.title
          });
        });
      }

      pageToken = subsResponse.nextPageToken || null;
    } while (pageToken);

    Logger.log('Suscripciones totales: ' + channels.length + ' canales');

    if (channels.length === 0) {
      Logger.log('No se encontraron suscripciones');
      return results;
    }

    // 2. Por cada canal, obtener uploads recientes (sin filtro de keywords)
    channels.forEach(function(channel) {
      try {
        var activities = YouTube.Activities.list('snippet,contentDetails', {
          channelId: channel.id,
          publishedAfter: since,
          maxResults: 5
        });

        if (!activities.items) return;

        activities.items.forEach(function(activity) {
          if (activity.snippet.type !== 'upload') return;

          var videoId = activity.contentDetails.upload.videoId;
          results.push({
            title: activity.snippet.title,
            channel: channel.title,
            videoId: videoId,
            url: 'https://www.youtube.com/watch?v=' + videoId,
            publishedAt: activity.snippet.publishedAt
          });
        });
      } catch (e) {
        Logger.log('Error en canal ' + channel.title + ': ' + e.message);
      }
    });

    // 3. Ordenar por fecha (mas recientes primero)
    results.sort(function(a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    Logger.log('Videos de suscripciones (sin filtrar): ' + results.length);

  } catch (e) {
    Logger.log('Error en getSubscriptionVideos: ' + e.message);
  }

  return results;
}

/**
 * Busca videos recientes sobre Claude/IA en YouTube (busqueda publica con API Key).
 * Agrupa 12 keywords en 2 queries para minimizar cuota (200 unidades).
 * @param {Array<string>} excludeIds - videoIds a excluir (ya encontrados en suscripciones)
 * @returns {Array<{title: string, channel: string, videoId: string, url: string, publishedAt: string}>}
 */
function searchNewVideos(excludeIds, userKeywords) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');
  if (!apiKey) {
    Logger.log('YOUTUBE_API_KEY no configurada');
    return [];
  }

  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var excludeSet = {};
  (excludeIds || []).forEach(function(id) { excludeSet[id] = true; });

  // Queries específicos ampliados
  var queries = [
    '"Claude Code"|"Claude CLI"|"Claude Desktop"|"Claude update" novedades|tutorial|tips|new',
    '"Gemini CLI"|"NotebookLM"|"Google AI Studio"|"Gemini update" novedades|tutorial|new',
    '"Cursor"|"GitHub Copilot"|"Windsurf"|"Cline"|"Aider" programar|coding|tutorial',
    '"Apps Script"|"Google Sheets" automatizar|automatizacion|workflow|tutorial',
    '"herramientas IA"|"AI tools" desarrolladores|analistas|"data science"|productividad',
    '"Google Workspace"|"Google Sheets"|"Apps Script"|"AppSheet" automatizacion|integrar|Claude|Gemini'
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
        + '&relevanceLanguage=es'
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

/**
 * Obtiene insights de los "Me gusta" del usuario: canales frecuentes y keywords.
 * Lee la playlist especial "LL" (Liked Videos) via YouTube Advanced Service.
 * @returns {{ channels: Array<{id: string, title: string}>, keywords: Array<string> }}
 */
function getLikedVideosInsights() {
  var channels = {};
  var wordFreq = {};

  try {
    var response = YouTube.PlaylistItems.list('snippet', {
      playlistId: 'LL',
      maxResults: 50
    });

    if (!response.items || response.items.length === 0) {
      Logger.log('No se encontraron videos con Me gusta');
      return { channels: [], keywords: [] };
    }

    response.items.forEach(function(item) {
      var channelId = item.snippet.videoOwnerChannelId;
      var channelTitle = item.snippet.videoOwnerChannelTitle || '';

      // Contar canales
      if (channelId && !channels[channelId]) {
        channels[channelId] = { id: channelId, title: channelTitle, count: 0 };
      }
      if (channelId) channels[channelId].count++;

      // Extraer palabras clave de titulos
      var title = (item.snippet.title || '').toLowerCase();
      var words = title.split(/[\s\-|:,.()\[\]]+/).filter(function(w) {
        return w.length > 3 && ['this', 'that', 'with', 'from', 'your', 'what', 'como', 'para', 'the', 'and', 'how', 'new', 'can', 'will', 'just', 'about', 'more', 'than', 'have', 'been', 'todo', 'pero', 'esta', 'este', 'una', 'los', 'las', 'del', 'por', 'que', 'con'].indexOf(w) === -1;
      });
      words.forEach(function(w) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      });
    });

    // Top 5 canales por frecuencia de likes
    var topChannels = Object.keys(channels).map(function(id) {
      return channels[id];
    }).sort(function(a, b) {
      return b.count - a.count;
    }).slice(0, 5);

    // Top 5 keywords por frecuencia (que no esten ya en KEYWORDS)
    var existingKw = KEYWORDS.map(function(k) { return k.toLowerCase(); });
    var topKeywords = Object.keys(wordFreq).filter(function(w) {
      return wordFreq[w] >= 2 && existingKw.indexOf(w) === -1;
    }).sort(function(a, b) {
      return wordFreq[b] - wordFreq[a];
    }).slice(0, 5);

    Logger.log('Likes insights: ' + topChannels.length + ' canales, ' + topKeywords.length + ' keywords nuevos');
    return { channels: topChannels, keywords: topKeywords };

  } catch (e) {
    Logger.log('Error en getLikedVideosInsights: ' + e.message);
    return { channels: [], keywords: [] };
  }
}

/**
 * Obtiene videos recientes de canales donde el usuario ha dado "Me gusta".
 * Usa activities.list (1 unidad/canal) para eficiencia de cuota.
 * @param {Array<{id: string, title: string}>} likedChannels - Canales de likes
 * @param {Object} excludeSet - Map de videoIds ya incluidos
 * @returns {Array<{title: string, channel: string, videoId: string, url: string, publishedAt: string}>}
 */
function getVideosFromLikedChannels(likedChannels, excludeSet) {
  var results = [];
  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  likedChannels.forEach(function(channel) {
    try {
      var activities = YouTube.Activities.list('snippet,contentDetails', {
        channelId: channel.id,
        publishedAfter: since,
        maxResults: 5
      });

      if (!activities.items) return;

      activities.items.forEach(function(activity) {
        if (activity.snippet.type !== 'upload') return;

        var videoId = activity.contentDetails.upload.videoId;
        if (excludeSet[videoId]) return;
        excludeSet[videoId] = true;

        results.push({
          title: activity.snippet.title,
          channel: channel.title,
          videoId: videoId,
          url: 'https://www.youtube.com/watch?v=' + videoId,
          publishedAt: activity.snippet.publishedAt
        });
      });
    } catch (e) {
      Logger.log('Error en liked channel ' + channel.title + ': ' + e.message);
    }
  });

  results.sort(function(a, b) {
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });
  return results.slice(0, 10);
}

/**
 * Enriquece un array de videos con la duracion formateada.
 * Usa YouTube Videos.list (contentDetails) en lotes de 50.
 * Agrega propiedad 'duration' (ej: "12:34") a cada video.
 * @param {Array} videos - Videos con propiedad videoId
 */
function enrichVideosWithDuration(videos) {
  if (!videos || videos.length === 0) return;

  // Procesar en lotes de 50 (limite de la API)
  for (var i = 0; i < videos.length; i += 50) {
    var batch = videos.slice(i, i + 50);
    var ids = batch.map(function(v) { return v.videoId; }).join(',');

    try {
      var response = YouTube.Videos.list('contentDetails', { id: ids });

      if (!response.items) continue;

      var durationMap = {};
      response.items.forEach(function(item) {
        durationMap[item.id] = formatDuration_(item.contentDetails.duration);
      });

      batch.forEach(function(v) {
        v.duration = durationMap[v.videoId] || '';
      });
    } catch (e) {
      Logger.log('Error en enrichVideosWithDuration: ' + e.message);
    }
  }
}

/**
 * Convierte duracion ISO 8601 (PT1H2M34S) a formato legible (1:02:34).
 */
function formatDuration_(iso) {
  var match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';

  var h = parseInt(match[1] || 0);
  var m = parseInt(match[2] || 0);
  var s = parseInt(match[3] || 0);

  var pad = function(n) { return n < 10 ? '0' + n : '' + n; };

  if (h > 0) {
    return h + ':' + pad(m) + ':' + pad(s);
  }
  return m + ':' + pad(s);
}
