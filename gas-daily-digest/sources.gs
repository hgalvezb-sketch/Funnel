/**
 * URLs de fuentes RSS a consultar.
 */
var RSS_FEEDS = [
  { name: 'Anthropic Blog', url: 'https://www.anthropic.com/feed.xml', type: 'atom' },
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

/**
 * Genera un resumen curado usando Gemini 2.5 Flash.
 * @param {Array} subscriptionVideos - Videos de suscripciones
 * @param {Array} searchVideos - Videos de busqueda
 * @param {Array} rssNews - Noticias RSS
 * @returns {string} Resumen en texto plano (2-3 parrafos en espanol)
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
    if (!data.candidates || !data.candidates.length || !data.candidates[0].content) {
      Logger.log('Gemini: respuesta sin candidates validos');
      return '';
    }
    var text = data.candidates[0].content.parts[0].text || '';
    return text.trim();
  } catch (e) {
    Logger.log('Error en generateGeminiSummary: ' + e.message);
    return '';
  }
}
