// ================================================================
// MONITOR DE DISPOSICIONES v2.0 - Pre-agregacion + Incidencias + Exportacion
// ================================================================
// Arquitectura:
// - Un trigger cada 10 min pre-calcula KPIs, graficas y riesgos
// - doGet() sirve datos pre-calculados (~100KB) via template
// - Filtros y tabla usan llamadas server-side bajo demanda
// - Sistema de incidencias con CRUD en hoja _incidencias
// - Exportacion de secciones a Google Sheets independientes
// ================================================================

var CONFIG = {
  DATA_SHEET: 'bd_disp',
  CACHE_SHEET: '_dashboard_cache',
  SLIM_SHEET: '_dashboard_slim',
  INCIDENCIAS_SHEET: '_incidencias',
  SEGUIMIENTO_SHEET: '_seguimiento_eventos',
  AUTH_SHEET: '_usuarios_autorizados',
  HIST_SHEET: '_historico',
  DATA_RANGE_END: 'DG',
  FLAG_RANGE: 'CR1:DD1',
  TRIGGER_MINUTES: 10,
  TABLE_PAGE_SIZE: 50,
  MAX_DETAIL_ROWS: 50,
  MAX_FILTER_OPTIONS: 200
};

var AUTH_HEADERS = ['Email', 'Rol', 'Activo'];

var SLIM_COL_NAMES = [
  'sucursal2','contrato','folio','tipo_dispo','estatus_destino',
  'A1','CALIFICACION','empresa','total_disposicion','COUNT','Edad'
];

var HISTORICO_HEADERS = [
  'fecha','totalReg','totalMonto','totalInc','tasaInc','montoInc','sucursalesCount',
  'capitalInsoluto','saldoVencido',
  'flagFueraHorario','flagMismodia','flagForaneas','flagTelRepetido','flagTelColab',
  'flagContratosRapidos','flagPagoSpei','flagMontoDup','flagDisp24k','flagCalif5',
  'flagDias120','flagReversados','flagHighMonto'
];

var INCIDENCIA_HEADERS = [
  'ID','Fecha_Registro','Sucursal','Contrato','Folio',
  'Tipo_Hallazgo','Severidad','Descripcion','Accion_Recomendada',
  'Responsable','Fecha_Compromiso','Estado','Fecha_Actualizacion','Registrado_Por'
];

var SEGUIMIENTO_HEADERS = [
  'ID','Fecha_Deteccion','Tipo','Categoria','Sucursal','Contrato','Folio',
  'Monto','Etapa','Confirmado','Tipo_Hallazgo','Asignado_A','Suma_Alertas',
  'Prioridad','Notas','Fecha_Actualizacion','Registrado_Por','Columna_Origen','Evento_DG'
];

var CONTROL_COLUMNS = ['CQ','CU','CV','DC','CX','CY'];

var ETAPA_TRANSICIONES = {
  'DETECTADO': ['EN_ANALISIS'],
  'EN_ANALISIS': ['CONFIRMADO', 'CERRADO'],
  'CONFIRMADO': ['ASIGNADO'],
  'ASIGNADO': ['EN_INVESTIGACION'],
  'EN_INVESTIGACION': ['DICTAMINADO'],
  'DICTAMINADO': ['CERRADO'],
  'CERRADO': ['DETECTADO']
};

