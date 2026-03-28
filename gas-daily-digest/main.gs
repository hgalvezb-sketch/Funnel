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

  // 9b. Obtener propuestas del Daily AI Coach
  var coachData = null;
  try {
    coachData = fetchCoachProposals_();
    Logger.log('Coach proposals: ' + (coachData ? coachData.propuestas.length + ' propuestas' : 'sin datos'));
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
 * Obtiene las propuestas del Daily AI Coach desde Render.
 * @returns {Object|null} - { propuestas: [...], proyecto_recomendado: N }
 */
function fetchCoachProposals_() {
  var coachUrl = 'https://daily-ai-coach.onrender.com/results/latest';

  try {
    var options = {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        'Accept': 'application/json'
      }
    };

    var response = UrlFetchApp.fetch(coachUrl, options);
    var code = response.getResponseCode();

    if (code === 200) {
      var data = JSON.parse(response.getContentText());
      return {
        propuestas: data.propuestas || [],
        proyecto_recomendado: data.proyecto_recomendado || null
      };
    } else if (code === 404) {
      Logger.log('COACH: No hay resultados recientes (404)');
      return null;
    } else {
      Logger.log('COACH: Error obteniendo propuestas: ' + code);
      return null;
    }
  } catch (e) {
    Logger.log('COACH: Exception obteniendo propuestas: ' + e.message);
    return null;
  }
}
