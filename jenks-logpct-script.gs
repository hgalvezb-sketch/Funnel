/**
 * Script: Jenks Natural Breaks + Log+Percentiles
 * Para clasificar FPD% en 5 categorías de riesgo.
 *
 * Instrucciones:
 * 1. Abrir el spreadsheet en Google Sheets
 * 2. Extensiones > Apps Script
 * 3. Pegar este código
 * 4. Guardar y recargar la hoja
 * 5. Aparecerá el menú "Clasificación FPD" con el botón para ejecutar
 */

var LABELS = ['Mínimo', 'Bajo', 'Moderado', 'Alto', 'Crítico'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Clasificación FPD')
    .addItem('Ejecutar Jenks + Log+Percentiles', 'runClassification')
    .addToUi();
}

function runClassification() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Copia de Var12');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la pestaña "Copia de Var12"');
    return;
  }

  // Leer columna E desde fila 3 hasta última fila con datos
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(3, 5, lastRow - 2, 1); // col E = 5
  var rawValues = range.getDisplayValues();

  // Parsear valores FPD%
  var entries = [];
  for (var i = 0; i < rawValues.length; i++) {
    var raw = rawValues[i][0].toString().replace('%', '').trim();
    var val = parseFloat(raw);
    if (!isNaN(val) && raw !== '') {
      entries.push({ idx: i, val: val });
    }
  }

  if (entries.length === 0) {
    SpreadsheetApp.getUi().alert('No se encontraron valores en columna E');
    return;
  }

  var allVals = entries.map(function(e) { return e.val; });

  // === JENKS NATURAL BREAKS (5 clases) ===
  var breaks = jenksBreaks(allVals, 5);

  // === LOG + PERCENTILES ===
  var nonZero = allVals.filter(function(v) { return v > 0; }).sort(function(a, b) { return a - b; });
  var logNZ = nonZero.map(function(v) { return Math.log(v); }).sort(function(a, b) { return a - b; });
  var n = logNZ.length;
  var p25 = logNZ[Math.floor(n * 0.25)];
  var p50 = logNZ[Math.floor(n * 0.50)];
  var p75 = logNZ[Math.floor(n * 0.75)];

  // Clasificar cada entrada (si no tiene valor = Mínimo, nunca dejar vacío)
  var results = new Array(rawValues.length);
  for (var i = 0; i < rawValues.length; i++) {
    results[i] = [LABELS[0], LABELS[0]]; // default Mínimo
  }

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    results[e.idx] = [
      classifyJenks(e.val, breaks),
      classifyLogPct(e.val, p25, p50, p75)
    ];
  }

  // Escribir resultados en columnas F y G
  var outputRange = sheet.getRange(3, 6, results.length, 2); // col F=6, G=7
  outputRange.setValues(results);

  // Resumen
  var jCounts = countCategories(results, 0);
  var lCounts = countCategories(results, 1);

  var msg = 'Clasificación completada: ' + entries.length + ' filas procesadas.\n\n';
  msg += 'JENKS NATURAL BREAKS:\n';
  msg += '  Cortes: ' + breaks.map(function(b) { return b.toFixed(4) + '%'; }).join(' | ') + '\n';
  for (var k in jCounts) msg += '  ' + k + ': ' + jCounts[k] + '\n';
  msg += '\nLOG + PERCENTILES:\n';
  msg += '  P25=' + Math.exp(p25).toFixed(4) + '%, P50=' + Math.exp(p50).toFixed(4) + '%, P75=' + Math.exp(p75).toFixed(4) + '%\n';
  for (var k in lCounts) msg += '  ' + k + ': ' + lCounts[k] + '\n';

  SpreadsheetApp.getUi().alert(msg);
}

// ========== JENKS NATURAL BREAKS ==========
function jenksBreaks(data, numClasses) {
  var sorted = data.slice().sort(function(a, b) { return a - b; });
  var n = sorted.length;

  if (n <= numClasses) return sorted;

  // Inicializar matrices
  var lcl = []; // lowerClassLimits
  var vc = [];  // varianceCombinations
  for (var i = 0; i <= n; i++) {
    lcl[i] = new Array(numClasses + 1).fill(0);
    vc[i] = new Array(numClasses + 1).fill(Infinity);
  }

  for (var i = 1; i <= numClasses; i++) {
    lcl[1][i] = 1;
    vc[1][i] = 0;
  }

  for (var l = 2; l <= n; l++) {
    var sum = 0, sumSq = 0;
    for (var m = 1; m <= l; m++) {
      var lower = l - m + 1;
      var val = sorted[lower - 1];
      sum += val;
      sumSq += val * val;
      var variance = sumSq - (sum * sum) / m;

      if (lower > 1) {
        for (var j = 2; j <= numClasses; j++) {
          var newVar = variance + vc[lower - 1][j - 1];
          if (newVar < vc[l][j]) {
            lcl[l][j] = lower;
            vc[l][j] = newVar;
          }
        }
      }
    }
    lcl[l][1] = 1;
    vc[l][1] = sumSq - (sum * sum) / l;
  }

  // Extraer cortes
  var breaks = new Array(numClasses + 1);
  breaks[numClasses] = sorted[n - 1];
  breaks[0] = sorted[0];
  var k = n;
  for (var j = numClasses; j >= 2; j--) {
    var id = lcl[k][j] - 2;
    breaks[j - 1] = sorted[id];
    k = lcl[k][j] - 1;
  }
  return breaks;
}

function classifyJenks(val, breaks) {
  for (var i = 1; i < breaks.length; i++) {
    if (val <= breaks[i]) return LABELS[i - 1];
  }
  return LABELS[LABELS.length - 1];
}

// ========== LOG + PERCENTILES ==========
function classifyLogPct(val, p25, p50, p75) {
  if (val === 0) return LABELS[0]; // Zeros = Muy Bajo
  var logVal = Math.log(val);
  if (logVal <= p25) return LABELS[1]; // 2-Bajo
  if (logVal <= p50) return LABELS[2]; // 3-Medio
  if (logVal <= p75) return LABELS[3]; // 4-Alto
  return LABELS[4]; // 5-Muy Alto
}

// ========== UTILIDADES ==========
function countCategories(results, colIdx) {
  var counts = {};
  for (var i = 0; i < results.length; i++) {
    var cat = results[i][colIdx];
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}