function ensureSeguimientoSheet_(ss) {
  var sheet = ss.getSheetByName(CONFIG.SEGUIMIENTO_SHEET);
  if (sheet) return sheet;
  sheet = ss.insertSheet(CONFIG.SEGUIMIENTO_SHEET);
  sheet.getRange(1, 1, 1, SEGUIMIENTO_HEADERS.length).setValues([SEGUIMIENTO_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SEGUIMIENTO_HEADERS.length)
    .setBackground('#1a2332').setFontColor('#ffffff').setFontWeight('bold');
  return sheet;
}

function autoDetectNewEvents_(allData, COL, flagColNames, flagStartIdx, ss) {
  var segSheet = ensureSeguimientoSheet_(ss);
  var lastRow = segSheet.getLastRow();
  var existingKeys = {};

  if (lastRow > 1) {
    var existing = segSheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    for (var i = 0; i < existing.length; i++) {
      var key = String(existing[i][5]) + '|' + String(existing[i][6]) + '|' + String(existing[i][17]);
      existingKeys[key] = true;
    }
  }

  var alertasPorContrato = {};
  for (var r = 0; r < allData.length; r++) {
    var contrato = String(allData[r][COL['contrato']] || '');
    if (!contrato) continue;
    var count = 0;
    for (var f = 0; f < flagColNames.length; f++) {
      var fv = String(allData[r][flagStartIdx + f] || '').trim().toUpperCase();
      if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') count++;
    }
    if (count > 0) alertasPorContrato[contrato] = count;
  }

  var newEvents = [];
  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
  var seqNum = lastRow;

  for (var r = 0; r < allData.length; r++) {
    if (newEvents.length >= 100) break;

    var row = allData[r];
    var contrato = String(row[COL['contrato']] || '');
    var folio = String(row[COL['folio']] || '');
    var sucursal = String(row[COL['sucursal2']] || '');
    var monto = Number(row[COL['total_disposicion']] || 0);
    var dgCol = COL['Evento'] !== undefined ? COL['Evento'] : (COL['DG'] !== undefined ? COL['DG'] : -1);
    var eventoDG = dgCol >= 0 ? String(row[dgCol] || '') : '';
    if (!eventoDG) {
      var dgIdx = flagStartIdx + flagColNames.length;
      if (dgIdx < row.length) eventoDG = String(row[dgIdx] || '');
    }

    for (var f = 0; f < flagColNames.length; f++) {
      if (newEvents.length >= 100) break;
      var flagVal = String(row[flagStartIdx + f] || '').trim().toUpperCase();
      if (flagVal !== 'SI' && flagVal !== 'YES' && flagVal !== 'TRUE' && flagVal !== '1') continue;

      var flagName = flagColNames[f];
      var colLetra = getColumnLetter_(flagStartIdx + f);
      var key = contrato + '|' + folio + '|' + colLetra;
      if (existingKeys[key]) continue;

      var tipo = CONTROL_COLUMNS.indexOf(colLetra) !== -1 ? 'CONTROL' : 'WARNING';
      var sumaAlertas = alertasPorContrato[contrato] || 1;

      var prioridad = 'BAJA';
      if (sumaAlertas >= 5 || colLetra === 'CX' || colLetra === 'CY') prioridad = 'CRITICA';
      else if (sumaAlertas >= 3) prioridad = 'ALTA';
      else if (sumaAlertas >= 2) prioridad = 'MEDIA';

      seqNum++;
      var id = 'EVT-' + dateStr + '-' + ('0000' + seqNum).slice(-4);

      newEvents.push([
        id, now, tipo, flagName, sucursal, contrato, folio,
        monto, 'DETECTADO', 'PENDIENTE', '', '', sumaAlertas,
        prioridad, '', now, 'SISTEMA', colLetra, eventoDG
      ]);
      existingKeys[key] = true;
    }
  }

  if (newEvents.length > 0) {
    segSheet.getRange(lastRow + 1, 1, newEvents.length, SEGUIMIENTO_HEADERS.length)
      .setValues(newEvents);
  }

  return newEvents.length;
}

function getColumnLetter_(colIndex) {
  var letter = '';
  var temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function computeSeguimientoData_(allData, COL, flagColNames, flagStartIdx, ss) {
  var segSheet = ensureSeguimientoSheet_(ss);
  var lastRow = segSheet.getLastRow();
  var now = new Date();

  var totalDisp = allData.length;
  var flagCountByName = {};
  var controlCount = 0, warningCount = 0;

  for (var f = 0; f < flagColNames.length; f++) {
    flagCountByName[flagColNames[f]] = { count: 0, colLetra: getColumnLetter_(flagStartIdx + f) };
  }

  // Contar flags activas en datos (misma logica que precomputeAll: SI/YES/TRUE/1)
  var dispConFlag = {};
  for (var r = 0; r < allData.length; r++) {
    var hasFlag = false;
    for (var f = 0; f < flagColNames.length; f++) {
      var fv = String(allData[r][flagStartIdx + f] || '').trim().toUpperCase();
      if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') {
        flagCountByName[flagColNames[f]].count++;
        hasFlag = true;
      }
    }
    if (hasFlag) {
      var ctr = String(allData[r][COL['contrato']] || '');
      dispConFlag[ctr] = true;
    }
  }

  var controles = [];
  var warnings = [];
  for (var fname in flagCountByName) {
    var info = flagCountByName[fname];
    var tipo = CONTROL_COLUMNS.indexOf(info.colLetra) !== -1 ? 'CONTROL' : 'WARNING';
    var obj = {
      nombre: fname,
      columna: info.colLetra,
      tipo: tipo,
      eventos: info.count,
      pctUniverso: totalDisp > 0 ? Math.round(info.count / totalDisp * 10000) / 100 : 0
    };
    if (tipo === 'CONTROL') { controles.push(obj); controlCount += info.count; }
    else { warnings.push(obj); warningCount += info.count; }
  }

  var etapas = { DETECTADO:0, EN_ANALISIS:0, CONFIRMADO:0, ASIGNADO:0, EN_INVESTIGACION:0, DICTAMINADO:0, CERRADO:0 };
  var eventosActivos = 0, eventosCerrados = 0;
  var eventosPorFlag = {};
  var eventosPorSuc = {};
  var eventosVencidos = [];

  if (lastRow > 1) {
    var eventos = segSheet.getRange(2, 1, lastRow - 1, SEGUIMIENTO_HEADERS.length).getValues();
    for (var i = 0; i < eventos.length; i++) {
      var etapa = String(eventos[i][8] || 'DETECTADO');
      if (etapas[etapa] !== undefined) etapas[etapa]++;

      if (etapa === 'CERRADO') eventosCerrados++;
      else eventosActivos++;

      var cat = String(eventos[i][3] || '');
      if (!eventosPorFlag[cat]) eventosPorFlag[cat] = 0;
      eventosPorFlag[cat]++;

      var suc = String(eventos[i][4] || '');
      if (!eventosPorSuc[suc]) eventosPorSuc[suc] = 0;
      eventosPorSuc[suc]++;

      if (etapa !== 'CERRADO') {
        var fechaAct = eventos[i][15];
        if (fechaAct) {
          var diff = (now - new Date(fechaAct)) / (1000 * 60 * 60);
          if (diff > 48) {
            eventosVencidos.push({
              id: String(eventos[i][0]),
              etapa: etapa,
              categoria: cat,
              sucursal: suc,
              horas: Math.round(diff)
            });
          }
        }
      }
    }
  }

  for (var c = 0; c < controles.length; c++) {
    controles[c].enSeguimiento = eventosPorFlag[controles[c].nombre] || 0;
  }
  for (var w = 0; w < warnings.length; w++) {
    warnings[w].enSeguimiento = eventosPorFlag[warnings[w].nombre] || 0;
  }

  var diagramaNodos = {};
  for (var et in etapas) {
    diagramaNodos[et] = { count: etapas[et] };
  }
  diagramaNodos.totalControles = controlCount;
  diagramaNodos.totalWarnings = warningCount;

  var limpias = totalDisp - Object.keys(dispConFlag).length;

  return {
    kpis: {
      universo: totalDisp,
      controlesActivados: controlCount,
      warningsActivados: warningCount,
      limpias: limpias,
      pctControles: totalDisp > 0 ? Math.round(controlCount / totalDisp * 10000) / 100 : 0,
      pctWarnings: totalDisp > 0 ? Math.round(warningCount / totalDisp * 10000) / 100 : 0,
      pctLimpias: totalDisp > 0 ? Math.round(limpias / totalDisp * 10000) / 100 : 0,
      eventosActivos: eventosActivos,
      eventosCerrados: eventosCerrados
    },
    controles: controles,
    warnings: warnings,
    etapas: etapas,
    diagrama: diagramaNodos,
    eventosVencidos: eventosVencidos.slice(0, 20),
    topSucursales: Object.keys(eventosPorSuc)
      .map(function(s) { return { sucursal: s, count: eventosPorSuc[s] }; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 10)
  };
}

// ================================================================
// WEB APP
// ================================================================

function doGet() {
  var auth = checkUserAccess_();
  if (!auth.authorized) {
    return HtmlService.createHtmlOutput(
      '<html><head><meta charset="utf-8">' +
      '<style>body{font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0f1a;color:#e0e0e0;}' +
      '.box{text-align:center;padding:48px;background:#1a2332;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:480px;border:1px solid #2a3a4a;}' +
      '.icon{font-size:64px;margin-bottom:16px;}h2{color:#ef5350;margin-bottom:12px;font-size:22px;}' +
      'p{color:#90a4ae;line-height:1.8;font-size:14px;}.email{color:#7c4dff;font-weight:bold;}</style>' +
      '</head><body><div class="box"><div class="icon">&#128274;</div>' +
      '<h2>Acceso Restringido</h2>' +
      '<p>El usuario <span class="email">' + auth.email + '</span><br>no tiene autorizaci&oacute;n para acceder al Monitor de Disposiciones.<br><br>' +
      'Si necesitas acceso, contacta al administrador del sistema.</p>' +
      '</div></body></html>'
    ).setTitle('Acceso Denegado')
     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var cachedData = getPrecomputedData();
  if (cachedData === null) {
    ensureTriggerExists_();
    return HtmlService.createHtmlOutput(
      '<html><head><meta charset="utf-8">' +
      '<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}' +
      '.box{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:500px;}' +
      'h2{color:#1a73e8;margin-bottom:16px;}p{color:#555;line-height:1.6;}.spinner{border:4px solid #e0e0e0;border-top:4px solid #1a73e8;' +
      'border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:20px auto;}' +
      '@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>' +
      '</head><body><div class="box"><div class="spinner"></div>' +
      '<h2>Inicializando Dashboard</h2>' +
      '<p>Es la primera vez que se abre el dashboard o el cache expir&oacute;.<br>' +
      'Los datos se est&aacute;n pre-calculando en segundo plano (50,000+ filas).<br><br>' +
      '<strong>Esta p&aacute;gina se recargar&aacute; autom&aacute;ticamente en 90 segundos.</strong><br>' +
      'Tambi&eacute;n puedes recargar manualmente despu&eacute;s de 1-2 minutos.</p>' +
      '</div><script>setTimeout(function(){location.reload();},90000);</script></body></html>'
    ).setTitle('Monitor - Inicializando...')
     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var template = HtmlService.createTemplateFromFile('Dashboard');
  template.dashboardData = cachedData;
  template.userEmail = auth.email;
  template.userRole = auth.role;
  return template.evaluate()
    .setTitle('Monitor de Disposiciones')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getPrecomputedData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cacheSheet = ss.getSheetByName(CONFIG.CACHE_SHEET);
  if (cacheSheet && cacheSheet.getLastColumn() > 0) {
    var lastCol = cacheSheet.getLastColumn();
    var chunks = cacheSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var data = chunks.join('');
    if (data.length > 10) return data;
  }
  return null;
}

// ================================================================
// PRE-COMPUTACION (llamado por trigger cada 10 min)
// ================================================================

function precomputeAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.DATA_SHEET);
  var lastRow = sh.getLastRow();

  var emptyResult = JSON.stringify({
    kpis:{totalReg:0,totalMonto:0,totalInc:0,tasaInc:0,montoPromedio:0,sucursalesCount:0,montoInc:0},
    charts:{}, risks:[], filterOptions:{}, headers:[], flagNames:[],
    tablePage:{rows:[],total:0,page:0}, lastUpdate:new Date().toLocaleString('es-MX'),
    seguimiento:null
  });

  if (lastRow < 2) { saveToCacheSheet_(ss, emptyResult); return emptyResult; }

  var headers = sh.getRange('A1:' + CONFIG.DATA_RANGE_END + '1').getValues()[0];
  var allData = sh.getRange('A2:' + CONFIG.DATA_RANGE_END + lastRow).getValues();
  var flagColNames = sh.getRange(CONFIG.FLAG_RANGE).getValues()[0];
  var tz = Session.getScriptTimeZone();

  var COL = {};
  for (var i = 0; i < headers.length; i++) COL[headers[i]] = i;
  var flagStartIdx = -1;
  if (flagColNames.length > 0 && COL[flagColNames[0]] !== undefined) {
    flagStartIdx = COL[flagColNames[0]];
  }

  // === SINGLE PASS ===
  var totalMonto=0, totalInc=0, montoInc=0, sucSet={};
  var sucCount={}, sucMonto={}, sucTotal={};
  var montoRanges={"Negativo":0,"0-500":0,"501-1000":0,"1001-5000":0,"5001-10000":0,"10001-25000":0,">25000":0};
  var edadRanges={"N/D":0,"18-25":0,"26-35":0,"36-45":0,"46-55":0,"56-65":0,">65":0};
  var incTypes={};
  var flagCounts={}; for(var fi=0;fi<flagColNames.length;fi++) flagCounts[flagColNames[fi]]=0;
  var rc={fueraHorario:0,mismodia:0,foraneas:0,telRepetido:0,telColab:0,contratosRapidos:0,pagoSpei:0,montoDup:0,disp24k:0,calif5:0,dias120:0,reversados:0,highMonto:0};
  var rd={fueraHorario:[],mismodia:[],foraneas:[],telRepetido:[],telColab:[],contratosRapidos:[],pagoSpei:[],montoDup:[],disp24k:[],calif5:[],dias120:[],reversados:[],highMonto:[]};
  var filterSets={}; for(var fk in {sucursal2:1,contrato:1,folio:1,tipo_dispo:1,estatus_destino:1,A1:1,CALIFICACION:1,empresa:1}) filterSets[fk]={};
  var slimRows=[];
  var MDR = CONFIG.MAX_DETAIL_ROWS;

  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var suc=String(r[COL['sucursal2']]||'').trim();
    var monto=parseFloat(String(r[COL['total_disposicion']]).replace(/[^0-9.\-]/g,''))||0;
    var cnt=parseInt(r[COL['COUNT']])||0;
    var edad=parseInt(r[COL['Edad']])||0;
    var inc=String(r[COL['A1']]||'').trim();
    var contrato=String(r[COL['contrato']]||'').trim();
    var folio=String(r[COL['folio']]||'').trim();
    var tipo=String(r[COL['tipo_dispo']]||'').trim();
    var emp=String(r[COL['empresa']]||'').trim();

    totalMonto+=monto; if(cnt>0){totalInc++;montoInc+=monto;}
    if(suc)sucSet[suc]=1;
    if(suc){sucCount[suc]=(sucCount[suc]||0)+1;sucMonto[suc]=(sucMonto[suc]||0)+monto;if(!sucTotal[suc])sucTotal[suc]={t:0,i:0,m:0};sucTotal[suc].t++;sucTotal[suc].m+=monto;if(cnt>0)sucTotal[suc].i++;}

    if(monto<0)montoRanges["Negativo"]++;else if(monto<=500)montoRanges["0-500"]++;else if(monto<=1000)montoRanges["501-1000"]++;else if(monto<=5000)montoRanges["1001-5000"]++;else if(monto<=10000)montoRanges["5001-10000"]++;else if(monto<=25000)montoRanges["10001-25000"]++;else montoRanges[">25000"]++;
    if(edad<18)edadRanges["N/D"]++;else if(edad<=25)edadRanges["18-25"]++;else if(edad<=35)edadRanges["26-35"]++;else if(edad<=45)edadRanges["36-45"]++;else if(edad<=55)edadRanges["46-55"]++;else if(edad<=65)edadRanges["56-65"]++;else edadRanges[">65"]++;

    if(inc){var ps=inc.split('|');for(var pi=0;pi<ps.length;pi++){var p=ps[pi].trim();if(p)incTypes[p]=(incTypes[p]||0)+1;}}

    var det={suc:suc,contrato:contrato,folio:folio,monto:monto,tipo:tipo,empresa:emp};
    if(monto>25000){rc.highMonto++;if(rd.highMonto.length<MDR)rd.highMonto.push(det);}

    for(var fi=0;fi<flagColNames.length;fi++){
      var fIdx=flagStartIdx+fi;
      if(fIdx<r.length){var fv=String(r[fIdx]).toUpperCase().trim();
        if(fv==='SI'||fv==='YES'||fv==='TRUE'||fv==='1'){
          var fn=flagColNames[fi];flagCounts[fn]++;var fnL=fn.toLowerCase();
          if(fnL.indexOf('fuera')>=0&&fnL.indexOf('horario')>=0){rc.fueraHorario++;if(rd.fueraHorario.length<MDR)rd.fueraHorario.push(det);}
          if(fnL.indexOf('+1')>=0&&fnL.indexOf('mismo')>=0){rc.mismodia++;if(rd.mismodia.length<MDR)rd.mismodia.push(det);}
          if(fnL.indexOf('foran')>=0){rc.foraneas++;if(rd.foraneas.length<MDR)rd.foraneas.push(det);}
          if(fnL.indexOf('tel')>=0&&fnL.indexOf('repetido')>=0){rc.telRepetido++;if(rd.telRepetido.length<MDR)rd.telRepetido.push(det);}
          if(fnL.indexOf('tel')>=0&&fnL.indexOf('colaborador')>=0){rc.telColab++;if(rd.telColab.length<MDR)rd.telColab.push(det);}
          if(fnL.indexOf('contrato')>=0&&fnL.indexOf('3 min')>=0){rc.contratosRapidos++;if(rd.contratosRapidos.length<MDR)rd.contratosRapidos.push(det);}
          if(fnL.indexOf('pago')>=0&&fnL.indexOf('spei')>=0){rc.pagoSpei++;if(rd.pagoSpei.length<MDR)rd.pagoSpei.push(det);}
          if(fnL.indexOf('monto')>=0&&fnL.indexOf('duplicado')>=0){rc.montoDup++;if(rd.montoDup.length<MDR)rd.montoDup.push(det);}
          if(fnL.indexOf('disposicion')>=0&&fnL.indexOf('24')>=0){rc.disp24k++;if(rd.disp24k.length<MDR)rd.disp24k.push(det);}
          if(fnL.indexOf('calificacion')>=0||fnL.indexOf('calif')>=0){rc.calif5++;if(rd.calif5.length<MDR)rd.calif5.push(det);}
          if(fnL.indexOf('120')>=0){rc.dias120++;if(rd.dias120.length<MDR)rd.dias120.push(det);}
          if(fnL.indexOf('reversado')>=0){rc.reversados++;if(rd.reversados.length<MDR)rd.reversados.push(det);}
        }
      }
    }

    for(var fk in filterSets){var fv2=String(r[COL[fk]]||'').trim();if(fv2&&fv2!=='undefined'&&fv2!=='0')filterSets[fk][fv2]=1;}

    var slimRow=[];
    for(var sci=0;sci<SLIM_COL_NAMES.length;sci++){var val=r[COL[SLIM_COL_NAMES[sci]]];if(val instanceof Date)val=Utilities.formatDate(val,tz,'dd/MM/yyyy HH:mm:ss');slimRow.push(val);}
    for(var fi=0;fi<flagColNames.length;fi++){var fIdx=flagStartIdx+fi;slimRow.push(fIdx<r.length?r[fIdx]:'');}
    slimRow.push(i+2);
    slimRows.push(slimRow);
  }

  // Charts
  var charts={};
  charts.topSucByCount=sortObj_(sucCount,20);
  charts.topSucByMonto=sortObj_(sucMonto,20);
  charts.montoRanges=montoRanges;
  charts.edadRanges=edadRanges;
  var incArr=[];for(var k in incTypes)incArr.push([k,incTypes[k]]);incArr.sort(function(a,b){return b[1]-a[1];});
  charts.incidenceTypes=incArr;
  charts.tasaRiesgo=allData.length>0?(totalInc/allData.length*100):0;
  var tasaArr=[];for(var s in sucTotal){if(sucTotal[s].t>=3)tasaArr.push({suc:s,tasa:sucTotal[s].i/sucTotal[s].t*100,total:sucTotal[s].t,inc:sucTotal[s].i});}
  tasaArr.sort(function(a,b){return b.tasa-a.tasa;});charts.topSucByTasa=tasaArr.slice(0,15);
  var promArr=[];for(var s in sucCount)promArr.push([s,sucMonto[s]/sucCount[s]]);promArr.sort(function(a,b){return b[1]-a[1];});charts.topSucByPromedio=promArr.slice(0,15);
  var flagArr=[];for(var fn in flagCounts)if(flagCounts[fn]>0)flagArr.push([fn.replace(/\\/g,'').trim(),flagCounts[fn]]);flagArr.sort(function(a,b){return b[1]-a[1];});charts.flagCounts=flagArr;
  var riskSucArr=[];for(var s in sucTotal){if(sucTotal[s].t>=3)riskSucArr.push({suc:s,tasa:sucTotal[s].i/sucTotal[s].t*100,reg:sucTotal[s].t,inc:sucTotal[s].i,monto:sucTotal[s].m});}
  riskSucArr.sort(function(a,b){return b.inc-a.inc;});charts.topSucByRiesgo=riskSucArr.slice(0,15);

  // Risks
  var risks=[];
  var riskDefs=[
    {key:'fueraHorario',level:'high',title:'Operaciones Fuera de Horario',desc:' disposiciones fuera del horario habitual. Posible uso no autorizado.'},
    {key:'mismodia',level:'high',title:'Multiples Disposiciones Mismo Dia (+1)',desc:' casos con mas de una disposicion el mismo dia. Posible fraccionamiento.'},
    {key:'telRepetido',level:'high',title:'Telefono Repetido en Distintos Contratos',desc:' registros comparten telefono entre contratos diferentes.'},
    {key:'telColab',level:'high',title:'Telefono de Colaborador Detectado',desc:' casos con telefono de colaborador. Alto riesgo de fraude interno.'},
    {key:'contratosRapidos',level:'high',title:'Contratos en Menos de 3 Minutos',desc:' contratos procesados en menos de 3 minutos.'},
    {key:'foraneas',level:'medium',title:'Disposiciones Foraneas en Efectivo',desc:' disposiciones foraneas en efectivo detectadas.'},
    {key:'pagoSpei',level:'medium',title:'Pagos SPEI a Colaboradores',desc:' transferencias SPEI a cuentas de colaboradores.'},
    {key:'montoDup',level:'medium',title:'Montos Duplicados Mismo Dia',desc:' operaciones con montos identicos el mismo dia.'},
    {key:'disp24k',level:'medium',title:'Disposiciones Mayores a $24k',desc:' disposiciones superan $24,000.'},
    {key:'reversados',level:'medium',title:'Operaciones Reversadas',desc:' operaciones fueron reversadas.'},
    {key:'dias120',level:'medium',title:'Clientes con > 120 Dias de Atraso',desc:' disposiciones a clientes con mas de 120 dias de atraso.'},
    {key:'calif5',level:'low',title:'Calificacion Baja (<=5)',desc:' operaciones a clientes con calificacion baja.'},
    {key:'highMonto',level:'low',title:'Operaciones de Alto Monto (>$25k)',desc:' operaciones superan los $25,000.'}
  ];
  for(var ri=0;ri<riskDefs.length;ri++){var rdef=riskDefs[ri];var c=rc[rdef.key];if(c>0)risks.push({level:rdef.level,title:rdef.title+': '+c,desc:c+rdef.desc,count:c,details:rd[rdef.key],id:rdef.key});}
  var topRiskSuc=[];for(var s in sucTotal){var t=sucTotal[s].i/sucTotal[s].t*100;if(sucTotal[s].t>=3&&t>20)topRiskSuc.push({suc:s,tasa:t,inc:sucTotal[s].i,tot:sucTotal[s].t});}
  topRiskSuc.sort(function(a,b){return b.tasa-a.tasa;});
  if(topRiskSuc.length>0){var sl=topRiskSuc.slice(0,5).map(function(s){return 'Suc '+s.suc+' ('+s.tasa.toFixed(1)+'%, '+s.inc+'/'+s.tot+')';}).join(', ');risks.push({level:'high',title:'Sucursales con Alta Concentracion de Riesgo',desc:'Tasa >20%: '+sl,count:topRiskSuc.length,details:[],id:'sucRiesgo'});}

  // Filter options
  var filterOptions={};
  for(var fk in filterSets){var vals=Object.keys(filterSets[fk]).sort();if(vals.length>CONFIG.MAX_FILTER_OPTIONS)vals=vals.slice(0,CONFIG.MAX_FILTER_OPTIONS);filterOptions[fk]=vals;}

  // First table page
  var firstPageRows=[];var pageLimit=Math.min(CONFIG.TABLE_PAGE_SIZE,allData.length);
  for(var i=0;i<pageLimit;i++){var row=[];for(var j=0;j<headers.length;j++){var val=allData[i][j];if(val instanceof Date)val=Utilities.formatDate(val,tz,'dd/MM/yyyy HH:mm:ss');row.push(val);}firstPageRows.push(row);}

  // === EXECUTIVE DATA (new tabs) ===
  var executive = computeExecutiveData_(allData, COL, rc, sucTotal, sucCount, flagColNames, flagStartIdx);

  // === PREDICTIVE DATA (v4.0) ===
  var predictive = {};
  try {
    predictive = computePredictiveData_(sucTotal, sucCount, sucMonto, rc, allData, COL, flagColNames, flagStartIdx);
    var geminiInsights = generatePredictiveInsights_(predictive);
    predictive.geminiInsights = geminiInsights.insights;
  } catch(e) {
    predictive = { error: e.message, scores: [], conteoNiveles: { verde: 0, amarillo: 0, naranja: 0, rojo: 0 }, diasHistorico: 0 };
  }

  // === HISTORIC SNAPSHOT ===
  var histRow = [
    new Date(), allData.length, totalMonto, totalInc,
    allData.length > 0 ? (totalInc / allData.length * 100) : 0,
    montoInc, Object.keys(sucSet).length,
    executive.financial.capitalInsoluto, executive.financial.saldoVencido,
    rc.fueraHorario, rc.mismodia, rc.foraneas, rc.telRepetido, rc.telColab,
    rc.contratosRapidos, rc.pagoSpei, rc.montoDup, rc.disp24k, rc.calif5,
    rc.dias120, rc.reversados, rc.highMonto
  ];
  saveHistoricSnapshot_(histRow);

  // === HISTORIC COMPARISON (vs yesterday) ===
  var vsAyer = { regDiff: 0, montoDiff: 0, incDiff: 0, tasaDiff: 0 };
  try {
    var histSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HIST_SHEET);
    if (histSheet && histSheet.getLastRow() >= 3) {
      var histData = histSheet.getRange(2, 1, histSheet.getLastRow() - 1, 5).getValues();
      histData.sort(function(a, b) { return new Date(b[0]) - new Date(a[0]); });
      if (histData.length >= 2) {
        var ayer = histData[1];
        vsAyer.regDiff = allData.length - (ayer[1] || 0);
        vsAyer.montoDiff = totalMonto - (ayer[2] || 0);
        vsAyer.incDiff = totalInc - (ayer[3] || 0);
        vsAyer.tasaDiff = (allData.length > 0 ? totalInc / allData.length * 100 : 0) - (ayer[4] || 0);
      }
    }
  } catch(e) { /* no historic yet, ignore */ }
  executive.vsAyer = vsAyer;

  // === SEGUIMIENTO DE EVENTOS ===
  var newEventsCount = autoDetectNewEvents_(allData, COL, flagColNames, flagStartIdx, ss);
  var seguimiento = computeSeguimientoData_(allData, COL, flagColNames, flagStartIdx, ss);

  var result={
    kpis:{totalReg:allData.length,totalMonto:totalMonto,totalInc:totalInc,tasaInc:allData.length>0?(totalInc/allData.length*100):0,montoPromedio:allData.length>0?(totalMonto/allData.length):0,montoInc:montoInc,sucursalesCount:Object.keys(sucSet).length},
    charts:charts,risks:risks,filterOptions:filterOptions,headers:headers,flagNames:flagColNames,
    tablePage:{rows:firstPageRows,total:allData.length,page:0},
    lastUpdate:new Date().toLocaleString('es-MX'),
    executive:executive,
    predictive:predictive,
    seguimiento:seguimiento
  };
  var json=JSON.stringify(result).replace(/<\//g,'<\\/');
  saveToCacheSheet_(ss,json);
  saveSlimData_(ss,slimRows,SLIM_COL_NAMES.concat(flagColNames));
  return json;
}

// ================================================================
// DASHBOARD FILTRADO
// ================================================================

function getFilteredDashboard(filtersJson) {
  try {
    var filters=JSON.parse(filtersJson);
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var slimSheet=ss.getSheetByName(CONFIG.SLIM_SHEET);
    if(!slimSheet||slimSheet.getLastRow()<1)return JSON.stringify({error:'Sin datos en cache. Espera a que el trigger pre-compute los datos (cada 10 min).'});

    var slimData=slimSheet.getDataRange().getValues();
    var slimHeaders=slimData[0];var slimRows=slimData.slice(1);
    var SC={};for(var i=0;i<slimHeaders.length;i++)SC[slimHeaders[i]]=i;

    var filtered=slimRows.filter(function(r){
      if(filters.sucursal2&&String(r[SC['sucursal2']])!==filters.sucursal2)return false;
      if(filters.contrato&&String(r[SC['contrato']])!==filters.contrato)return false;
      if(filters.folio&&String(r[SC['folio']])!==filters.folio)return false;
      if(filters.tipo_dispo&&String(r[SC['tipo_dispo']])!==filters.tipo_dispo)return false;
      if(filters.estatus_destino&&String(r[SC['estatus_destino']])!==filters.estatus_destino)return false;
      if(filters.A1&&String(r[SC['A1']]).indexOf(filters.A1)===-1)return false;
      if(filters.CALIFICACION&&String(r[SC['CALIFICACION']])!==filters.CALIFICACION)return false;
      if(filters.empresa&&String(r[SC['empresa']])!==filters.empresa)return false;
      return true;
    });

    var flagColNames=[];var flagStartSC=-1;
    for(var i=0;i<slimHeaders.length;i++){if(SLIM_COL_NAMES.indexOf(slimHeaders[i])===-1&&slimHeaders[i]!=='rowNum'){if(flagStartSC===-1)flagStartSC=i;flagColNames.push(slimHeaders[i]);}}

    return JSON.stringify(aggregateSlimData_(filtered,SC,flagColNames,flagStartSC)).replace(/<\//g,'<\\/');
  } catch(err) {
    return JSON.stringify({error:'Error en filtros: '+(err.message||String(err))});
  }
}

function aggregateSlimData_(rows,SC,flagColNames,flagStartSC){
  var totalReg=rows.length,totalMonto=0,totalInc=0,montoInc=0,sucSet={},sucCount={},sucMonto={},sucTotal={};
  var montoRanges={"Negativo":0,"0-500":0,"501-1000":0,"1001-5000":0,"5001-10000":0,"10001-25000":0,">25000":0};
  var edadRanges={"N/D":0,"18-25":0,"26-35":0,"36-45":0,"46-55":0,"56-65":0,">65":0};
  var incTypes={},flagCnts={};for(var fi=0;fi<flagColNames.length;fi++)flagCnts[flagColNames[fi]]=0;
  var rc={fueraHorario:0,mismodia:0,foraneas:0,telRepetido:0,telColab:0,contratosRapidos:0,pagoSpei:0,montoDup:0,disp24k:0,calif5:0,dias120:0,reversados:0,highMonto:0};
  var rdet={fueraHorario:[],mismodia:[],foraneas:[],telRepetido:[],telColab:[],contratosRapidos:[],pagoSpei:[],montoDup:[],disp24k:[],calif5:[],dias120:[],reversados:[],highMonto:[]};
  var MDR=CONFIG.MAX_DETAIL_ROWS;

  for(var i=0;i<rows.length;i++){
    var r=rows[i];var suc=String(r[SC['sucursal2']]||'').trim();
    var monto=parseFloat(String(r[SC['total_disposicion']]).replace(/[^0-9.\-]/g,''))||0;
    var cnt=parseInt(r[SC['COUNT']])||0;var edad=parseInt(r[SC['Edad']])||0;
    var inc=String(r[SC['A1']]||'').trim();
    var contrato=String(r[SC['contrato']]||'').trim();var folio=String(r[SC['folio']]||'').trim();
    var tipo=String(r[SC['tipo_dispo']]||'').trim();var emp=String(r[SC['empresa']]||'').trim();

    totalMonto+=monto;if(cnt>0){totalInc++;montoInc+=monto;}
    if(suc){sucSet[suc]=1;sucCount[suc]=(sucCount[suc]||0)+1;sucMonto[suc]=(sucMonto[suc]||0)+monto;if(!sucTotal[suc])sucTotal[suc]={t:0,i:0,m:0};sucTotal[suc].t++;sucTotal[suc].m+=monto;if(cnt>0)sucTotal[suc].i++;}

    if(monto<0)montoRanges["Negativo"]++;else if(monto<=500)montoRanges["0-500"]++;else if(monto<=1000)montoRanges["501-1000"]++;else if(monto<=5000)montoRanges["1001-5000"]++;else if(monto<=10000)montoRanges["5001-10000"]++;else if(monto<=25000)montoRanges["10001-25000"]++;else montoRanges[">25000"]++;
    if(edad<18)edadRanges["N/D"]++;else if(edad<=25)edadRanges["18-25"]++;else if(edad<=35)edadRanges["26-35"]++;else if(edad<=45)edadRanges["36-45"]++;else if(edad<=55)edadRanges["46-55"]++;else if(edad<=65)edadRanges["56-65"]++;else edadRanges[">65"]++;
    if(inc){var ps=inc.split('|');for(var pi=0;pi<ps.length;pi++){var p=ps[pi].trim();if(p)incTypes[p]=(incTypes[p]||0)+1;}}

    var det={suc:suc,contrato:contrato,folio:folio,monto:monto,tipo:tipo,empresa:emp};
    if(monto>25000){rc.highMonto++;if(rdet.highMonto.length<MDR)rdet.highMonto.push(det);}
    for(var fi=0;fi<flagColNames.length;fi++){
      var fv=String(r[flagStartSC+fi]).toUpperCase().trim();
      if(fv==='SI'||fv==='YES'||fv==='TRUE'||fv==='1'){
        var fn=flagColNames[fi];flagCnts[fn]++;var fnL=fn.toLowerCase();
        if(fnL.indexOf('fuera')>=0&&fnL.indexOf('horario')>=0){rc.fueraHorario++;if(rdet.fueraHorario.length<MDR)rdet.fueraHorario.push(det);}
        if(fnL.indexOf('+1')>=0&&fnL.indexOf('mismo')>=0){rc.mismodia++;if(rdet.mismodia.length<MDR)rdet.mismodia.push(det);}
        if(fnL.indexOf('foran')>=0){rc.foraneas++;if(rdet.foraneas.length<MDR)rdet.foraneas.push(det);}
        if(fnL.indexOf('tel')>=0&&fnL.indexOf('repetido')>=0){rc.telRepetido++;if(rdet.telRepetido.length<MDR)rdet.telRepetido.push(det);}
        if(fnL.indexOf('tel')>=0&&fnL.indexOf('colaborador')>=0){rc.telColab++;if(rdet.telColab.length<MDR)rdet.telColab.push(det);}
        if(fnL.indexOf('contrato')>=0&&fnL.indexOf('3 min')>=0){rc.contratosRapidos++;if(rdet.contratosRapidos.length<MDR)rdet.contratosRapidos.push(det);}
        if(fnL.indexOf('pago')>=0&&fnL.indexOf('spei')>=0){rc.pagoSpei++;if(rdet.pagoSpei.length<MDR)rdet.pagoSpei.push(det);}
        if(fnL.indexOf('monto')>=0&&fnL.indexOf('duplicado')>=0){rc.montoDup++;if(rdet.montoDup.length<MDR)rdet.montoDup.push(det);}
        if(fnL.indexOf('disposicion')>=0&&fnL.indexOf('24')>=0){rc.disp24k++;if(rdet.disp24k.length<MDR)rdet.disp24k.push(det);}
        if(fnL.indexOf('calificacion')>=0||fnL.indexOf('calif')>=0){rc.calif5++;if(rdet.calif5.length<MDR)rdet.calif5.push(det);}
        if(fnL.indexOf('120')>=0){rc.dias120++;if(rdet.dias120.length<MDR)rdet.dias120.push(det);}
        if(fnL.indexOf('reversado')>=0){rc.reversados++;if(rdet.reversados.length<MDR)rdet.reversados.push(det);}
      }
    }
  }

  var charts={};
  charts.topSucByCount=sortObj_(sucCount,20);charts.topSucByMonto=sortObj_(sucMonto,20);
  charts.montoRanges=montoRanges;charts.edadRanges=edadRanges;
  var incArr=[];for(var k in incTypes)incArr.push([k,incTypes[k]]);incArr.sort(function(a,b){return b[1]-a[1];});charts.incidenceTypes=incArr;
  charts.tasaRiesgo=totalReg>0?(totalInc/totalReg*100):0;
  var tasaArr=[];for(var s in sucTotal){if(sucTotal[s].t>=3)tasaArr.push({suc:s,tasa:sucTotal[s].i/sucTotal[s].t*100,total:sucTotal[s].t,inc:sucTotal[s].i});}tasaArr.sort(function(a,b){return b.tasa-a.tasa;});charts.topSucByTasa=tasaArr.slice(0,15);
  var promArr=[];for(var s in sucCount)promArr.push([s,sucMonto[s]/sucCount[s]]);promArr.sort(function(a,b){return b[1]-a[1];});charts.topSucByPromedio=promArr.slice(0,15);
  var flagArr=[];for(var fn in flagCnts)if(flagCnts[fn]>0)flagArr.push([fn.replace(/\\/g,'').trim(),flagCnts[fn]]);flagArr.sort(function(a,b){return b[1]-a[1];});charts.flagCounts=flagArr;
  var riskSucArr=[];for(var s in sucTotal){if(sucTotal[s].t>=3)riskSucArr.push({suc:s,tasa:sucTotal[s].i/sucTotal[s].t*100,reg:sucTotal[s].t,inc:sucTotal[s].i,monto:sucTotal[s].m});}riskSucArr.sort(function(a,b){return b.inc-a.inc;});charts.topSucByRiesgo=riskSucArr.slice(0,15);

  var risks=[],riskDefs=[
    {key:'fueraHorario',level:'high',title:'Operaciones Fuera de Horario',desc:' disposiciones fuera del horario habitual.'},
    {key:'mismodia',level:'high',title:'Multiples Disposiciones Mismo Dia (+1)',desc:' casos mismo dia.'},
    {key:'telRepetido',level:'high',title:'Telefono Repetido en Distintos Contratos',desc:' registros comparten telefono.'},
    {key:'telColab',level:'high',title:'Telefono de Colaborador Detectado',desc:' casos telefono de colaborador.'},
    {key:'contratosRapidos',level:'high',title:'Contratos en Menos de 3 Minutos',desc:' contratos rapidos.'},
    {key:'foraneas',level:'medium',title:'Disposiciones Foraneas en Efectivo',desc:' disposiciones foraneas.'},
    {key:'pagoSpei',level:'medium',title:'Pagos SPEI a Colaboradores',desc:' transferencias SPEI.'},
    {key:'montoDup',level:'medium',title:'Montos Duplicados Mismo Dia',desc:' montos duplicados.'},
    {key:'disp24k',level:'medium',title:'Disposiciones Mayores a $24k',desc:' disposiciones >$24k.'},
    {key:'reversados',level:'medium',title:'Operaciones Reversadas',desc:' operaciones reversadas.'},
    {key:'dias120',level:'medium',title:'Clientes con > 120 Dias de Atraso',desc:' clientes >120 dias.'},
    {key:'calif5',level:'low',title:'Calificacion Baja (<=5)',desc:' calificacion baja.'},
    {key:'highMonto',level:'low',title:'Operaciones de Alto Monto (>$25k)',desc:' operaciones >$25k.'}
  ];
  for(var ri=0;ri<riskDefs.length;ri++){var rdef=riskDefs[ri];var c=rc[rdef.key];if(c>0)risks.push({level:rdef.level,title:rdef.title+': '+c,desc:c+rdef.desc,count:c,details:rdet[rdef.key],id:rdef.key});}
  var topRS=[];for(var s in sucTotal){var t=sucTotal[s].i/sucTotal[s].t*100;if(sucTotal[s].t>=3&&t>20)topRS.push({suc:s,tasa:t,inc:sucTotal[s].i,tot:sucTotal[s].t});}topRS.sort(function(a,b){return b.tasa-a.tasa;});
  if(topRS.length>0){var sl=topRS.slice(0,5).map(function(s){return 'Suc '+s.suc+' ('+s.tasa.toFixed(1)+'%)';}).join(', ');risks.push({level:'high',title:'Sucursales con Alta Concentracion de Riesgo',desc:'Tasa >20%: '+sl,count:topRS.length,details:[],id:'sucRiesgo'});}

  return{kpis:{totalReg:totalReg,totalMonto:totalMonto,totalInc:totalInc,tasaInc:totalReg>0?(totalInc/totalReg*100):0,montoPromedio:totalReg>0?(totalMonto/totalReg):0,montoInc:montoInc,sucursalesCount:Object.keys(sucSet).length},charts:charts,risks:risks};
}

// ================================================================
// PAGINACION DE TABLA
// ================================================================

function getTablePage(page,filtersJson,sortCol,sortAsc,searchJson){
  var ss=SpreadsheetApp.getActiveSpreadsheet();var sh=ss.getSheetByName(CONFIG.DATA_SHEET);var tz=Session.getScriptTimeZone();
  var pageSize=CONFIG.TABLE_PAGE_SIZE;var filters=filtersJson?JSON.parse(filtersJson):{};var search=searchJson?JSON.parse(searchJson):{};
  var hasFilters=false;for(var k in filters){if(filters[k]){hasFilters=true;break;}}
  if(search.contrato||search.folio||search.general)hasFilters=true;
  var headers=sh.getRange('A1:'+CONFIG.DATA_RANGE_END+'1').getValues()[0];

  if(!hasFilters&&(sortCol===undefined||sortCol<0)){
    var lastRow=sh.getLastRow();var total=lastRow-1;var startRow=page*pageSize+2;
    var numRows=Math.min(pageSize,lastRow-startRow+1);
    if(numRows<=0)return JSON.stringify({rows:[],total:total,page:page,headers:headers});
    var rawRows=sh.getRange(startRow,1,numRows,headers.length).getValues();
    return JSON.stringify({rows:formatRows_(rawRows,tz),total:total,page:page,headers:headers});
  }

  var slimSheet=ss.getSheetByName(CONFIG.SLIM_SHEET);
  if(!slimSheet)return JSON.stringify({rows:[],total:0,page:0,headers:headers});
  var slimData=slimSheet.getDataRange().getValues();var slimH=slimData[0];var slimR=slimData.slice(1);
  var SC={};for(var i=0;i<slimH.length;i++)SC[slimH[i]]=i;
  var rowNumIdx=SC['rowNum'];

  var matching=[];
  for(var i=0;i<slimR.length;i++){
    var r=slimR[i];
    if(filters.sucursal2&&String(r[SC['sucursal2']])!==filters.sucursal2)continue;
    if(filters.contrato&&String(r[SC['contrato']])!==filters.contrato)continue;
    if(filters.folio&&String(r[SC['folio']])!==filters.folio)continue;
    if(filters.tipo_dispo&&String(r[SC['tipo_dispo']])!==filters.tipo_dispo)continue;
    if(filters.estatus_destino&&String(r[SC['estatus_destino']])!==filters.estatus_destino)continue;
    if(filters.A1&&String(r[SC['A1']]).indexOf(filters.A1)===-1)continue;
    if(filters.CALIFICACION&&String(r[SC['CALIFICACION']])!==filters.CALIFICACION)continue;
    if(filters.empresa&&String(r[SC['empresa']])!==filters.empresa)continue;
    if(search.contrato&&String(r[SC['contrato']]).toLowerCase().indexOf(search.contrato.toLowerCase())===-1)continue;
    if(search.folio&&String(r[SC['folio']]).toLowerCase().indexOf(search.folio.toLowerCase())===-1)continue;
    if(search.general){
      var gen=search.general.toLowerCase();var found=false;
      for(var si=0;si<slimH.length;si++){if(String(r[si]).toLowerCase().indexOf(gen)>=0){found=true;break;}}
      if(!found)continue;
    }
    matching.push(r[rowNumIdx]);
  }

  var total=matching.length;var startIdx=page*pageSize;var pageRowNums=matching.slice(startIdx,startIdx+pageSize);
  if(pageRowNums.length===0)return JSON.stringify({rows:[],total:total,page:page,headers:headers});

  var minRow=pageRowNums[0],maxRow=pageRowNums[0];
  for(var i=1;i<pageRowNums.length;i++){if(pageRowNums[i]<minRow)minRow=pageRowNums[i];if(pageRowNums[i]>maxRow)maxRow=pageRowNums[i];}
  var rowMap={};
  if(maxRow-minRow+1 > pageRowNums.length*10){
    for(var i=0;i<pageRowNums.length;i++){var rw=sh.getRange(pageRowNums[i],1,1,headers.length).getValues()[0];rowMap[pageRowNums[i]]=rw;}
  } else {
    var batchData=sh.getRange(minRow,1,maxRow-minRow+1,headers.length).getValues();
    for(var i=0;i<batchData.length;i++)rowMap[minRow+i]=batchData[i];
  }

  var rows=[];
  for(var i=0;i<pageRowNums.length;i++){
    var raw=rowMap[pageRowNums[i]];if(!raw)continue;
    var fmtRow=[];for(var j=0;j<raw.length;j++){var val=raw[j];if(val instanceof Date)val=Utilities.formatDate(val,tz,'dd/MM/yyyy HH:mm:ss');fmtRow.push(val);}
    rows.push(fmtRow);
  }
  return JSON.stringify({rows:rows,total:total,page:page,headers:headers});
}

// ================================================================
// CHAT CON GEMINI
// ================================================================

function chatWithGemini(userMessage, context, chatHistory) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return JSON.stringify({error: 'API Key de Gemini no configurada. Ve a Configuracion del proyecto > Propiedades de script y agrega GEMINI_API_KEY'});

  var model = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-2.0-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  var systemPrompt = [
    'Eres un agente analista experto en prevencion de fraude, lavado de dinero (PLD) y riesgos operativos',
    'para FINDEP (Financiera Independencia), empresa mexicana de microfinanzas.',
    '',
    '## Tu rol',
    'Analizas el Monitor de Disposiciones de Caja Unica. Las "disposiciones" son desembolsos de credito',
    'que se entregan a clientes en sucursales. Tu trabajo es detectar patrones sospechosos, explicar',
    'anomalias y dar recomendaciones accionables al equipo de control interno.',
    'Tienes capacidades de inteligencia predictiva: interpretas modelos estadisticos (regresion lineal,',
    'Z-Score, Bandas de Bollinger) y scores compuestos para anticipar riesgos futuros.',
    '',
    '## Banderas de riesgo (flags) y su severidad',
    '',
    '### SEVERIDAD ALTA (posible fraude):',
    '- **Fuera de horario**: Disposiciones fuera del horario laboral. Posible uso no autorizado de terminales.',
    '- **+1 mismo dia**: Multiples disposiciones al mismo cliente el mismo dia. Posible fraccionamiento.',
    '- **Tel repetido distintos contratos**: Mismo telefono en contratos diferentes. Posible identidad falsa.',
    '- **Tel de Colaborador**: Telefono del cliente coincide con un empleado. Alto riesgo de fraude interno.',
    '- **Contratos en menos de 3 min**: Operaciones demasiado rapidas. Posible operacion sin cliente presente.',
    '- **Pago SPEI Colab**: Transferencia SPEI dirigida a cuenta de colaborador. Posible desvio de fondos.',
    '',
    '### SEVERIDAD MEDIA (requiere revision):',
    '- **Foraneas efectivo**: Disposicion en sucursal diferente a la del contrato, en efectivo.',
    '- **Monto duplicado mismo dia**: Mismo monto exacto el mismo dia. Posible error o duplicacion intencional.',
    '- **Disposiciones >24k**: Montos superiores a $24,000. Umbral de reporte PLD.',
    '- **REVERSADO**: Operacion reversada. Revisar si es patron recurrente.',
    '',
    '### SEVERIDAD BAJA (monitoreo):',
    '- **> 120 dias**: Cliente con mas de 120 dias de atraso. Riesgo de credito.',
    '- **Calificacion <= 5**: Cliente con calificacion crediticia baja.',
    '- **En Quincena**: Disposicion en periodo de quincena (normal pero se monitorea).',
    '',
    '## Inteligencia Predictiva - Tu capacidad analitica avanzada',
    '',
    'El monitor ejecuta cada 10 minutos un pipeline predictivo sobre el historico de 60 dias (hoja _historico).',
    'Tu DEBES usar estos datos para dar respuestas con profundidad analitica. A continuacion se describe',
    'cada modelo, como interpretarlo y que acciones recomendar.',
    '',
    '### 1. Regresion lineal (linearRegression_)',
    'Se calcula sobre el historico de 60 dias para tres metricas: tasa de incidencia, total de incidencias y monto total.',
    '- **slope (pendiente)**: Velocidad de cambio diario. Positiva = la metrica esta empeorando. Negativa = mejorando.',
    '- **R2 (coeficiente de determinacion)**: Confiabilidad del modelo. R2 > 0.7 = tendencia fuerte y confiable.',
    '  R2 entre 0.3 y 0.7 = tendencia moderada. R2 < 0.3 = mucha variabilidad, la tendencia no es confiable.',
    '- **Proyecciones a 7, 14 y 30 dias**: Valor estimado SI la tendencia actual continua sin cambios.',
    '- **Como interpretar**: Si slope es positiva con R2 alto, hay una tendencia clara de deterioro.',
    '  Si slope es positiva pero R2 bajo, hay picos esporadicos pero no tendencia sostenida.',
    '  Ejemplo: slope=0.15, R2=0.82 en tasa de incidencia = "la tasa sube 0.15 puntos porcentuales por dia',
    '  de forma consistente; en 30 dias podria alcanzar X% si no se interviene".',
    '- **Acciones**: Si slope positiva + R2 > 0.5, recomendar investigacion inmediata de causas raiz.',
    '',
    '### 2. Z-Score (deteccion de anomalias por sucursal - zScoreAnalysis_)',
    'Mide cuantas desviaciones estandar se aleja cada sucursal del promedio general.',
    '- **|Z| > 2 = anomalia**: La sucursal se comporta de forma significativamente diferente al resto.',
    '- **|Z| > 3 = anomalia critica**: Comportamiento extremo, requiere atencion urgente.',
    '- **Z positivo alto**: La sucursal tiene MUCHO MAS incidencias/monto que el promedio.',
    '- **Z negativo alto**: La sucursal tiene MUCHO MENOS (puede ser bueno o sospechoso si tiene pocas operaciones).',
    '- Se calcula para: tasa de incidencia por sucursal, monto promedio por sucursal, frecuencia de operaciones.',
    '- Tambien se calcula sobre banderas historicas: Fuera de horario, +1 mismo dia, Tel repetido.',
    '- **Como interpretar**: Una sucursal con Z-Score de tasa=3.5 significa que su tasa de incidencia',
    '  esta 3.5 desviaciones estandar por encima del promedio. Es estadisticamente muy improbable',
    '  que sea aleatorio — hay algo sistematico en esa sucursal.',
    '- **Acciones**: Z > 3 = visita de auditoria o revision presencial. Z > 2 = monitoreo reforzado.',
    '',
    '### 3. Bandas de Bollinger (bollingerBands_)',
    'Tecnica de mercados financieros adaptada a deteccion de fraude.',
    '- **Media movil de 7 dias**: Suaviza la volatilidad diaria para ver la tendencia real.',
    '- **Banda superior**: Media + 2 desviaciones estandar. Umbral de alerta.',
    '- **Banda inferior**: Media - 2 desviaciones estandar.',
    '- **currentAboveBand = true**: La metrica actual ROMPIO la banda superior = comportamiento anormal.',
    '- Se calcula para tasa de incidencia y total de incidencias.',
    '- **Como interpretar**: Si la tasa de incidencia de hoy esta POR ENCIMA de la banda superior,',
    '  significa que el dia de hoy es estadisticamente anomalo comparado con los ultimos 7 dias.',
    '  Es equivalente a un "pico" inusual que merece investigacion.',
    '- **Acciones**: Si Bollinger alerta = revisar que sucursales contribuyeron al pico.',
    '  Cruzar con Z-Scores para identificar las sucursales responsables.',
    '',
    '### 4. Score predictivo compuesto por sucursal (0-100)',
    'Cada sucursal recibe un score que combina los 3 modelos + frecuencia de flags de alta severidad.',
    '- **Formula**: Score = Tendencia(0.35) + Anomalia(0.30) + Bollinger(0.20) + FlagsAlta(0.15)',
    '  - Tendencia (35%): Si la regresion global muestra slope positiva con R2 > 0.3',
    '  - Anomalia (30%): Z-Scores de tasa, monto promedio y frecuencia de la sucursal',
    '  - Bollinger (20%): Si la metrica actual rompe la banda superior',
    '  - Flags alta (15%): Proporcion de flags de alta severidad sobre total de operaciones',
    '- **Niveles**:',
    '  - 0-30 = Verde (bajo riesgo): Operacion normal, monitoreo rutinario.',
    '  - 31-60 = Amarillo (moderado): Requiere atencion, posibles patrones emergentes.',
    '  - 61-80 = Naranja (alto): Investigacion activa recomendada, posible fraude.',
    '  - 81-100 = Rojo (critico): Atencion inmediata, alta probabilidad de fraude o control roto.',
    '- **Como interpretar**: El score NO es una probabilidad de fraude; es una priorizacion.',
    '  Una sucursal roja no necesariamente tiene fraude confirmado, pero es donde PRIMERO debes mirar.',
    '- **Acciones por nivel**:',
    '  - Rojo: Escalamiento inmediato, suspension temporal de operaciones si es necesario.',
    '  - Naranja: Asignar coordinador de zona para revision presencial en 48h.',
    '  - Amarillo: Monitoreo diario, revisar en siguiente comite de riesgos.',
    '  - Verde: Seguimiento rutinario semanal.',
    '',
    '### 5. Heatmap sucursal vs banderas de riesgo',
    'Matriz de calor que cruza las top 15 sucursales con 8 tipos de flags:',
    'Fuera Horario, +1 Mismo Dia, Tel Repetido, Contratos <3min, Foraneas, Monto Dup, >120 Dias, Calif <=5.',
    '- Valores altos en una celda = la sucursal tiene concentracion de ese tipo de flag.',
    '- **Como interpretar**: Buscar patrones horizontales (sucursal con MUCHOS tipos de flag = problema generalizado)',
    '  y patrones verticales (un tipo de flag concentrado en pocas sucursales = posible modus operandi).',
    '- **Acciones**: Si una sucursal domina horizontalmente, es candidata a auditoria integral.',
    '  Si un flag domina verticalmente, investigar si hay una causa sistemica (ej: politica operativa rota).',
    '',
    '### 6. Relacion con los 12 controles de disposicion (CD-1 a CD-12)',
    'El modelo predictivo complementa el proceso de control de disposiciones:',
    '- Los controles CD-1 a CD-12 detectan alertas reactivas (ya ocurrieron).',
    '- El modelo predictivo ANTICIPA: que sucursales van a empeorar, donde concentrar recursos.',
    '- La regresion proyecta a futuro: "en 30 dias la tasa sera X%".',
    '- Los Z-Scores priorizan: "esta sucursal es la que mas se desvía del promedio".',
    '- El score compuesto RANKEA: "estas son las 10 sucursales donde debes actuar PRIMERO".',
    '',
    '### Como usar la inteligencia predictiva en tus respuestas',
    '- Cuando te pregunten por una sucursal especifica, busca su score predictivo, Z-Scores y flags.',
    '- Cuando te pregunten por tendencias, usa la regresion: slope, R2 y proyecciones.',
    '- Cuando te pregunten "que va a pasar", usa las proyecciones a 7/14/30 dias con la advertencia',
    '  de que son estimaciones lineales (no consideran intervenciones ni estacionalidad).',
    '- Cuando te pregunten por alertas, cruza Bollinger (picos de hoy) con Z-Scores (sucursales anomalas).',
    '- Siempre contextualiza: "el R2 es de X, lo cual indica que la tendencia es [fuerte/moderada/debil]".',
    '- Si los datos predictivos no estan disponibles, indica que se requiere historico de al menos 7 dias.',
    '',
    '## Reglas de respuesta',
    '1. Responde SIEMPRE en espanol',
    '2. Se conciso pero preciso. Usa datos especificos del contexto.',
    '3. Si mencionas riesgos, clasificalos por severidad (ALTA/MEDIA/BAJA)',
    '4. NUNCA reveles datos personales (nombres, telefonos, CURP, RFC)',
    '5. Si te preguntan algo fuera de tu dominio, indica amablemente que solo analizas disposiciones',
    '6. Cuando sea relevante, sugiere acciones concretas (investigar sucursal, revisar contrato, etc.)',
    '7. Usa formato con saltos de linea y listas para facilitar lectura',
    '8. Cuando uses datos predictivos, siempre indica el nivel de confianza (R2) y las limitaciones del modelo',
    '9. Prioriza hallazgos por score predictivo: menciona primero las sucursales rojas, luego naranjas',
    '10. Cuando detectes anomalias Z-Score, explica EN CONTEXTO que significa (no solo el numero)',
    '',
    '## Datos actuales del dashboard',
    context
  ].join('\n');

  var contents = [];
  if (chatHistory && chatHistory.length > 0) {
    for (var i = 0; i < chatHistory.length; i++) {
      contents.push({ role: chatHistory[i].role, parts: [{text: chatHistory[i].text}] });
    }
  }
  contents.push({ role: 'user', parts: [{text: userMessage}] });

  var payload = {
    systemInstruction: { parts: [{text: systemPrompt}] },
    contents: contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
  };

  try {
    var response = UrlFetchApp.fetch(url, {method:'post', contentType:'application/json', payload:JSON.stringify(payload), muteHttpExceptions:true});
    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0] && json.candidates[0].content) return JSON.stringify({reply: json.candidates[0].content.parts[0].text});
    if (json.error) return JSON.stringify({error: json.error.message});
    return JSON.stringify({error: 'Respuesta inesperada de Gemini'});
  } catch(e) { return JSON.stringify({error: e.message}); }
}

