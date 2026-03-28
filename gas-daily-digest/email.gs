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

  // Seccion: Videos de canales que te gustan
  if (data.likedChannelVideos && data.likedChannelVideos.length > 0) {
    html += buildVideoSection_('CANALES QUE TE GUSTAN', data.likedChannelVideos, '#8e44ad');
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

  // Seccion: Tips personalizados
  if (data.tips && data.tips.length > 0) {
    html += '<div style="margin-bottom:24px;">';
    html += '<h2 style="font-size:16px;color:#1a1a2e;border-bottom:2px solid #2ecc71;padding-bottom:6px;margin-bottom:12px;">10 CONSEJOS DE INNOVACION PARA TI</h2>';
    data.tips.forEach(function(tip) {
      html += '<div style="margin-bottom:12px;padding:10px;background:#fff;border-left:3px solid #2ecc71;border-radius:0 4px 4px 0;">';
      html += '<div style="font-size:13px;font-weight:bold;color:#1a1a2e;">' + escapeHtml_(tip.numero + '. ' + tip.titulo) + '</div>';
      html += '<p style="margin:4px 0 0;font-size:13px;color:#555;line-height:1.4;">' + escapeHtml_(tip.consejo) + '</p>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Seccion: Propuestas del Daily AI Coach
  if (data.coachProposals && data.coachProposals.length > 0) {
    html += buildCoachProposalsSection_(data.coachProposals, data.coachRecommended);
  }

  // Seccion: URLs del Digest (para NotebookLM)
  html += buildUrlsSection_(data);

  // Footer
  html += '<div style="text-align:center;padding-top:16px;border-top:1px solid #e0e0e0;color:#999;font-size:11px;">';
  html += 'Generado automaticamente por Daily AI Digest + AI Coach | Claude Code';
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
    var displayTitle = video.titleEs || video.title;
    html += '<div style="margin-bottom:14px;">';
    var pubDate = video.publishedAt ? formatDate_(video.publishedAt) : '';
    html += '<a href="' + escapeHtml_(video.url) + '" style="color:#2980b9;text-decoration:none;font-size:14px;font-weight:bold;">' + escapeHtml_(displayTitle) + '</a>';
    var durationBadge = video.duration ? ' · &#9202; ' + escapeHtml_(video.duration) : '';
    html += '<span style="color:#888;font-size:12px;"> — ' + escapeHtml_(video.channel) + (pubDate ? ' · ' + pubDate : '') + durationBadge + '</span>';
    if (video.titleEs && video.titleEs !== video.title) {
      html += '<div style="margin:2px 0 0 0;font-size:11px;color:#999;">' + escapeHtml_(video.title) + '</div>';
    }
    if (video.miniResumen) {
      html += '<p style="margin:4px 0 0 0;font-size:13px;color:#555;line-height:1.4;font-style:italic;">' + escapeHtml_(video.miniResumen) + '</p>';
    }
    html += '</div>';
  });

  html += '</div>';
  return html;
}

/**
 * Formatea fecha ISO a formato legible (ej: "22 mar 2026").
 */
function formatDate_(isoString) {
  try {
    var d = new Date(isoString);
    return Utilities.formatDate(d, 'America/Mexico_City', 'dd MMM yyyy');
  } catch (e) {
    return '';
  }
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

/**
 * Construye la seccion de propuestas del Daily AI Coach.
 */
function buildCoachProposalsSection_(proposals, recommended) {
  var html = '<div style="margin-bottom:24px;">';
  html += '<h2 style="font-size:16px;color:#1a1a2e;border-bottom:2px solid #9b59b6;padding-bottom:6px;margin-bottom:12px;">PROPUESTAS DEL DIA</h2>';

  // Tabla de propuestas
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';

  // Header
  html += '<tr style="background:#1a1a2e;color:#fff;">';
  html += '<th style="padding:8px;text-align:left;">#</th>';
  html += '<th style="padding:8px;text-align:left;">Propuesta</th>';
  html += '<th style="padding:8px;text-align:left;">Conecta con</th>';
  html += '<th style="padding:8px;text-align:center;">Impacto</th>';
  html += '<th style="padding:8px;text-align:center;">Esfuerzo</th>';
  html += '</tr>';

  // Filas de propuestas
  proposals.forEach(function(prop) {
    var isRecommended = prop.id === recommended;
    var rowStyle = isRecommended ? 'background:#f0fff0;' : '';
    var idText = isRecommended ? '*' + prop.id : prop.id;
    var fontWeight = isRecommended ? 'font-weight:bold;' : '';

    html += '<tr style="' + rowStyle + '">';
    html += '<td style="padding:8px;border-bottom:1px solid #eee;' + fontWeight + '">' + idText + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #eee;' + fontWeight + '">' + escapeHtml_(prop.titulo) + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #eee;' + fontWeight + '">' + escapeHtml_(prop.sheet_relacionado || prop.proyecto || '') + '</td>';
    html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #eee;">' + buildImpactBadge_(prop.impacto) + '</td>';
    html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #eee;' + fontWeight + '">' + escapeHtml_(prop.esfuerzo) + '</td>';
    html += '</tr>';
  });

  html += '</table>';
  html += '<p style="font-size:12px;color:#2ecc71;margin-top:8px;">* = recomendada (mejor ratio impacto/esfuerzo)</p>';
  html += '</div>';

  return html;
}

/**
 * Construye badge de impacto con color.
 */
function buildImpactBadge_(impacto) {
  var color = '#999';
  if (impacto === 'alto') color = '#e74c3c';
  else if (impacto === 'medio') color = '#f39c12';
  else if (impacto === 'bajo') color = '#3498db';

  return '<span style="background:' + color + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">' + escapeHtml_(impacto) + '</span>';
}

/**
 * Construye la seccion de URLs del digest (para NotebookLM).
 */
function buildUrlsSection_(data) {
  var urls = [];

  // Extraer URLs de videos
  if (data.subscriptionVideos) {
    data.subscriptionVideos.forEach(function(v) { urls.push(v.url); });
  }
  if (data.likedChannelVideos) {
    data.likedChannelVideos.forEach(function(v) { urls.push(v.url); });
  }
  if (data.searchVideos) {
    data.searchVideos.forEach(function(v) { urls.push(v.url); });
  }

  // Extraer URLs de RSS
  if (data.rssNews) {
    data.rssNews.forEach(function(item) { urls.push(item.link); });
  }

  if (urls.length === 0) return '';

  var html = '<div style="margin-bottom:24px;">';
  html += '<h2 style="font-size:16px;color:#1a1a2e;border-bottom:2px solid #e67e22;padding-bottom:6px;margin-bottom:12px;">URLs DEL DIGEST</h2>';
  html += '<div style="background:#fff;padding:12px;border-radius:4px;font-family:monospace;font-size:12px;line-height:2;">';

  urls.forEach(function(url, index) {
    html += escapeHtml_(url);
    if (index < urls.length - 1) html += '<br>';
  });

  html += '</div>';
  html += '</div>';

  return html;
}
