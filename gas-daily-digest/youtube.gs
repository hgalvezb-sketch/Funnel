/**
 * Keywords para filtrar videos relevantes de suscripciones
 */
var KEYWORDS = [
  'claude code', 'claude ai', 'anthropic',
  'ai agents', 'llm', 'ai coding',
  'cursor', 'github copilot', 'mcp servers',
  'ai automation', 'google ai', 'openai',
  'inteligencia artificial', 'agentes ia'
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

  // Queries solo en español
  var queries = [
    '"Claude Code"|"Claude AI"|"inteligencia artificial"|"Anthropic" español',
    '"Cursor"|"GitHub Copilot"|"agentes IA"|"OpenAI"|"Google AI" español'
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