// ================================================================
// SISTEMA DE INCIDENCIAS
// ================================================================

function ensureIncidenciasSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.INCIDENCIAS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.INCIDENCIAS_SHEET);
    sh.getRange(1, 1, 1, INCIDENCIA_HEADERS.length).setValues([INCIDENCIA_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange('1:1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  }
  return sh;
}

function registrarIncidencia(dataJson) {
  try {
    var data = JSON.parse(dataJson);
    var sh = ensureIncidenciasSheet_();
    var lastRow = sh.getLastRow();
    var newId = 'INC-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + String(lastRow).padStart(4, '0');
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var user = Session.getActiveUser().getEmail() || 'Sistema';

    var row = [
      newId,
      now,
      data.sucursal || '',
      data.contrato || '',
      data.folio || '',
      data.tipoHallazgo || '',
      data.severidad || '',
      data.descripcion || '',
      data.accionRecomendada || '',
      data.responsable || '',
      data.fechaCompromiso || '',
      'Abierta',
      now,
      user
    ];

    sh.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
    return JSON.stringify({success: true, id: newId});
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}

function getIncidencias(filtrosJson) {
  try {
    var sh = ensureIncidenciasSheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return JSON.stringify({incidencias: [], stats: {abiertas: 0, enRevision: 0, cerradas: 0, vencidas: 0}});

    var data = sh.getRange(2, 1, lastRow - 1, INCIDENCIA_HEADERS.length).getValues();
    var filtros = filtrosJson ? JSON.parse(filtrosJson) : {};
    var hoy = new Date();
    var stats = {abiertas: 0, enRevision: 0, cerradas: 0, vencidas: 0};
    var incidencias = [];

    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      var inc = {
        id: r[0], fecha: r[1], sucursal: r[2], contrato: r[3], folio: r[4],
        tipoHallazgo: r[5], severidad: r[6], descripcion: r[7],
        accionRecomendada: r[8], responsable: r[9], fechaCompromiso: r[10],
        estado: r[11], fechaActualizacion: r[12], registradoPor: r[13],
        rowIndex: i + 2
      };

      // Format dates if they are Date objects
      if (inc.fecha instanceof Date) inc.fecha = Utilities.formatDate(inc.fecha, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      if (inc.fechaCompromiso instanceof Date) inc.fechaCompromiso = Utilities.formatDate(inc.fechaCompromiso, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      if (inc.fechaActualizacion instanceof Date) inc.fechaActualizacion = Utilities.formatDate(inc.fechaActualizacion, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

      // Stats
      var estado = String(inc.estado).trim();
      if (estado === 'Abierta') stats.abiertas++;
      else if (estado === 'En Revision') stats.enRevision++;
      else if (estado === 'Cerrada') stats.cerradas++;

      // Check if overdue
      if (estado !== 'Cerrada' && inc.fechaCompromiso) {
        var parts = String(inc.fechaCompromiso).split('/');
        if (parts.length === 3) {
          var fechaComp = new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
          if (fechaComp < hoy) stats.vencidas++;
        }
      }

      // Apply filters
      if (filtros.tipo && inc.tipoHallazgo !== filtros.tipo) continue;
      if (filtros.severidad && inc.severidad !== filtros.severidad) continue;
      if (filtros.estado && estado !== filtros.estado) continue;

      incidencias.push(inc);
    }

    return JSON.stringify({incidencias: incidencias, stats: stats});
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}

function updateIncidenciaEstado(rowIndex, nuevoEstado) {
  try {
    var sh = ensureIncidenciasSheet_();
    var estadoCol = INCIDENCIA_HEADERS.indexOf('Estado') + 1; // 12
    var fechaActCol = INCIDENCIA_HEADERS.indexOf('Fecha_Actualizacion') + 1; // 13
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    sh.getRange(rowIndex, estadoCol).setValue(nuevoEstado);
    sh.getRange(rowIndex, fechaActCol).setValue(now);
    return JSON.stringify({success: true});
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}

// ================================================================
// EXPORTACION DE SECCIONES A GOOGLE SHEETS
// ================================================================

function exportSectionToSheet(sectionId, jsonData) {
  try {
    var data = JSON.parse(jsonData);
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var title = 'Monitor Export - ' + (data.title || sectionId) + ' - ' + timestamp;
    var newSS = SpreadsheetApp.create(title);
    var newSheet = newSS.getActiveSheet();
    newSheet.setName(data.title || sectionId);

    if (data.headers && data.headers.length > 0) {
      newSheet.getRange(1, 1, 1, data.headers.length).setValues([data.headers]);
      newSheet.getRange('1:1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    }

    if (data.rows && data.rows.length > 0) {
      newSheet.getRange(2, 1, data.rows.length, data.rows[0].length).setValues(data.rows);
    }

    if (data.headers) {
      for (var i = 1; i <= data.headers.length; i++) {
        newSheet.autoResizeColumn(i);
      }
    }

    return JSON.stringify({success: true, url: newSS.getUrl(), id: newSS.getId()});
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
}

// ================================================================
// GESTION DE TRIGGERS
// ================================================================

function setupTrigger(){
  removeTrigger();
  ScriptApp.newTrigger('precomputeAll').timeDriven().everyMinutes(CONFIG.TRIGGER_MINUTES).create();
  Logger.log('Trigger configurado cada '+CONFIG.TRIGGER_MINUTES+' min');
  precomputeAll();
  Logger.log('Cache inicial poblado');
}

function removeTrigger(){
  var triggers=ScriptApp.getProjectTriggers();
  for(var i=0;i<triggers.length;i++){if(triggers[i].getHandlerFunction()==='precomputeAll')ScriptApp.deleteTrigger(triggers[i]);}
}

function ensureTriggerExists_(){
  var triggers=ScriptApp.getProjectTriggers();
  for(var i=0;i<triggers.length;i++){
    if(triggers[i].getHandlerFunction()==='precomputeAll') return;
  }
  ScriptApp.newTrigger('precomputeAll').timeBased().everyMinutes(CONFIG.TRIGGER_MINUTES).create();
  ScriptApp.newTrigger('precomputeAll').timeBased().after(1).create();
}

// ================================================================
// AUTENTICACION
// ================================================================

function ensureAuthSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.AUTH_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.AUTH_SHEET);
    sh.getRange(1, 1, 1, AUTH_HEADERS.length).setValues([AUTH_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange('1:1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sh.getRange(2, 1, 1, 3).setValues([[Session.getActiveUser().getEmail(), 'admin', 'SI']]);
    sh.autoResizeColumns(1, 3);
  }
  return sh;
}

function checkUserAccess_() {
  var email = Session.getActiveUser().getEmail();
  if (!email) return { authorized: false, email: '(no detectado)', role: '' };
  var sh = ensureAuthSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { authorized: false, email: email, role: '' };
  var data = sh.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === email.toLowerCase() &&
        String(data[i][2]).trim().toUpperCase() === 'SI') {
      return { authorized: true, email: email, role: String(data[i][1]).trim().toLowerCase() };
    }
  }
  return { authorized: false, email: email, role: '' };
}

function getAuthorizedUsers() {
  var auth = checkUserAccess_();
  if (!auth.authorized || auth.role !== 'admin') return JSON.stringify({ error: 'Sin permisos de administrador' });
  var sh = ensureAuthSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return JSON.stringify({ users: [] });
  var data = sh.getRange(2, 1, lastRow - 1, 3).getValues();
  var users = [];
  for (var i = 0; i < data.length; i++) {
    users.push({ email: data[i][0], rol: data[i][1], activo: data[i][2], rowIndex: i + 2 });
  }
  return JSON.stringify({ users: users });
}

function addAuthorizedUser(email, rol) {
  var auth = checkUserAccess_();
  if (!auth.authorized || auth.role !== 'admin') return JSON.stringify({ error: 'Sin permisos de administrador' });
  var sh = ensureAuthSheet_();
  var lastRow = sh.getLastRow();
  sh.getRange(lastRow + 1, 1, 1, 3).setValues([[email.trim().toLowerCase(), rol || 'viewer', 'SI']]);
  return JSON.stringify({ success: true });
}

function removeAuthorizedUser(rowIndex) {
  var auth = checkUserAccess_();
  if (!auth.authorized || auth.role !== 'admin') return JSON.stringify({ error: 'Sin permisos de administrador' });
  var sh = ensureAuthSheet_();
  sh.getRange(rowIndex, 3).setValue('NO');
  return JSON.stringify({ success: true });
}

// ================================================================
// DATOS EJECUTIVOS (tabs nuevos)
// ================================================================

function computeExecutiveData_(allData, COL, rc, sucTotal, sucCount, flagColNames, flagStartIdx) {
  var totalReg = allData.length;

  // --- Financial KPIs ---
  var capitalInsoluto = 0, saldoVencido = 0, diasVencidosSum = 0, diasVencidosCount = 0;
  var dispEfectivo = 0, dispCheque = 0, montoEfectivo = 0, montoCheque = 0;
  var montoConFlags = 0, montoSinFlags = 0, totalReversados = 0;
  var calificacionDist = {};
  var diasVencidosDist = {'0':0,'1-30':0,'31-60':0,'61-90':0,'91-120':0,'>120':0};

  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var monto = parseFloat(String(r[COL['total_disposicion']]).replace(/[^0-9.\-]/g, '')) || 0;
    var cnt = parseInt(r[COL['COUNT']]) || 0;

    // Capital insoluto & saldo vencido
    var ci = parseFloat(r[COL['capital_insoluto']]) || 0;
    var sv = parseFloat(r[COL['saldo_vencido']]) || 0;
    capitalInsoluto += ci;
    saldoVencido += sv;

    // Dias vencidos
    var dv = parseInt(r[COL['dias_vencidos']]) || 0;
    if (dv > 0) { diasVencidosSum += dv; diasVencidosCount++; }
    if (dv === 0) diasVencidosDist['0']++;
    else if (dv <= 30) diasVencidosDist['1-30']++;
    else if (dv <= 60) diasVencidosDist['31-60']++;
    else if (dv <= 90) diasVencidosDist['61-90']++;
    else if (dv <= 120) diasVencidosDist['91-120']++;
    else diasVencidosDist['>120']++;

    // Tipo dispersion
    var tipo = String(r[COL['tipo_dispersion']] || '').toLowerCase();
    if (tipo.indexOf('cheque') >= 0) { dispCheque++; montoCheque += monto; }
    else { dispEfectivo++; montoEfectivo += monto; }

    // Monto con/sin flags
    if (cnt > 0) montoConFlags += monto;
    else montoSinFlags += monto;

    // Calificacion distribucion
    var calif = String(r[COL['CALIFICACION']] || 'N/D').trim();
    if (!calif || calif === '0' || calif === 'undefined') calif = 'N/D';
    calificacionDist[calif] = (calificacionDist[calif] || 0) + 1;
  }

  totalReversados = rc.reversados || 0;

  // --- Risk Score per sucursal ---
  var sucFlags = {};
  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var suc = String(r[COL['sucursal2']] || '').trim();
    if (!suc) continue;
    if (!sucFlags[suc]) sucFlags[suc] = { alta: 0, media: 0, baja: 0, total: 0, flagDetail: {} };
    sucFlags[suc].total++;
    var monto = parseFloat(String(r[COL['total_disposicion']]).replace(/[^0-9.\-]/g, '')) || 0;
    if (monto > 25000) { sucFlags[suc].baja++; sucFlags[suc].flagDetail['highMonto'] = (sucFlags[suc].flagDetail['highMonto'] || 0) + 1; }

    for (var fi = 0; fi < flagColNames.length; fi++) {
      var fIdx = flagStartIdx + fi;
      if (fIdx < r.length) {
        var fv = String(r[fIdx]).toUpperCase().trim();
        if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') {
          var fn = flagColNames[fi];
          var fnL = fn.toLowerCase();
          sucFlags[suc].flagDetail[fn] = (sucFlags[suc].flagDetail[fn] || 0) + 1;

          // Classify severity
          if (fnL.indexOf('fuera') >= 0 && fnL.indexOf('horario') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('+1') >= 0 && fnL.indexOf('mismo') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('tel') >= 0 && fnL.indexOf('repetido') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('tel') >= 0 && fnL.indexOf('colaborador') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('contrato') >= 0 && fnL.indexOf('3 min') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('pago') >= 0 && fnL.indexOf('spei') >= 0) sucFlags[suc].alta++;
          else if (fnL.indexOf('foran') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('monto') >= 0 && fnL.indexOf('duplicado') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('disposicion') >= 0 && fnL.indexOf('24') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('reversado') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('120') >= 0) sucFlags[suc].media++;
          else if (fnL.indexOf('calificacion') >= 0 || fnL.indexOf('calif') >= 0) sucFlags[suc].baja++;
        }
      }
    }
  }

  var sucRiskScores = [];
  for (var s in sucFlags) {
    var sf = sucFlags[s];
    if (sf.total < 1) continue;
    var score = (sf.alta * 3 + sf.media * 2 + sf.baja * 1) / sf.total * 100;
    sucRiskScores.push({
      suc: s, score: Math.round(score * 10) / 10, alta: sf.alta, media: sf.media, baja: sf.baja,
      totalReg: sf.total, totalFlags: sf.alta + sf.media + sf.baja, flagDetail: sf.flagDetail
    });
  }
  sucRiskScores.sort(function(a, b) { return b.score - a.score; });

  // --- Headline ---
  var sucConInc = 0;
  for (var s in sucTotal) { if (sucTotal[s].i > 0) sucConInc++; }
  var alertasCriticas = rc.fueraHorario + rc.mismodia + rc.telRepetido + rc.telColab + rc.contratosRapidos + rc.pagoSpei;
  var headline = 'Hoy: ' + (rc.fueraHorario + rc.mismodia + rc.foraneas + rc.telRepetido + rc.telColab + rc.contratosRapidos + rc.pagoSpei + rc.montoDup + rc.disp24k + rc.calif5 + rc.dias120 + rc.reversados + rc.highMonto) + ' alertas en ' + sucConInc + ' sucursales';
  if (alertasCriticas > 0) headline += ' — ' + alertasCriticas + ' criticas';

  return {
    sucRiskScores: sucRiskScores,
    financial: {
      capitalInsoluto: capitalInsoluto,
      saldoVencido: saldoVencido,
      diasAtrasoProm: diasVencidosCount > 0 ? Math.round(diasVencidosSum / diasVencidosCount) : 0,
      tasaReversion: totalReg > 0 ? (totalReversados / totalReg * 100) : 0,
      montoConFlags: montoConFlags,
      montoSinFlags: montoSinFlags,
      dispEfectivo: dispEfectivo,
      dispCheque: dispCheque,
      montoEfectivo: montoEfectivo,
      montoCheque: montoCheque
    },
    calificacionDist: calificacionDist,
    diasVencidosDist: diasVencidosDist,
    headline: headline,
    alertasCriticas: alertasCriticas,
    sucConInc: sucConInc
  };
}

// ================================================================
// HISTORICO (snapshots diarios, rolling 60 dias)
// ================================================================

function ensureHistSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.HIST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HIST_SHEET);
    sh.getRange(1, 1, 1, HISTORICO_HEADERS.length).setValues([HISTORICO_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange('1:1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sh.hideSheet();
  }
  return sh;
}

function saveHistoricSnapshot_(snapshot) {
  var sh = ensureHistSheet_();
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var lastRow = sh.getLastRow();

  // Check if today already has a snapshot — update it instead of adding
  if (lastRow >= 2) {
    var dates = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      var d = dates[i][0];
      if (d instanceof Date) d = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      if (String(d) === today) {
        sh.getRange(i + 2, 1, 1, HISTORICO_HEADERS.length).setValues([snapshot]);
        cleanOldHistory_(sh, tz);
        return;
      }
    }
  }

  // Add new row
  sh.getRange(lastRow + 1, 1, 1, HISTORICO_HEADERS.length).setValues([snapshot]);
  cleanOldHistory_(sh, tz);
}

function cleanOldHistory_(sh, tz) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  var dates = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i][0];
    if (d instanceof Date && d < cutoff) rowsToDelete.push(i + 2);
  }
  // Delete from bottom to top to preserve row indices
  for (var i = rowsToDelete.length - 1; i >= 0; i--) {
    sh.deleteRow(rowsToDelete[i]);
  }
}

function getHistoricData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.HIST_SHEET);
    if (!sh || sh.getLastRow() < 2) return JSON.stringify({ rows: [], headers: HISTORICO_HEADERS });
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, HISTORICO_HEADERS.length).getValues();
    var tz = Session.getScriptTimeZone();
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = {};
      for (var j = 0; j < HISTORICO_HEADERS.length; j++) {
        var val = data[i][j];
        if (val instanceof Date) val = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
        row[HISTORICO_HEADERS[j]] = val;
      }
      rows.push(row);
    }
    rows.sort(function(a, b) { return a.fecha < b.fecha ? -1 : 1; });
    return JSON.stringify({ rows: rows, headers: HISTORICO_HEADERS });
  } catch(e) {
    return JSON.stringify({ error: e.message });
  }
}

