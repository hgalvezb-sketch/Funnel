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
function generateGeminiSummary(subscriptionVideos, searchVideos, rssNews, likedChannelVideos) {
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

  if (likedChannelVideos && likedChannelVideos.length > 0) {
    contentParts.push('\nDE CANALES QUE LE GUSTAN AL USUARIO:');
    likedChannelVideos.forEach(function(v) {
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

  var prompt = 'Eres un curador tecnico especializado en: ecosistema Claude (Code, CLI, Desktop, Artifacts, Projects), ecosistema Gemini (CLI, NotebookLM, AI Studio, Advanced), herramientas de Google Workspace (Apps Script, clasp, Google Sheets, AppSheet), coding agents (Cursor, Copilot, Windsurf, Cline, Aider), herramientas IA para desarrolladores/analistas/data scientists, y automatizaciones corporativas con Google Workspace. '
    + 'A continuacion tienes los titulos de videos y noticias del dia.\n\n'
    + contentParts.join('\n')
    + '\n\nGenera un resumen de maximo 3 parrafos en espanol. '
    + 'Enfocate SOLO en contenido tecnico practico: tutoriales, tips, nuevas funcionalidades, configuraciones. '
    + 'Ignora contenido de opinion general, filosofico o no tecnico. '
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

/**
 * Genera mini-resumenes en espanol para cada video usando Gemini.
 * Envia todos los titulos en un solo request para eficiencia.
 * Modifica los arrays in-place agregando propiedad 'miniResumen'.
 * @param {Array} allVideos - Todos los videos (subs + liked + search)
 */
function generateVideoSummaries(allVideos) {
  if (!allVideos || allVideos.length === 0) return;

  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return;

  var videoList = allVideos.map(function(v, i) {
    return (i + 1) + '. ' + v.title + ' (canal: ' + v.channel + ')';
  }).join('\n');

  var prompt = 'Para cada video de la lista, genera:\n'
    + '1. El titulo traducido al espanol (si ya esta en espanol, dejalo igual)\n'
    + '2. Un mini-resumen en espanol de 1-2 oraciones explicando de que trata el video\n'
    + '3. El idioma para el usuario: responde "es" si el video esta en espanol, si el canal es hispanohablante, o si el canal ofrece doblaje automatico al espanol (muchos canales grandes en ingles como Universe of AI, Fireship, etc. tienen doblaje automatico). En caso de duda, responde "es". Solo responde "en" si estas SEGURO de que el canal NO tiene version en espanol ni doblaje.\n'
    + '4. Si el video es RELEVANTE ("si" o "no"). Un video es relevante si trata sobre:\n'
    + '   - Ecosistema Claude: Claude Code, CLI, Desktop, Artifacts, Projects, API, novedades y updates de Anthropic\n'
    + '   - Ecosistema Gemini: Gemini CLI, NotebookLM, Google AI Studio, Gemini Advanced, novedades y updates\n'
    + '   - Uso de cualquier LLM desde terminal\n'
    + '   - Coding agents: Cursor, Copilot, Windsurf, Cline, Aider\n'
    + '   - MCP servers, configuracion de agentes de codigo\n'
    + '   - Google Workspace: Apps Script, clasp, Google Sheets automatizaciones, AppSheet, GWS APIs\n'
    + '   - Herramientas IA para desarrolladores, analistas de datos o cientificos de datos\n'
    + '   - Automatizaciones corporativas con Google Workspace (Apps Script, Sheets, Drive, Gmail)\n'
    + '   - Nuevas herramientas o mejoras para terminales/CLIs de IA\n'
    + '   - Tutoriales tecnicos de programacion, data science o productividad con IA\n'
    + '   NO es relevante si: es opinion general sobre IA sin contenido practico, noticias sin demostracion, filosofia, inversiones, animacion, o temas NO tecnicos.\n\n'
    + videoList
    + '\n\nResponde SOLO con un JSON array de objetos con las propiedades "titulo", "resumen", "idioma" y "relevante". '
    + 'Ejemplo: [{"titulo":"Claude Code en 8 Minutos","resumen":"Resumen aqui...","idioma":"es","relevante":"si"}]\n'
    + 'Sin markdown, sin explicaciones, solo el JSON array.';

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('Gemini summaries error: ' + response.getResponseCode());
      return;
    }

    var data = JSON.parse(response.getContentText());
    if (!data.candidates || !data.candidates.length || !data.candidates[0].content) return;

    var text = data.candidates[0].content.parts[0].text || '';
    var summaries = JSON.parse(text);

    for (var i = 0; i < allVideos.length && i < summaries.length; i++) {
      allVideos[i].titleEs = summaries[i].titulo || allVideos[i].title;
      allVideos[i].miniResumen = summaries[i].resumen || '';
      allVideos[i].idioma = summaries[i].idioma || 'en';
      allVideos[i].relevante = summaries[i].relevante || 'no';
    }

    Logger.log('Mini-resumenes generados: ' + summaries.length);
  } catch (e) {
    Logger.log('Error en generateVideoSummaries: ' + e.message);
  }
}
