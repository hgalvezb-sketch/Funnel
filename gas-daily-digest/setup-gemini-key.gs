/**
 * EJECUTAR UNA SOLA VEZ: Configura el API key de Gemini en Script Properties.
 */
function setupGeminiKey() {
  var apiKey = 'AIzaSyDmRDlOkPiTqGK0aWTn358z6CbldM1wUxg';
  
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey);
  
  Logger.log('✓ GEMINI_API_KEY configurado correctamente');
  
  // Verificar
  var saved = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  Logger.log('Verificacion: ' + (saved ? 'OK (longitud: ' + saved.length + ')' : 'ERROR'));
}