// ================================================================
// INTELIGENCIA PREDICTIVA v4.0
// ================================================================

/**
 * Regresion lineal simple (minimos cuadrados)
 * Retorna: { slope, intercept, r2, projected }
 */
function linearRegression_(values) {
  var n = values.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0, projected: [0, 0, 0] };
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i; sumY2 += values[i] * values[i];
  }
  var denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: 0, r2: 0, projected: [0, 0, 0] };
  var slope = (n * sumXY - sumX * sumY) / denom;
  var intercept = (sumY - slope * sumX) / n;
  // R-squared
  var yMean = sumY / n;
  var ssTot = 0, ssRes = 0;
  for (var i = 0; i < n; i++) {
    var pred = slope * i + intercept;
    ssRes += (values[i] - pred) * (values[i] - pred);
    ssTot += (values[i] - yMean) * (values[i] - yMean);
  }
  var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // Proyecciones a 7, 14, 30 dias desde el ultimo punto
  var last = n - 1;
  var p7 = slope * (last + 7) + intercept;
  var p14 = slope * (last + 14) + intercept;
  var p30 = slope * (last + 30) + intercept;
  return { slope: slope, intercept: intercept, r2: Math.max(0, r2), projected: [Math.max(0, p7), Math.max(0, p14), Math.max(0, p30)] };
}

