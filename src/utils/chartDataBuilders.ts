// Funciones para construir datos listos para consumir por los componentes de graficas.
// Este es el contrato principal entre la capa de datos y la capa de presentacion.

import { FunnelRecord } from '../types/funnel';
import { secondsToDays } from './timeFormatters';
import { groupBy, percentile, getWeekLabel } from './dataProcessing';

// --- Promedio por producto ---

export function buildProductAvgData(data: FunnelRecord[]): {
  producto: string; promedio: number; mediana: number; cantidad: number;
}[] {
  if (!data || data.length === 0) return [];

  const grouped = groupBy(data, (r) => r.codigo_producto);
  const result: { producto: string; promedio: number; mediana: number; cantidad: number }[] = [];

  grouped.forEach((records, producto) => {
    const timesInDays = records.map((r) => secondsToDays(r.Tiempo_funnel_segundos_netos));
    const sum = timesInDays.reduce((acc, v) => acc + v, 0);
    const promedio = sum / timesInDays.length;
    const mediana = percentile(timesInDays, 50);

    result.push({
      producto,
      promedio,
      mediana,
      cantidad: records.length,
    });
  });

  // Ordenar por promedio descendente
  result.sort((a, b) => b.promedio - a.promedio);
  return result;
}

// --- Histograma de distribucion ---

// Rangos no lineales en dias
const HISTOGRAM_BINS: { label: string; min: number; max: number }[] = [
  { label: '< 12h', min: 0, max: 0.5 },
  { label: '12h-1d', min: 0.5, max: 1 },
  { label: '1-2d', min: 1, max: 2 },
  { label: '2-3d', min: 2, max: 3 },
  { label: '3-5d', min: 3, max: 5 },
  { label: '5-7d', min: 5, max: 7 },
  { label: '1-2 sem', min: 7, max: 14 },
  { label: '2-3 sem', min: 14, max: 21 },
  { label: '3-4 sem', min: 21, max: 30 },
  { label: '1-1.5 mes', min: 30, max: 45 },
  { label: '1.5-2 mes', min: 45, max: 60 },
  { label: '> 2 meses', min: 60, max: Infinity },
];

export function buildHistogramData(data: FunnelRecord[]): {
  rango: string; cantidad: number; porcentaje: number;
}[] {
  if (!data || data.length === 0) return [];

  const total = data.length;

  // Inicializar contadores
  const counts = new Array(HISTOGRAM_BINS.length).fill(0);

  for (const record of data) {
    const days = secondsToDays(record.Tiempo_funnel_segundos_netos);

    for (let i = 0; i < HISTOGRAM_BINS.length; i++) {
      const bin = HISTOGRAM_BINS[i];
      if (days >= bin.min && days < bin.max) {
        counts[i]++;
        break;
      }
    }
  }

  return HISTOGRAM_BINS.map((bin, i) => ({
    rango: bin.label,
    cantidad: counts[i],
    porcentaje: (counts[i] / total) * 100,
  }));
}

// --- Tendencia temporal por semana ---

