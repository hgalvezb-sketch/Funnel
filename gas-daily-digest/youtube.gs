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