/**
 * Z-Score para deteccion de anomalias
 * Retorna array de { value, zScore, isAnomaly, isCritical }
 */
function zScoreAnalysis_(values) {
  var n = values.length;
  if (n < 2) return [];
  var mean = 0;
  for (var i = 0; i < n; i++) mean += values[i];
  mean /= n;
  var variance = 0;
  for (var i = 0; i < n; i++) variance += (values[i] - mean) * (values[i] - mean);
  var stdDev = Math.sqrt(variance / n);
  if (stdDev === 0) return values.map(function(v) { return { value: v, zScore: 0, isAnomaly: false, isCritical: false }; });
  return values.map(function(v) {
    var z = (v - mean) / stdDev;
    return { value: v, zScore: Math.round(z * 100) / 100, isAnomaly: Math.abs(z) > 2, isCritical: Math.abs(z) > 3 };
  });
}

/**
 * Media movil + Bandas de Bollinger
 * Retorna: { ma, upperBand, lowerBand, currentAboveBand }
 */
function bollingerBands_(values, window, deviations) {
  window = window || 7;
  deviations = deviations || 2;
  var n = values.length;
  if (n < window) return { ma: [], upperBand: [], lowerBand: [], currentAboveBand: false };
  var ma = [], upper = [], lower = [];
  for (var i = 0; i <= n - window; i++) {
    var slice = values.slice(i, i + window);
    var sum = 0;
    for (var j = 0; j < slice.length; j++) sum += slice[j];
    var avg = sum / window;
    var variance = 0;
    for (var j = 0; j < slice.length; j++) variance += (slice[j] - avg) * (slice[j] - avg);
    var std = Math.sqrt(variance / window);
    ma.push(Math.round(avg * 100) / 100);
    upper.push(Math.round((avg + deviations * std) * 100) / 100);
    lower.push(Math.round((avg - deviations * std) * 100) / 100);
  }
  var lastVal = values[n - 1];
  var aboveBand = upper.length > 0 && lastVal > upper[upper.length - 1];
  return { ma: ma, upperBand: upper, lowerBand: lower, currentAboveBand: aboveBand };
}

