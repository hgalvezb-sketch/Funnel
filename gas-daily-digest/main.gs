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
  var likedChannelVideos = [];
  var rssNews = [];
  var likedInsights = { channels: [], keywords: [] };
  var errors = [];

  // 1. Videos de suscripciones
  try {
    subscriptionVideos = getSubscriptionVideos();
    Logger.log('Suscripciones: ' + subscriptionVideos.length + ' videos');
  } catch (e) {
    Logger.log('Error YouTube suscripciones: ' + e.message);
    errors.push('YouTube suscripciones: ' + e.message);
  }

  // 2. Insights de likes (canales y keywords)
  var excludeSet = {};
  subscriptionVideos.forEach(function(v) { excludeSet[v.videoId] = true; });

  try {
    likedInsights = getLikedVideosInsights();
    Logger.log('Likes insights: ' + likedInsights.channels.length + ' canales, ' + likedInsights.keywords.length + ' keywords');
  } catch (e) {
    Logger.log('Error likes insights: ' + e.message);
    errors.push('Likes insights: ' + e.message);
  }

  // 3. Videos de canales con likes
  try {
    likedChannelVideos = getVideosFromLikedChannels(likedInsights.channels, excludeSet);
    Logger.log('Liked channels: ' + likedChannelVideos.length + ' videos');
  } catch (e) {
    Logger.log('Error liked channels: ' + e.message);
    errors.push('Liked channels: ' + e.message);
  }

  // 4. Busqueda publica (personalizada con keywords de likes)
  try {
    var excludeIds = Object.keys(excludeSet);
    searchVideos = searchNewVideos(excludeIds, likedInsights.keywords);
    Logger.log('Busqueda: ' + searchVideos.length + ' videos');
  } catch (e) {
    Logger.log('Error YouTube busqueda: ' + e.message);
    errors.push('YouTube busqueda: ' + e.message);
  }

  // 5. RSS
  try {
    rssNews = fetchRSSNews();
    Logger.log('RSS: ' + rssNews.length + ' noticias');
  } catch (e) {
    Logger.log('Error RSS: ' + e.message);
    errors.push('RSS: ' + e.message);
  }

  // 6. Verificar si hay contenido
  var totalContent = subscriptionVideos.length + searchVideos.length + likedChannelVideos.length + rssNews.length;
  if (totalContent === 0) {
    Logger.log('Sin contenido hoy. No se envia email.');
    checkStaleDigest_(props, recipient);
    return;
  }

  // 7. Resumen Gemini
  var summary = '';
  try {
    summary = generateGeminiSummary(subscriptionVideos, searchVideos, rssNews, likedChannelVideos);
    Logger.log('Gemini summary: ' + (summary ? 'OK' : 'vacio'));
  } catch (e) {
    Logger.log('Error Gemini: ' + e.message);
    errors.push('Gemini: ' + e.message);
  }

  // 8. Mini-resumenes individuales por video + clasificacion de idioma
  var allVideos = subscriptionVideos.concat(likedChannelVideos, searchVideos);
  try {
    generateVideoSummaries(allVideos);
    Logger.log('Mini-resumenes: ' + allVideos.filter(function(v) { return v.miniResumen; }).length + ' generados');
  } catch (e) {
    Logger.log('Error mini-resumenes: ' + e.message);
    errors.push('Mini-resumenes: ' + e.message);
  }

  // 8b. Enriquecer con duracion
  try {
    enrichVideosWithDuration(allVideos);
    Logger.log('Duraciones obtenidas: ' + allVideos.filter(function(v) { return v.duration; }).length);
  } catch (e) {
    Logger.log('Error duraciones: ' + e.message);
    errors.push('Duraciones: ' + e.message);
  }

  // 8c. Filtrar: solo español + solo relevantes
  var beforeFilter = { subs: subscriptionVideos.length, liked: likedChannelVideos.length, search: searchVideos.length };
  var esYRelevante = function(v) { return v.idioma === 'es' && v.relevante === 'si'; };
  subscriptionVideos = subscriptionVideos.filter(esYRelevante);
  likedChannelVideos = likedChannelVideos.filter(esYRelevante);
  searchVideos = searchVideos.filter(esYRelevante);
  Logger.log('Filtro español+relevante: subs ' + beforeFilter.subs + '->' + subscriptionVideos.length
    + ', liked ' + beforeFilter.liked + '->' + likedChannelVideos.length
    + ', search ' + beforeFilter.search + '->' + searchVideos.length);

  // Verificar si quedo contenido despues del filtro
  var totalAfterFilter = subscriptionVideos.length + likedChannelVideos.length + searchVideos.length + rssNews.length;
  if (totalAfterFilter === 0) {
    Logger.log('Sin contenido en español hoy. No se envia email.');
    checkStaleDigest_(props, recipient);
    return;
  }

  // 9. Tips personalizados
  var tips = [];
  try {
    var videosForTips = subscriptionVideos.concat(likedChannelVideos, searchVideos);
    tips = generatePersonalTips(videosForTips, rssNews);
    Logger.log('Tips: ' + tips.length);
  } catch (e) {
    Logger.log('Error tips: ' + e.message);
    errors.push('Tips: ' + e.message);
  }

  // 9b. Generar propuestas del Daily AI Coach con Gemini
  var coachData = null;
  try {
    var digestDataForCoach = {
      summary: summary,
      subscriptionVideos: subscriptionVideos,
      searchVideos: searchVideos,
      likedChannelVideos: likedChannelVideos,
      rssNews: rssNews
    };
    coachData = generateCoachProposalsWithGemini_(digestDataForCoach);
    Logger.log('Coach proposals: ' + (coachData ? coachData.propuestas.length + ' propuestas generadas con Gemini' : 'sin datos'));
  } catch (e) {
    Logger.log('Error coach proposals: ' + e.message);
    errors.push('Coach proposals: ' + e.message);
  }

  // 10. Construir y enviar email
  var emailData = {
    summary: summary,
    subscriptionVideos: subscriptionVideos,
    searchVideos: searchVideos,
    likedChannelVideos: likedChannelVideos,
    rssNews: rssNews,
    tips: tips,
    coachProposals: coachData ? coachData.propuestas : [],
    coachRecommended: coachData ? coachData.proyecto_recomendado : null
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

  // 2. Likes insights
  var excludeSet = {};
  subs.forEach(function(v) { excludeSet[v.videoId] = true; });
  var insights = getLikedVideosInsights();
  Logger.log('Likes: ' + insights.channels.length + ' canales, keywords: ' + insights.keywords.join(', '));

  // 3. Videos de canales con likes
  var liked = getVideosFromLikedChannels(insights.channels, excludeSet);
  Logger.log('Liked channels videos: ' + liked.length);
  liked.forEach(function(v) { Logger.log('  [LIKED] ' + v.title + ' — ' + v.channel); });

  // 4. Busqueda
  var search = searchNewVideos(Object.keys(excludeSet));
  Logger.log('Busqueda encontrada: ' + search.length);
  search.forEach(function(v) { Logger.log('  [SEARCH] ' + v.title + ' — ' + v.channel); });

  // 5. RSS
  var rss = fetchRSSNews();
  Logger.log('RSS encontradas: ' + rss.length);
  rss.forEach(function(n) { Logger.log('  [RSS] ' + n.title + ' — ' + n.source); });

  // 6. Gemini
  var summary = generateGeminiSummary(subs, search, rss, liked);
  Logger.log('Gemini summary:\n' + summary);

  // 7. Email HTML (solo loguear tamano)
  var html = buildEmailHTML({
    summary: summary,
    subscriptionVideos: subs,
    searchVideos: search,
    likedChannelVideos: liked,
    rssNews: rss
  });
  Logger.log('Email HTML generado: ' + html.length + ' chars');

  Logger.log('=== TEST DIGEST END ===');
  Logger.log('Total: ' + subs.length + ' subs + ' + liked.length + ' liked + ' + search.length + ' search + ' + rss.length + ' rss');
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

// ============================================================
// DAILY AI COACH - Webhook trigger
// ============================================================

/**
 * Revisa si hay un email "Daily AI Digest" sin procesar
 * y envia su contenido al pipeline Daily AI Coach.
 * Trigger: cada 10 minutos.
 */
function onDigestArrive() {
  var props = PropertiesService.getScriptProperties();
  var webhookUrl = props.getProperty('COACH_WEBHOOK_URL');
  var webhookSecret = props.getProperty('COACH_WEBHOOK_SECRET');

  if (!webhookUrl || !webhookSecret) {
    Logger.log('COACH: webhook URL o secret no configurados. Salteando.');
    return;
  }

  // Buscar label o crearlo
  var labelName = 'AI_Coach_Processed';
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log('COACH: Label "' + labelName + '" creado.');
  }

  // Buscar threads con "Daily AI Digest" que NO tengan el label
  var query = 'subject:"Daily AI Digest" -label:' + labelName;
  var threads = GmailApp.search(query, 0, 5);

  if (threads.length === 0) {
    Logger.log('COACH: No hay digest nuevo sin procesar.');
    return;
  }

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var message = thread.getMessages()[thread.getMessages().length - 1]; // ultimo mensaje
    var htmlBody = message.getBody();
    var subject = message.getSubject();
    var dateStr = Utilities.formatDate(message.getDate(), 'America/Mexico_City', 'yyyy-MM-dd');

    Logger.log('COACH: Procesando digest del ' + dateStr + ': ' + subject);

    try {
      var payload = {
        html_content: htmlBody,
        date: dateStr,
        subject: subject,
        secret: webhookSecret
      };

      var options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      var response = UrlFetchApp.fetch(webhookUrl, options);
      var responseCode = response.getResponseCode();

      if (responseCode === 202) {
        thread.addLabel(label);
        Logger.log('COACH: Digest enviado OK. Label aplicado. Response: ' + responseCode);
      } else {
        Logger.log('COACH: Error del webhook. Response: ' + responseCode + ' - ' + response.getContentText());
      }
    } catch (e) {
      Logger.log('COACH: Error enviando webhook: ' + e.message);
    }
  }
}

