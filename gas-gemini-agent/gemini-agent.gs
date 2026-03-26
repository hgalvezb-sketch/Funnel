/**
 * Llama a Gemini 2.5 Flash con un prompt.
 * @param {string} prompt - El prompt a enviar
 * @return {string} La respuesta de Gemini
 */
function callGemini_(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada en Script Properties');
  }

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  var payload = {
    contents: [{
      parts: [{text: prompt}]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error('Gemini API error: ' + json.error.message);
  }

  if (!json.candidates || json.candidates.length === 0) {
    return 'Sin respuesta de Gemini.';
  }

  return json.candidates[0].content.parts[0].text;
}

/**
 * Procesa una pregunta del usuario desde el sidebar.
 * @param {string} question - La pregunta del usuario
 * @return {string} La respuesta de Gemini
 */
function processQuestion(question) {
  // Detect which tabs might be relevant based on keywords
  var relevantTabs = detectRelevantTabs_(question);

  // Get data from relevant tabs
  var sheetData = getRelevantData_(relevantTabs);

  var systemContext = 'Eres un asistente de analisis de riesgo para FINDEP (Financiera Independencia), '
    + 'una microfinanciera mexicana. Estas analizando la "Calculadora AI & CI & RO" que contiene '
    + 'variables de riesgo (Var1-Var14), parametros FISA y AEF, datos de cartera, e historicos. '
    + 'Responde siempre en espanol, se conciso y referencia las pestanas y celdas cuando sea relevante.\n\n';

  var prompt = systemContext
    + 'DATOS DEL SPREADSHEET:\n' + sheetData
    + '\n\nPREGUNTA DEL USUARIO: ' + question;

  return callGemini_(prompt);
}

/**
 * Detecta que pestanas son relevantes para la pregunta.
 */
function detectRelevantTabs_(question) {
  var q = question.toLowerCase();
  var tabs = [];

  // Always include base data
  tabs.push('Base_para_calculo');

  if (q.match(/tendencia|historico|historial|evolucion|tiempo/)) {
    tabs.push('Historico CI');
  }
  if (q.match(/cartera|portafolio|credito|prestamo/)) {
    tabs.push('cartera', 'cartera_BQ');
  }
  if (q.match(/fisa|parametro|configuracion/)) {
    tabs.push('Parametros FISA');
  }
  if (q.match(/aef/)) {
    tabs.push('Parametros AEF');
  }
  if (q.match(/var\s*1\b|variable\s*1/)) tabs.push('Var1');
  if (q.match(/var\s*2\b|variable\s*2/)) tabs.push('Var2');
  if (q.match(/var\s*3\b|variable\s*3/)) tabs.push('Var3');
  if (q.match(/var\s*4\b|variable\s*4/)) tabs.push('Var4');
  if (q.match(/var\s*5\b|variable\s*5/)) tabs.push('Var5');
  if (q.match(/var\s*6|var\s*7|variable\s*6|variable\s*7/)) tabs.push('Var6 y 7');
  if (q.match(/var\s*8\b|variable\s*8/)) tabs.push('Var8');
  if (q.match(/var\s*9\b|variable\s*9/)) tabs.push('Var9');
  if (q.match(/var\s*10|variable\s*10/)) tabs.push('Var10');
  if (q.match(/var\s*11|variable\s*11/)) tabs.push('Var11');
  if (q.match(/var\s*12|variable\s*12|fpd/i)) tabs.push('Var12');
  if (q.match(/var\s*13|variable\s*13/)) tabs.push('Var13');
  if (q.match(/var\s*14|variable\s*14/)) tabs.push('Var 14');
  if (q.match(/riesgo|alerta|critico|anomal/)) {
    tabs.push('Var1', 'Var2', 'Var3', 'Var4', 'Var5');
  }
  if (q.match(/reporte|resumen|ejecutivo|general/)) {
    tabs.push('Parametros FISA', 'Parametros AEF', 'Historico CI');
  }
  if (q.match(/sucursal|directorio/)) {
    tabs.push('Directorio');
  }
  if (q.match(/automatiz/)) {
    tabs.push('Automatizacion');
  }

  // Deduplicate
  return tabs.filter(function(v, i, a) { return a.indexOf(v) === i; });
}

/**
 * Lee datos de las pestanas relevantes.
 * Returns a string with tab name + headers + first 20 rows for each tab.
 */
function getRelevantData_(tabNames) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parts = [];

  for (var i = 0; i < tabNames.length; i++) {
    var sheet = ss.getSheetByName(tabNames[i]);
    if (!sheet) continue;

    var lastRow = Math.min(sheet.getLastRow(), 21); // headers + 20 rows
    var lastCol = Math.min(sheet.getLastColumn(), 20); // max 20 columns

    if (lastRow < 1 || lastCol < 1) continue;

    var data = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    var lines = data.map(function(row) { return row.join('\t'); });

    parts.push('=== Pestana: ' + tabNames[i] + ' ===\n' + lines.join('\n'));
  }

  return parts.join('\n\n');
}