/**
 * Computa datos predictivos completos para todas las sucursales
 * Usa datos historicos de _historico + datos actuales de sucTotal
 */
function computePredictiveData_(sucTotal, sucCount, sucMonto, rc, allData, COL, flagColNames, flagStartIdx) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var histSheet = ss.getSheetByName(CONFIG.HIST_SHEET);

  // --- Cargar historico ---
  var histRows = [];
  if (histSheet && histSheet.getLastRow() >= 2) {
    var hData = histSheet.getRange(2, 1, histSheet.getLastRow() - 1, HISTORICO_HEADERS.length).getValues();
    var tz = Session.getScriptTimeZone();
    for (var i = 0; i < hData.length; i++) {
      var row = {};
      for (var j = 0; j < HISTORICO_HEADERS.length; j++) {
        var val = hData[i][j];
        if (val instanceof Date) val = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
        row[HISTORICO_HEADERS[j]] = val;
      }
      histRows.push(row);
    }
    histRows.sort(function(a, b) { return a.fecha < b.fecha ? -1 : 1; });
  }

  var diasHist = histRows.length;

  // --- Regresion + Bollinger sobre metricas globales ---
  var tasaIncHist = histRows.map(function(r) { return parseFloat(r.tasaInc) || 0; });
  var totalRegHist = histRows.map(function(r) { return parseFloat(r.totalReg) || 0; });
  var totalMontoHist = histRows.map(function(r) { return parseFloat(r.totalMonto) || 0; });
  var totalIncHist = histRows.map(function(r) { return parseFloat(r.totalInc) || 0; });

  var regTasa = linearRegression_(tasaIncHist);
  var regInc = linearRegression_(totalIncHist);
  var regMonto = linearRegression_(totalMontoHist);
  var bollTasa = bollingerBands_(tasaIncHist, 7, 2);
  var bollInc = bollingerBands_(totalIncHist, 7, 2);

  // --- Z-Score anomalias globales hoy ---
  var flagFueraH = histRows.map(function(r) { return parseFloat(r.flagFueraHorario) || 0; });
  var flagMismoD = histRows.map(function(r) { return parseFloat(r.flagMismodia) || 0; });
  var flagTelRep = histRows.map(function(r) { return parseFloat(r.flagTelRepetido) || 0; });

  var zFuera = zScoreAnalysis_(flagFueraH);
  var zMismo = zScoreAnalysis_(flagMismoD);
  var zTelRep = zScoreAnalysis_(flagTelRep);

  var anomaliasHoy = [];
  if (zFuera.length > 0 && zFuera[zFuera.length - 1].isAnomaly) anomaliasHoy.push({ flag: 'Fuera de horario', z: zFuera[zFuera.length - 1].zScore, critica: zFuera[zFuera.length - 1].isCritical });
  if (zMismo.length > 0 && zMismo[zMismo.length - 1].isAnomaly) anomaliasHoy.push({ flag: '+1 mismo dia', z: zMismo[zMismo.length - 1].zScore, critica: zMismo[zMismo.length - 1].isCritical });
  if (zTelRep.length > 0 && zTelRep[zTelRep.length - 1].isAnomaly) anomaliasHoy.push({ flag: 'Tel repetido', z: zTelRep[zTelRep.length - 1].zScore, critica: zTelRep[zTelRep.length - 1].isCritical });

  // --- Score predictivo por sucursal ---
  // Calcular Z-scores por sucursal sobre tasa de incidencia y monto promedio
  var sucKeys = Object.keys(sucTotal);
  var sucTasas = [], sucProms = [], sucFreqs = [];
  for (var si = 0; si < sucKeys.length; si++) {
    var s = sucKeys[si];
    var st = sucTotal[s];
    sucTasas.push(st.t > 0 ? st.i / st.t * 100 : 0);
    sucProms.push(st.t > 0 ? st.m / st.t : 0);
    sucFreqs.push(st.t);
  }
  var zTasas = zScoreAnalysis_(sucTasas);
  var zProms = zScoreAnalysis_(sucProms);
  var zFreqs = zScoreAnalysis_(sucFreqs);

  // Contar flags de alta severidad por sucursal
  var sucHighFlags = {};
  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var suc = String(r[COL['sucursal2']] || '').trim();
    if (!suc) continue;
    if (!sucHighFlags[suc]) sucHighFlags[suc] = 0;
    for (var fi = 0; fi < flagColNames.length; fi++) {
      var fIdx = flagStartIdx + fi;
      if (fIdx < r.length) {
        var fv = String(r[fIdx]).toUpperCase().trim();
        if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') {
          var fnL = flagColNames[fi].toLowerCase();
          if ((fnL.indexOf('fuera') >= 0 && fnL.indexOf('horario') >= 0) ||
              (fnL.indexOf('+1') >= 0 && fnL.indexOf('mismo') >= 0) ||
              (fnL.indexOf('tel') >= 0 && fnL.indexOf('repetido') >= 0) ||
              (fnL.indexOf('tel') >= 0 && fnL.indexOf('colaborador') >= 0) ||
              (fnL.indexOf('contrato') >= 0 && fnL.indexOf('3 min') >= 0) ||
              (fnL.indexOf('pago') >= 0 && fnL.indexOf('spei') >= 0)) {
            sucHighFlags[suc]++;
          }
        }
      }
    }
  }

  var predictiveScores = [];
  for (var si = 0; si < sucKeys.length; si++) {
    var s = sucKeys[si];
    var st = sucTotal[s];
    if (st.t < 3) continue; // minimo 3 operaciones

    var zTasa = zTasas[si] ? Math.max(0, zTasas[si].zScore) : 0;
    var zProm = zProms[si] ? Math.max(0, zProms[si].zScore) : 0;
    var zFreq = zFreqs[si] ? Math.max(0, zFreqs[si].zScore) : 0;

    // Componente de tendencia: usar regresion global como proxy
    var trendScore = 0;
    if (regTasa.slope > 0 && regTasa.r2 > 0.3) trendScore = Math.min(100, regTasa.slope * 10 * regTasa.r2);

    // Componente anomalia
    var anomalyScore = Math.min(100, (zTasa * 15 + zProm * 10 + zFreq * 5));

    // Componente Bollinger
    var bollingerScore = 0;
    if (bollTasa.currentAboveBand) bollingerScore += 30;
    if (bollInc.currentAboveBand) bollingerScore += 20;

    // Componente flags alta severidad
    var highFlagCount = sucHighFlags[s] || 0;
    var flagScore = Math.min(100, highFlagCount / Math.max(1, st.t) * 200);

    // Score compuesto ponderado (0-100)
    var score = Math.round(
      trendScore * 0.35 +
      anomalyScore * 0.30 +
      bollingerScore * 0.20 +
      flagScore * 0.15
    );
    score = Math.min(100, Math.max(0, score));

    var nivel = score <= 30 ? 'verde' : score <= 60 ? 'amarillo' : score <= 80 ? 'naranja' : 'rojo';

    predictiveScores.push({
      suc: s,
      score: score,
      nivel: nivel,
      operaciones: st.t,
      incidencias: st.i,
      tasa: Math.round(st.i / st.t * 10000) / 100,
      montoTotal: Math.round(st.m),
      flagsAlta: highFlagCount,
      zTasa: zTasas[si] ? zTasas[si].zScore : 0,
      zMonto: zProms[si] ? zProms[si].zScore : 0,
      anomalia: (zTasas[si] && zTasas[si].isAnomaly) || (zProms[si] && zProms[si].isAnomaly)
    });
  }
  predictiveScores.sort(function(a, b) { return b.score - a.score; });

  // --- Heatmap: sucursal vs tipo de flag ---
  var heatmapFlags = ['fueraHorario', 'mismodia', 'telRepetido', 'contratosRapidos', 'foraneas', 'montoDup', 'dias120', 'calif5'];
  var heatmapLabels = ['Fuera Horario', '+1 Mismo Dia', 'Tel Repetido', 'Contratos <3min', 'Foraneas', 'Monto Dup', '>120 Dias', 'Calif <=5'];
  var topSucsForHeatmap = predictiveScores.slice(0, 15).map(function(p) { return p.suc; });

  var heatmapData = {};
  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var suc = String(r[COL['sucursal2']] || '').trim();
    if (topSucsForHeatmap.indexOf(suc) === -1) continue;
    if (!heatmapData[suc]) {
      heatmapData[suc] = {};
      for (var hi = 0; hi < heatmapFlags.length; hi++) heatmapData[suc][heatmapFlags[hi]] = 0;
    }
    for (var fi = 0; fi < flagColNames.length; fi++) {
      var fIdx = flagStartIdx + fi;
      if (fIdx < r.length) {
        var fv = String(r[fIdx]).toUpperCase().trim();
        if (fv === 'SI' || fv === 'YES' || fv === 'TRUE' || fv === '1') {
          var fnL = flagColNames[fi].toLowerCase();
          if (fnL.indexOf('fuera') >= 0 && fnL.indexOf('horario') >= 0) heatmapData[suc].fueraHorario++;
          if (fnL.indexOf('+1') >= 0 && fnL.indexOf('mismo') >= 0) heatmapData[suc].mismodia++;
          if (fnL.indexOf('tel') >= 0 && fnL.indexOf('repetido') >= 0) heatmapData[suc].telRepetido++;
          if (fnL.indexOf('contrato') >= 0 && fnL.indexOf('3 min') >= 0) heatmapData[suc].contratosRapidos++;
          if (fnL.indexOf('foran') >= 0) heatmapData[suc].foraneas++;
          if (fnL.indexOf('monto') >= 0 && fnL.indexOf('duplicado') >= 0) heatmapData[suc].montoDup++;
          if (fnL.indexOf('120') >= 0) heatmapData[suc].dias120++;
          if (fnL.indexOf('calificacion') >= 0 || fnL.indexOf('calif') >= 0) heatmapData[suc].calif5++;
        }
      }
    }
  }

  // --- Historico para graficas de tendencia ---
  var tendencias = {
    fechas: histRows.map(function(r) { return r.fecha; }),
    tasaInc: tasaIncHist,
    totalInc: totalIncHist,
    totalReg: totalRegHist
  };

  // --- Resumen ---
  var conteoNiveles = { verde: 0, amarillo: 0, naranja: 0, rojo: 0 };
  for (var i = 0; i < predictiveScores.length; i++) conteoNiveles[predictiveScores[i].nivel]++;

  return {
    scores: predictiveScores.slice(0, 30),
    conteoNiveles: conteoNiveles,
    diasHistorico: diasHist,
    regresion: {
      tasa: { slope: Math.round(regTasa.slope * 1000) / 1000, r2: Math.round(regTasa.r2 * 100) / 100, projected: regTasa.projected.map(function(v) { return Math.round(v * 100) / 100; }) },
      incidencias: { slope: Math.round(regInc.slope * 1000) / 1000, r2: Math.round(regInc.r2 * 100) / 100, projected: regInc.projected.map(function(v) { return Math.round(v * 100) / 100; }) },
      monto: { slope: Math.round(regMonto.slope * 1000) / 1000, r2: Math.round(regMonto.r2 * 100) / 100, projected: regMonto.projected.map(function(v) { return Math.round(v * 100) / 100; }) }
    },
    bollinger: {
      tasa: { ma: bollTasa.ma, upper: bollTasa.upperBand, lower: bollTasa.lowerBand, alerta: bollTasa.currentAboveBand },
      incidencias: { ma: bollInc.ma, upper: bollInc.upperBand, lower: bollInc.lowerBand, alerta: bollInc.currentAboveBand }
    },
    anomaliasHoy: anomaliasHoy,
    heatmap: { sucs: topSucsForHeatmap, flags: heatmapLabels, flagKeys: heatmapFlags, data: heatmapData },
    tendencias: tendencias
  };
}

