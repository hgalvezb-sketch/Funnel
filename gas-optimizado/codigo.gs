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
    tablePage:{rows:[],total:0,page:0}, lastUpdate:new Date().toLocaleString('es-MX')
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

  var result={
    kpis:{totalReg:allData.length,totalMonto:totalMonto,totalInc:totalInc,tasaInc:allData.length>0?(totalInc/allData.length*100):0,montoPromedio:allData.length>0?(totalMonto/allData.length):0,montoInc:montoInc,sucursalesCount:Object.keys(sucSet).length},
    charts:charts,risks:risks,filterOptions:filterOptions,headers:headers,flagNames:flagColNames,
    tablePage:{rows:firstPageRows,total:allData.length,page:0},
    lastUpdate:new Date().toLocaleString('es-MX'),
    executive:executive
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
    '## Reglas de respuesta',
    '1. Responde SIEMPRE en espanol',
    '2. Se conciso pero preciso. Usa datos especificos del contexto.',
    '3. Si mencionas riesgos, clasificalos por severidad (ALTA/MEDIA/BAJA)',
    '4. NUNCA reveles datos personales (nombres, telefonos, CURP, RFC)',
    '5. Si te preguntan algo fuera de tu dominio, indica amablemente que solo analizas disposiciones',
    '6. Cuando sea relevante, sugiere acciones concretas (investigar sucursal, revisar contrato, etc.)',
    '7. Usa formato con saltos de linea y listas para facilitar lectura',
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
