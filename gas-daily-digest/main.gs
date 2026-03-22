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