/**
 * Genera insights predictivos usando Gemini AI
 */
function generatePredictiveInsights_(predictiveData) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { insights: 'API Key de Gemini no configurada. Los insights predictivos requieren Gemini.' };

  var model = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-2.0-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  var top10 = predictiveData.scores.slice(0, 10);
  var anomalias = predictiveData.anomaliasHoy;
  var reg = predictiveData.regresion;
  var niveles = predictiveData.conteoNiveles;

  var prompt = [
    'Eres un analista predictivo experto en prevencion de fraude y riesgos operativos para FINDEP (microfinanzas Mexico).',
    'Analiza los siguientes datos predictivos del Monitor de Disposiciones y genera un reporte breve con:',
    '',
    '1. **Estado general**: Resumen en 1-2 lineas del nivel de riesgo actual',
    '2. **Alertas criticas**: Sucursales que requieren atencion inmediata (max 3)',
    '3. **Patrones detectados**: Correlaciones o comportamientos emergentes',
    '4. **Proyeccion**: Que se espera en los proximos 7-14 dias segun las tendencias',
    '5. **Acciones recomendadas**: Top 3 acciones concretas priorizadas',
    '',
    '## Datos:',
    '- Sucursales por nivel: ' + JSON.stringify(niveles),
    '- Regresion tasa incidencia: slope=' + reg.tasa.slope + ', R2=' + reg.tasa.r2 + ', proyeccion 7/14/30d=' + reg.tasa.projected.join('/'),
    '- Regresion incidencias: slope=' + reg.incidencias.slope + ', R2=' + reg.incidencias.r2,
    '- Anomalias hoy: ' + (anomalias.length > 0 ? JSON.stringify(anomalias) : 'Ninguna'),
    '- Top 10 sucursales riesgo:',
    top10.map(function(s) {
      return '  Suc ' + s.suc + ': score=' + s.score + ' (' + s.nivel + '), ops=' + s.operaciones + ', inc=' + s.incidencias + ', tasa=' + s.tasa + '%, flagsAlta=' + s.flagsAlta + (s.anomalia ? ' [ANOMALIA]' : '');
    }).join('\n'),
    '',
    'Responde en espanol, conciso (max 400 palabras). Usa formato con saltos de linea.'
  ].join('\n');

  try {
    var payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    };
    var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      return { insights: json.candidates[0].content.parts[0].text };
    }
    return { insights: 'No se pudo generar analisis predictivo.' };
  } catch (e) {
    return { insights: 'Error al consultar Gemini: ' + e.message };
  }
}

// ================================================================
// REPORTE PREDICTIVO DIARIO POR CORREO
// ================================================================

var REPORT_EMAIL = 'hgalvezb@findep.com.mx';

function debugReportData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cacheSheet = ss.getSheetByName(CONFIG.CACHE_SHEET);
  if (!cacheSheet) return 'ERROR: No existe hoja ' + CONFIG.CACHE_SHEET;
  if (cacheSheet.getLastColumn() === 0) return 'ERROR: Hoja cache vacia (0 columnas)';
  var lastCol = cacheSheet.getLastColumn();
  var chunks = cacheSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var raw = chunks.join('');
  if (raw.length < 10) return 'ERROR: Cache con menos de 10 chars (len=' + raw.length + ')';
  var data;
  try { data = JSON.parse(raw); } catch(e) { return 'ERROR: JSON parse failed: ' + e.message; }
  var pred = data.predictive;
  if (!pred) return 'ERROR: data.predictive es null/undefined. Keys disponibles: ' + Object.keys(data).join(', ');
  return 'OK: predictive existe. Keys: ' + Object.keys(pred).join(', ') + '. Scores: ' + (pred.scores ? pred.scores.length : 0) + '. DiasHist: ' + (pred.diasHistorico || 0);
}

function sendDailyPredictiveReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cacheSheet = ss.getSheetByName(CONFIG.CACHE_SHEET);
  if (!cacheSheet || cacheSheet.getLastColumn() === 0) return;

  var lastCol = cacheSheet.getLastColumn();
  var chunks = cacheSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var raw = chunks.join('');
  if (raw.length < 10) return;

  var data;
  try { data = JSON.parse(raw); } catch(e) { return; }

  var pred = data.predictive;
  var kpis = data.kpis || {};
  if (!pred) return;

  var tz = Session.getScriptTimeZone();
  var fechaHoy = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

  // --- Construir HTML del email ---
  var html = [];
  html.push('<div style="font-family:Segoe UI,Arial,sans-serif;max-width:700px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:24px;border-radius:12px;">');

  // Header
  html.push('<div style="text-align:center;padding:16px 0;border-bottom:1px solid #30363d;">');
  html.push('<h1 style="margin:0;color:#c9d1d9;font-size:22px;">Monitor de Disposiciones</h1>');
  html.push('<p style="margin:4px 0 0;color:#8b949e;font-size:13px;">Reporte Predictivo Diario - ' + fechaHoy + '</p>');
  html.push('</div>');

  // KPIs principales
  html.push('<div style="display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;">');
  var kpiItems = [
    { label: 'Registros', value: kpis.totalReg || 0, color: '#58a6ff' },
    { label: 'Incidencias', value: (kpis.totalInc || 0) + ' (' + (kpis.tasaInc || 0).toFixed(1) + '%)', color: '#f85149' },
    { label: 'Monto Total', value: '$' + ((kpis.totalMonto || 0) / 1000000).toFixed(2) + 'M', color: '#3fb950' },
    { label: 'Monto Riesgo', value: '$' + ((kpis.montoInc || 0) / 1000000).toFixed(2) + 'M', color: '#d29922' },
    { label: 'Sucursales', value: kpis.sucursalesCount || 0, color: '#bc8cff' }
  ];
  for (var i = 0; i < kpiItems.length; i++) {
    var ki = kpiItems[i];
    html.push('<div style="flex:1;min-width:120px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px;text-align:center;">');
    html.push('<div style="font-size:11px;color:#8b949e;">' + ki.label + '</div>');
    html.push('<div style="font-size:18px;font-weight:bold;color:' + ki.color + ';">' + ki.value + '</div>');
    html.push('</div>');
  }
  html.push('</div>');

  // Semaforo de sucursales
  if (pred.conteoNiveles) {
    var cn = pred.conteoNiveles;
    html.push('<h2 style="color:#c9d1d9;font-size:16px;margin:20px 0 8px;border-bottom:1px solid #30363d;padding-bottom:6px;">Semaforo de Sucursales</h2>');
    html.push('<div style="display:flex;gap:8px;flex-wrap:wrap;">');
    var niveles = [
      { label: 'Rojo (Critico)', val: cn.rojo || 0, color: '#f85149', bg: '#3d1114' },
      { label: 'Naranja (Alto)', val: cn.naranja || 0, color: '#d29922', bg: '#3d2e00' },
      { label: 'Amarillo (Mod.)', val: cn.amarillo || 0, color: '#e3b341', bg: '#3d3200' },
      { label: 'Verde (Bajo)', val: cn.verde || 0, color: '#3fb950', bg: '#0d3117' }
    ];
    for (var i = 0; i < niveles.length; i++) {
      var n = niveles[i];
      html.push('<div style="flex:1;min-width:140px;background:' + n.bg + ';border:1px solid ' + n.color + '33;border-radius:8px;padding:12px;text-align:center;">');
      html.push('<div style="font-size:28px;font-weight:bold;color:' + n.color + ';">' + n.val + '</div>');
      html.push('<div style="font-size:11px;color:' + n.color + ';">' + n.label + '</div>');
      html.push('</div>');
    }
    html.push('</div>');
  }

  // Regresion lineal
  if (pred.regresion) {
    var reg = pred.regresion;
    html.push('<h2 style="color:#c9d1d9;font-size:16px;margin:20px 0 8px;border-bottom:1px solid #30363d;padding-bottom:6px;">Tendencias (Regresion Lineal)</h2>');
    html.push('<table style="width:100%;border-collapse:collapse;font-size:13px;">');
    html.push('<tr style="background:#161b22;"><th style="padding:8px;text-align:left;color:#8b949e;border-bottom:1px solid #30363d;">Metrica</th><th style="padding:8px;color:#8b949e;border-bottom:1px solid #30363d;">Pendiente/dia</th><th style="padding:8px;color:#8b949e;border-bottom:1px solid #30363d;">R2</th><th style="padding:8px;color:#8b949e;border-bottom:1px solid #30363d;">Tendencia</th><th style="padding:8px;color:#8b949e;border-bottom:1px solid #30363d;">Proy. 7d</th><th style="padding:8px;color:#8b949e;border-bottom:1px solid #30363d;">Proy. 30d</th></tr>');
    var regItems = [
      { name: 'Tasa incidencia', d: reg.tasa },
      { name: 'Total incidencias', d: reg.incidencias },
      { name: 'Monto total', d: reg.monto }
    ];
    for (var i = 0; i < regItems.length; i++) {
      var ri = regItems[i];
      if (!ri.d) continue;
      var tendColor = ri.d.slope > 0 ? '#f85149' : '#3fb950';
      var tendText = ri.d.slope > 0 ? 'EMPEORANDO' : 'MEJORANDO';
      var r2Color = ri.d.r2 > 0.7 ? '#3fb950' : ri.d.r2 > 0.3 ? '#d29922' : '#8b949e';
      html.push('<tr style="border-bottom:1px solid #21262d;">');
      html.push('<td style="padding:8px;color:#c9d1d9;">' + ri.name + '</td>');
      html.push('<td style="padding:8px;text-align:center;color:' + tendColor + ';">' + ri.d.slope + '</td>');
      html.push('<td style="padding:8px;text-align:center;color:' + r2Color + ';">' + ri.d.r2 + '</td>');
      html.push('<td style="padding:8px;text-align:center;color:' + tendColor + ';font-weight:bold;">' + tendText + '</td>');
      html.push('<td style="padding:8px;text-align:center;color:#c9d1d9;">' + (ri.d.projected[0] || 0) + '</td>');
      html.push('<td style="padding:8px;text-align:center;color:#c9d1d9;">' + (ri.d.projected[2] || 0) + '</td>');
      html.push('</tr>');
    }
    html.push('</table>');
  }

  // Alertas Bollinger
  if (pred.bollinger) {
    var boll = pred.bollinger;
    var alertas = [];
    if (boll.tasa && boll.tasa.alerta) alertas.push('Tasa de incidencia por ENCIMA de banda superior');
    if (boll.incidencias && boll.incidencias.alerta) alertas.push('Total de incidencias por ENCIMA de banda superior');
    if (alertas.length > 0) {
      html.push('<h2 style="color:#f85149;font-size:16px;margin:20px 0 8px;border-bottom:1px solid #f8514933;padding-bottom:6px;">Alertas Bollinger (picos anomalos)</h2>');
      for (var i = 0; i < alertas.length; i++) {
        html.push('<div style="background:#3d1114;border:1px solid #f8514933;border-radius:6px;padding:10px;margin:4px 0;color:#f85149;font-size:13px;">&#9888; ' + alertas[i] + '</div>');
      }
    }
  }

  // Anomalias Z-Score
  if (pred.anomaliasHoy && pred.anomaliasHoy.length > 0) {
    html.push('<h2 style="color:#d29922;font-size:16px;margin:20px 0 8px;border-bottom:1px solid #d2992233;padding-bottom:6px;">Anomalias Z-Score Detectadas Hoy</h2>');
    for (var i = 0; i < pred.anomaliasHoy.length; i++) {
      var a = pred.anomaliasHoy[i];
      var aColor = a.critica ? '#f85149' : '#d29922';
      var aLabel = a.critica ? 'CRITICA' : 'ANOMALIA';
      html.push('<div style="background:#161b22;border-left:3px solid ' + aColor + ';padding:8px 12px;margin:4px 0;font-size:13px;">');
      html.push('<span style="color:' + aColor + ';font-weight:bold;">[' + aLabel + ']</span> ');
      html.push('<span style="color:#c9d1d9;">' + a.flag + '</span> ');
      html.push('<span style="color:#8b949e;">Z-Score: ' + a.z + '</span>');
      html.push('</div>');
    }
  }

  // Top sucursales por score
  if (pred.scores && pred.scores.length > 0) {
    html.push('<h2 style="color:#c9d1d9;font-size:16px;margin:20px 0 8px;border-bottom:1px solid #30363d;padding-bottom:6px;">Top 15 Sucursales por Score Predictivo</h2>');
    html.push('<table style="width:100%;border-collapse:collapse;font-size:12px;">');
    html.push('<tr style="background:#161b22;">');
    html.push('<th style="padding:6px;text-align:left;color:#8b949e;border-bottom:1px solid #30363d;">Sucursal</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Score</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Nivel</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Ops</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Inc</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Tasa%</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Flags Alta</th>');
    html.push('<th style="padding:6px;color:#8b949e;border-bottom:1px solid #30363d;">Z-Tasa</th>');
    html.push('</tr>');
    var top = pred.scores.slice(0, 15);
    for (var i = 0; i < top.length; i++) {
      var s = top[i];
      var nColor = s.nivel === 'rojo' ? '#f85149' : s.nivel === 'naranja' ? '#d29922' : s.nivel === 'amarillo' ? '#e3b341' : '#3fb950';
      var rowBg = i % 2 === 0 ? '#0d1117' : '#161b22';
      html.push('<tr style="background:' + rowBg + ';border-bottom:1px solid #21262d;">');
      html.push('<td style="padding:6px;color:#c9d1d9;font-weight:bold;">' + s.suc + '</td>');
      html.push('<td style="padding:6px;text-align:center;color:' + nColor + ';font-weight:bold;">' + s.score + '</td>');
      html.push('<td style="padding:6px;text-align:center;"><span style="background:' + nColor + '22;color:' + nColor + ';padding:2px 8px;border-radius:4px;font-size:11px;">' + s.nivel.toUpperCase() + '</span></td>');
      html.push('<td style="padding:6px;text-align:center;color:#c9d1d9;">' + s.operaciones + '</td>');
      html.push('<td style="padding:6px;text-align:center;color:#c9d1d9;">' + s.incidencias + '</td>');
      html.push('<td style="padding:6px;text-align:center;color:#c9d1d9;">' + s.tasa + '%</td>');
      html.push('<td style="padding:6px;text-align:center;color:' + (s.flagsAlta > 0 ? '#f85149' : '#8b949e') + ';">' + s.flagsAlta + '</td>');
      html.push('<td style="padding:6px;text-align:center;color:' + (s.zTasa > 2 ? '#f85149' : s.zTasa > 1 ? '#d29922' : '#8b949e') + ';">' + s.zTasa + '</td>');
      html.push('</tr>');
    }
    html.push('</table>');
  }

  // Acciones recomendadas
  html.push('<h2 style="color:#c9d1d9;font-size:16px;margin:20px 0 8px;border-bottom:1px solid #30363d;padding-bottom:6px;">Acciones Recomendadas</h2>');
  var acciones = [];
  if (pred.conteoNiveles && pred.conteoNiveles.rojo > 0) acciones.push({ pri: 'URGENTE', text: pred.conteoNiveles.rojo + ' sucursal(es) en nivel ROJO requieren escalamiento inmediato y posible suspension temporal.', color: '#f85149' });
  if (pred.conteoNiveles && pred.conteoNiveles.naranja > 0) acciones.push({ pri: 'ALTA', text: pred.conteoNiveles.naranja + ' sucursal(es) en nivel NARANJA requieren revision presencial en las proximas 48 horas.', color: '#d29922' });
  if (pred.bollinger && (pred.bollinger.tasa && pred.bollinger.tasa.alerta || pred.bollinger.incidencias && pred.bollinger.incidencias.alerta)) acciones.push({ pri: 'MEDIA', text: 'Se detectaron picos anomalos en Bollinger. Revisar que sucursales contribuyeron al pico de hoy.', color: '#e3b341' });
  if (pred.anomaliasHoy && pred.anomaliasHoy.length > 0) acciones.push({ pri: 'MEDIA', text: 'Hay ' + pred.anomaliasHoy.length + ' anomalia(s) Z-Score activas hoy. Cruzar con sucursales de mayor score.', color: '#e3b341' });
  if (pred.regresion && pred.regresion.tasa && pred.regresion.tasa.slope > 0 && pred.regresion.tasa.r2 > 0.3) acciones.push({ pri: 'MEDIA', text: 'La tasa de incidencia tiene tendencia al alza (slope=' + pred.regresion.tasa.slope + ', R2=' + pred.regresion.tasa.r2 + '). Investigar causas raiz.', color: '#e3b341' });
  if (acciones.length === 0) acciones.push({ pri: 'INFO', text: 'Sin alertas criticas. Continuar monitoreo rutinario.', color: '#3fb950' });
  for (var i = 0; i < acciones.length; i++) {
    var ac = acciones[i];
    html.push('<div style="background:#161b22;border-left:3px solid ' + ac.color + ';padding:8px 12px;margin:4px 0;font-size:13px;">');
    html.push('<span style="color:' + ac.color + ';font-weight:bold;">[' + ac.pri + ']</span> ');
    html.push('<span style="color:#c9d1d9;">' + ac.text + '</span>');
    html.push('</div>');
  }

  // Footer
  html.push('<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #30363d;">');
  html.push('<a href="https://script.google.com/a/macros/findep.com.mx/s/AKfycbxFpKrEHdNyWqsLRHGmHA15Hu6b_9zoI4vkpSGYnDYk2Pc8t0S3KLg7tCwT8ZdC8segRw/exec" style="display:inline-block;background:linear-gradient(135deg,#7c4dff,#536dfe);color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:bold;">Abrir Dashboard Completo</a>');
  html.push('<p style="color:#8b949e;font-size:11px;margin-top:12px;">Historico analizado: ' + (pred.diasHistorico || 0) + ' dias | Generado automaticamente por el Monitor de Disposiciones</p>');
  html.push('</div>');

  html.push('</div>');

  // --- Enviar email ---
  var subject = 'Monitor Disposiciones - Reporte Predictivo ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  if (pred.conteoNiveles && pred.conteoNiveles.rojo > 0) subject += ' [' + pred.conteoNiveles.rojo + ' ROJAS]';

  MailApp.sendEmail({
    to: REPORT_EMAIL,
    subject: subject,
    htmlBody: html.join(''),
    name: 'Monitor de Disposiciones FINDEP'
  });
  Logger.log('Correo enviado a ' + REPORT_EMAIL + ' con asunto: ' + subject);
}

function setupDailyReportTrigger() {
  // Eliminar triggers existentes del reporte
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyPredictiveReport') ScriptApp.deleteTrigger(triggers[i]);
  }
  // Crear trigger diario a las 7:00 AM
  ScriptApp.newTrigger('sendDailyPredictiveReport')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .create();
  Logger.log('Trigger de reporte diario configurado a las 7:00 AM');
}

// ================================================================
// UTILIDADES
// ================================================================

function saveToCacheSheet_(ss,json){
  var cs=ss.getSheetByName(CONFIG.CACHE_SHEET);
  if(!cs){cs=ss.insertSheet(CONFIG.CACHE_SHEET);cs.hideSheet();}
  cs.clearContents();
  var chunkSize=45000;
  if(json.length<=chunkSize){
    cs.getRange('A1').setValue(json);
  } else {
    var numChunks=Math.ceil(json.length/chunkSize);
    for(var i=0;i<numChunks;i++){
      cs.getRange(1,i+1).setValue(json.substring(i*chunkSize,(i+1)*chunkSize));
    }
  }
}

function saveSlimData_(ss,slimRows,slimColNames){
  var sl=ss.getSheetByName(CONFIG.SLIM_SHEET);
  if(!sl){sl=ss.insertSheet(CONFIG.SLIM_SHEET);sl.hideSheet();}
  sl.clearContents();
  var hdrs=slimColNames.concat(['rowNum']);
  sl.getRange(1,1,1,hdrs.length).setValues([hdrs]);
  var batchSize=10000;
  for(var i=0;i<slimRows.length;i+=batchSize){
    var batch=slimRows.slice(i,Math.min(i+batchSize,slimRows.length));
    sl.getRange(i+2,1,batch.length,batch[0].length).setValues(batch);
  }
}

function sortObj_(obj,limit){
  var arr=[];for(var k in obj)arr.push([k,obj[k]]);
  arr.sort(function(a,b){return b[1]-a[1];});
  return arr.slice(0,limit||20);
}

function formatRows_(rawRows,tz){
  var rows=[];
  for(var i=0;i<rawRows.length;i++){var row=[];for(var j=0;j<rawRows[i].length;j++){var val=rawRows[i][j];if(val instanceof Date)val=Utilities.formatDate(val,tz,'dd/MM/yyyy HH:mm:ss');row.push(val);}rows.push(row);}
  return rows;
}
