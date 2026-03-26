/**
 * Crea el menu "AI Coach" al abrir la hoja de calculo.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('AI Coach')
    .addItem('Abrir Chat', 'showSidebar')
    .addSeparator()
    .addItem('Analizar Tendencias', 'menuAnalizarTendencias')
    .addItem('Alertas de Riesgo', 'menuAlertasRiesgo')
    .addItem('Generar Reporte', 'menuGenerarReporte')
    .addItem('Sugerir Mejoras', 'menuSugerirMejoras')
    .addToUi();
}

/**
 * Abre el sidebar con el chat de Gemini.
 */
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('sidebar')
    .setTitle('AI Coach - Chat')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Menu: Analizar Tendencias
 */
function menuAnalizarTendencias() {
  var sheetData = getRelevantData_(['Historico CI', 'cartera', 'Var1', 'Var2', 'Var3']);
  var prompt = 'Analiza las tendencias de las ultimas semanas en estos datos de riesgo crediticio e indicadores. '
    + 'Identifica patrones, cambios significativos y proyecciones. Responde en espanol.\n\n' + sheetData;
  var response = callGemini_(prompt);
  showResultDialog_('Analisis de Tendencias', response);
}

/**
 * Menu: Alertas de Riesgo
 */
function menuAlertasRiesgo() {
  var sheetData = getRelevantData_(['Base_para_calculo', 'Var1', 'Var2', 'Var3', 'Var4', 'Var5',
    'Var6 y 7', 'Var8', 'Var9', 'Var10', 'Var11', 'Var12', 'Var13', 'Var 14']);
  var prompt = 'Revisa estos datos de variables de riesgo (Var1 a Var14) de una calculadora de riesgos de una microfinanciera mexicana. '
    + 'Identifica valores fuera de rango, anomalias, o indicadores en zona critica. '
    + 'Presenta las alertas ordenadas por severidad (critica, alta, media). Responde en espanol.\n\n' + sheetData;
  var response = callGemini_(prompt);
  showResultDialog_('Alertas de Riesgo', response);
}

/**
 * Menu: Generar Reporte
 */
function menuGenerarReporte() {
  var sheetData = getRelevantData_(['Base_para_calculo', 'Parametros FISA', 'Parametros AEF',
    'Historico CI', 'cartera']);
  var prompt = 'Genera un resumen ejecutivo de esta calculadora de riesgos (AI, CI, RO) de FINDEP. '
    + 'Incluye: estado general, indicadores clave, comparacion con periodos anteriores, y recomendaciones. '
    + 'Formato: titulo, bullet points concisos, conclusion. Responde en espanol.\n\n' + sheetData;
  var response = callGemini_(prompt);

  // Write to new sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reportName = 'Reporte_' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
  var reportSheet = ss.getSheetByName(reportName);
  if (!reportSheet) {
    reportSheet = ss.insertSheet(reportName);
  }
  reportSheet.getRange('A1').setValue('Reporte Ejecutivo - ' + reportName);
  reportSheet.getRange('A3').setValue(response);
  reportSheet.getRange('A1').setFontSize(14).setFontWeight('bold');
  reportSheet.getRange('A3').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  reportSheet.setColumnWidth(1, 800);

  SpreadsheetApp.getUi().alert('Reporte generado en la pestana "' + reportName + '"');
}

/**
 * Menu: Sugerir Mejoras
 */
function menuSugerirMejoras() {
  var sheetData = getRelevantData_(['Documentacion', 'Automatizacion', 'Base_para_calculo']);
  var prompt = 'Analiza la estructura y documentacion de esta calculadora de riesgos. '
    + 'Sugiere mejoras concretas: automatizaciones, nuevos indicadores, visualizaciones, '
    + 'o integraciones que podrian agregar valor. Se especifico y accionable. Responde en espanol.\n\n' + sheetData;
  var response = callGemini_(prompt);
  showResultDialog_('Sugerencias de Mejora', response);
}

/**
 * Muestra un dialogo con el resultado de Gemini.
 */
function showResultDialog_(title, content) {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Google Sans,Arial,sans-serif;padding:16px;line-height:1.6;">'
    + '<pre style="white-space:pre-wrap;font-family:inherit;">' + escapeHtml_(content) + '</pre>'
    + '</div>'
  ).setWidth(600).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

/**
 * Escapa HTML.
 */
function escapeHtml_(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