/**
 * Configura el trigger de onDigestArrive cada 10 minutos.
 * Ejecutar UNA SOLA VEZ desde el editor.
 */
function setupCoachTrigger() {
  // Eliminar triggers existentes para evitar duplicados
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onDigestArrive') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onDigestArrive')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('COACH: Trigger configurado: onDigestArrive cada 10 min');
}

/**
 * Test: ejecuta onDigestArrive manualmente para verificar.
 */
function testCoachWebhook() {
  Logger.log('=== TEST COACH WEBHOOK ===');
  onDigestArrive();
  Logger.log('=== TEST COACH WEBHOOK END ===');
}

/**
 * Genera propuestas del Daily AI Coach usando Gemini API directamente.
 * @param {Object} digestData - Datos del digest (videos, summary, etc)
 * @returns {Object|null} - { propuestas: [...], proyecto_recomendado: N }
 */
function generateCoachProposalsWithGemini_(digestData) {
  var props = PropertiesService.getScriptProperties();
  var geminiApiKey = props.getProperty('GEMINI_API_KEY');

  if (!geminiApiKey) {
    Logger.log('COACH: GEMINI_API_KEY no configurado');
    return null;
  }

  try {
    // Construir resumen del digest
    var digestSummary = buildDigestSummary_(digestData);

    // Construir prompt completo
    var systemPrompt = 'Eres el Daily AI Coach de un desarrollador senior en FINDEP (microfinanciera mexicana).\n' +
      'Tu rol es analizar el contenido del Daily AI Digest (videos, noticias) y cruzarlo con los proyectos actuales del usuario para generar propuestas de mejora accionables.\n\n' +
      'El usuario trabaja con: Java, JavaScript, HTML (Full Stack), Google Apps Script, Python (FastAPI), React, Flutter, Claude Code, y Google Cloud.\n\n' +
      'Proyectos conocidos:\n' +
      '- Calculadora AI & CI & RO: analisis de riesgo crediticio e indicadores\n' +
      '- bd_Agent_Disp: dashboard operativo con 7 pestanas en Apps Script\n' +
      '- CIRO: auditoria crediticia con analisis de PDFs\n' +
      '- Funnel Dashboard: React + Recharts para metricas\n' +
      '- Cedula AROS: evaluacion de riesgo operativo en sucursales\n' +
      '- Daily AI Digest: correo diario con videos y noticias de IA\n\n' +
      'REGLAS:\n' +
      '1. Genera EXACTAMENTE 5 propuestas\n' +
      '2. Cada propuesta debe conectar contenido del digest con un proyecto existente\n' +
      '3. Incluye motivacion persuasiva para arrancar HOY\n' +
      '4. El plan_rapido debe tener 3-5 pasos concretos\n' +
      '5. Varia el esfuerzo: al menos 1 propuesta de "1h" y al menos 1 de "1d" o mas\n\n' +
      'Responde SOLO con JSON valido, sin markdown ni explicaciones.\n' +
      'Formato: {"fecha":"YYYY-MM-DD","resumen_dia":"...","propuestas":[{"id":1,"titulo":"...","descripcion":"...","sheet_relacionado":"...","video_fuente":"...","impacto":"alto|medio|bajo","esfuerzo":"1h|4h|1d|3d","plan_rapido":["..."],"motivacion":"..."}],"proyecto_recomendado":1}';

    var userPrompt = '## Digest del dia\n' + digestSummary;

    var fullPrompt = systemPrompt + '\n\n' + userPrompt;

    // Llamar a Gemini API
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiApiKey;

    var payload = {
      contents: [{
        parts: [{text: fullPrompt}]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      Logger.log('COACH: Gemini API error ' + responseCode + ': ' + response.getContentText());
      return null;
    }

    var data = JSON.parse(response.getContentText());

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      Logger.log('COACH: Gemini response incompleta');
      return null;
    }

    var rawText = data.candidates[0].content.parts[0].text;

    // Limpiar markdown si existe
    if (rawText.indexOf('```') >= 0) {
      rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    var result = JSON.parse(rawText);

    return {
      propuestas: result.propuestas || [],
      proyecto_recomendado: result.proyecto_recomendado || null
    };

  } catch (e) {
    Logger.log('COACH: Error generando propuestas con Gemini: ' + e.message);
    Logger.log('Stack: ' + e.stack);
    return null;
  }
}

/**
 * Construye resumen del digest para el prompt de Gemini.
 */
function buildDigestSummary_(digestData) {
  var lines = [];
  var today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');

  lines.push('Daily AI Digest del ' + today);

  // Videos
  var totalVideos = 0;
  if (digestData.subscriptionVideos) totalVideos += digestData.subscriptionVideos.length;
  if (digestData.searchVideos) totalVideos += digestData.searchVideos.length;
  if (digestData.likedChannelVideos) totalVideos += digestData.likedChannelVideos.length;

  if (totalVideos > 0) {
    lines.push('\nVideos encontrados: ' + totalVideos);

    var allVideos = [];
    if (digestData.subscriptionVideos) allVideos = allVideos.concat(digestData.subscriptionVideos);
    if (digestData.searchVideos) allVideos = allVideos.concat(digestData.searchVideos);
    if (digestData.likedChannelVideos) allVideos = allVideos.concat(digestData.likedChannelVideos);

    allVideos.forEach(function(v) {
      var title = v.titleEs || v.title || v.videoId;
      lines.push('- ' + title + ' (' + (v.channel || 'Unknown') + ')');
    });
  }

  // Noticias RSS
  if (digestData.rssNews && digestData.rssNews.length > 0) {
    lines.push('\nNoticias RSS: ' + digestData.rssNews.length);
    digestData.rssNews.forEach(function(item) {
      lines.push('- ' + item.title);
    });
  }

  // Resumen Gemini si existe
  if (digestData.summary) {
    lines.push('\n## Resumen del contenido\n' + digestData.summary);
  }

  return lines.join('\n');
}

/**
 * Test: Envia email con las nuevas secciones (Propuestas + URLs).
 * Genera propuestas con Gemini en tiempo real.
 */
function testCoachEmailSections() {
  Logger.log('=== TEST EMAIL COACH SECTIONS ===');

  var props = PropertiesService.getScriptProperties();
  var recipient = props.getProperty('RECIPIENT_EMAIL') || 'hgalvezb@findep.com.mx';

  // Datos mock para el test
  var mockDigestData = {
    summary: 'Este es un test del Daily AI Digest con las nuevas secciones: PROPUESTAS DEL DIA y URLs DEL DIGEST.\n\nLas propuestas se generan con Gemini API directamente desde Apps Script, sin depender de Render.',
    subscriptionVideos: [
      { url: 'https://www.youtube.com/watch?v=J3n43K6i2z8', title: 'Google Cloud Next Partner Spotlight', channel: 'Google Cloud', publishedAt: new Date().toISOString(), duration: '3:00' }
    ],
    searchVideos: [
      { url: 'https://www.youtube.com/watch?v=3vrn03I5Tss', title: 'Claude Code Update Explained', channel: 'RoboNuggets', publishedAt: new Date().toISOString(), duration: '14:51' }
    ],
    likedChannelVideos: [],
    rssNews: [
      { link: 'https://github.com/anthropics/claude-code/releases/tag/v2.1.86', title: 'v2.1.86', source: 'Claude Code Releases' }
    ]
  };

  // Generar propuestas con Gemini
  var coachData = generateCoachProposalsWithGemini_(mockDigestData);
  Logger.log('Coach data: ' + (coachData ? coachData.propuestas.length + ' propuestas generadas' : 'sin datos'));

  var emailData = {
    summary: mockDigestData.summary,
    subscriptionVideos: mockDigestData.subscriptionVideos,
    searchVideos: mockDigestData.searchVideos,
    likedChannelVideos: mockDigestData.likedChannelVideos,
    rssNews: mockDigestData.rssNews,
    tips: [
      { numero: 1, titulo: 'Test Tip 1', consejo: 'Este es un consejo de prueba para verificar el formato.' },
      { numero: 2, titulo: 'Test Tip 2', consejo: 'Otro consejo de prueba con formato correcto.' }
    ],
    coachProposals: coachData ? coachData.propuestas : [],
    coachRecommended: coachData ? coachData.proyecto_recomendado : null
  };

  var htmlBody = buildEmailHTML(emailData);

  var today = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd MMM yyyy');

  GmailApp.sendEmail(recipient, '[TEST] Daily AI Digest - Gemini Directo - ' + today, '', {
    htmlBody: htmlBody,
    name: 'Daily AI Digest'
  });

  Logger.log('Email de prueba enviado a ' + recipient);
  Logger.log('=== TEST EMAIL COACH SECTIONS END ===');
}
