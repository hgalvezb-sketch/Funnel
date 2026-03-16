// ================================================================
// MONITOR DE DISPOSICIONES - Optimizado con Pre-agregacion
// ================================================================
// Arquitectura:
// - Un trigger cada 10 min pre-calcula KPIs, graficas y riesgos
// - doGet() sirve datos pre-calculados (~100KB) via template
// - Filtros y tabla usan llamadas server-side bajo demanda
// ================================================================

var CONFIG = {
  DATA_SHEET: 'bd_disp',
  CACHE_SHEET: '_dashboard_cache',
  SLIM_SHEET: '_dashboard_slim',
  DATA_RANGE_END: 'DG',
  FLAG_RANGE: 'CR1:DD1',
  TRIGGER_MINUTES: 10,
  TABLE_PAGE_SIZE: 50,
  MAX_DETAIL_ROWS: 50,
  MAX_FILTER_OPTIONS: 200
};

var SLIM_COL_NAMES = [
  'sucursal2','contrato','folio','tipo_dispo','estatus_destino',
  'A1','CALIFICACION','empresa','total_disposicion','COUNT','Edad'
];

// ================================================================
// WEB APP
// ================================================================

function doGet() {
  var template = HtmlService.createTemplateFromFile('Dashboard');
  template.dashboardData = getPrecomputedData();
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
  return precomputeAll();
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
  // Flag columns are in range CR:DD - find their actual index in the headers array
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

  var result={
    kpis:{totalReg:allData.length,totalMonto:totalMonto,totalInc:totalInc,tasaInc:allData.length>0?(totalInc/allData.length*100):0,montoPromedio:allData.length>0?(totalMonto/allData.length):0,montoInc:montoInc,sucursalesCount:Object.keys(sucSet).length},
    charts:charts,risks:risks,filterOptions:filterOptions,headers:headers,flagNames:flagColNames,
    tablePage:{rows:firstPageRows,total:allData.length,page:0},
    lastUpdate:new Date().toLocaleString('es-MX')
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
  var filters=JSON.parse(filtersJson);
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var slimSheet=ss.getSheetByName(CONFIG.SLIM_SHEET);
  if(!slimSheet||slimSheet.getLastRow()<1)return JSON.stringify({error:'Sin datos en cache.'});

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

  // Read rows: batch if dense, individual if sparse (avoids reading huge ranges)
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

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

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