export function buildTrendData(data: FunnelRecord[]): {
  semana: string; promedioTotal: number; promedioFISA: number; promedioAEF: number; volumen: number;
}[] {
  if (!data || data.length === 0) return [];

  const grouped = groupBy(data, (r) => getWeekLabel(r.Fecha_inicio_credito));
  const result: {
    semana: string; promedioTotal: number; promedioFISA: number; promedioAEF: number; volumen: number;
  }[] = [];

  grouped.forEach((records, semana) => {
    const allTimes = records.map((r) => secondsToDays(r.Tiempo_funnel_segundos_netos));
    const promedioTotal = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;

    const fisaRecords = records.filter((r) => r.Empresa === 'FISA');
    const aefRecords = records.filter((r) => r.Empresa === 'AEF');

    const promedioFISA =
      fisaRecords.length > 0
        ? fisaRecords.reduce((a, r) => a + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
          fisaRecords.length
        : 0;

    const promedioAEF =
      aefRecords.length > 0
        ? aefRecords.reduce((a, r) => a + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
          aefRecords.length
        : 0;

    result.push({
      semana,
      promedioTotal,
      promedioFISA,
      promedioAEF,
      volumen: records.length,
    });
  });

  // Ordenar cronologicamente por la etiqueta de semana
  result.sort((a, b) => a.semana.localeCompare(b.semana));
  return result;
}

// --- Cuellos de botella (tareas mas tardadas) ---

export function buildBottleneckData(data: FunnelRecord[], top: number = 10): {
  tarea: string; frecuencia: number; tiempoPromedioDias: number;
}[] {
  if (!data || data.length === 0) return [];

  const grouped = groupBy(data, (r) => r.Tarea_mas_tardada);
  const result: { tarea: string; frecuencia: number; tiempoPromedioDias: number }[] = [];

  grouped.forEach((records, tarea) => {
    if (!tarea) return; // Ignorar registros sin tarea

    const avgDays =
      records.reduce((a, r) => a + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
      records.length;

    result.push({
      tarea,
      frecuencia: records.length,
      tiempoPromedioDias: avgDays,
    });
  });

  // Ordenar por frecuencia descendente y tomar top N
  result.sort((a, b) => b.frecuencia - a.frecuencia);
  return result.slice(0, top);
}

// --- Desglose por empresa (donut) ---

export function buildEmpresaData(data: FunnelRecord[]): {
  empresa: string; cantidad: number; promedioDias: number; porcentaje: number;
}[] {
  if (!data || data.length === 0) return [];

  const total = data.length;
  const grouped = groupBy(data, (r) => r.Empresa);
  const result: { empresa: string; cantidad: number; promedioDias: number; porcentaje: number }[] = [];

  grouped.forEach((records, empresa) => {
    const avgDays =
      records.reduce((a, r) => a + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
      records.length;

    result.push({
      empresa,
      cantidad: records.length,
      promedioDias: avgDays,
      porcentaje: (records.length / total) * 100,
    });
  });

  return result;
}

// --- Desglose por canal FrontEnd ---

export function buildFrontEndData(data: FunnelRecord[]): {
  canal: string; cantidad: number; promedioDias: number;
}[] {
  if (!data || data.length === 0) return [];

  const grouped = groupBy(data, (r) => r.FrontEnd);
  const result: { canal: string; cantidad: number; promedioDias: number }[] = [];

  grouped.forEach((records, canal) => {
    const avgDays =
      records.reduce((a, r) => a + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
      records.length;

    result.push({
      canal,
      cantidad: records.length,
      promedioDias: avgDays,
    });
  });

  // Ordenar por cantidad descendente
  result.sort((a, b) => b.cantidad - a.cantidad);
  return result;
}

// --- Top sucursales ---

export function buildSucursalData(data: FunnelRecord[], top: number = 20): {
  sucursal: number; cantidad: number; promedioDias: number; empresaPrincipal: string;
}[] {
  if (!data || data.length === 0) return [];

  const grouped = groupBy(data, (r) => String(r.Sucursal));
  const result: { sucursal: number; cantidad: number; promedioDias: number; empresaPrincipal: string }[] = [];

  grouped.forEach((records, sucursalKey) => {
    const avgDays =
      records.reduce((a, r) => a + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
      records.length;

    // Encontrar la empresa mas frecuente en esta sucursal
    const empresaCount = new Map<string, number>();
    for (const r of records) {
      empresaCount.set(r.Empresa, (empresaCount.get(r.Empresa) || 0) + 1);
    }
    let empresaPrincipal = '';
    let maxCount = 0;
    empresaCount.forEach((count, empresa) => {
      if (count > maxCount) {
        maxCount = count;
        empresaPrincipal = empresa;
      }
    });

    result.push({
      sucursal: parseInt(sucursalKey, 10),
      cantidad: records.length,
      promedioDias: avgDays,
      empresaPrincipal,
    });
  });

  // Ordenar por cantidad descendente y tomar top N
  result.sort((a, b) => b.cantidad - a.cantidad);
  return result.slice(0, top);
}
