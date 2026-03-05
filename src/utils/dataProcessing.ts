// Utilidades para procesamiento y transformacion de datos CSV del funnel

import { FunnelRecord, AvailableOptions } from '../types/funnel';

/**
 * Limpia un valor numerico: elimina comas de separador de miles, comillas, y parsea a entero.
 * Ejemplo: "7,264,355" -> 7264355
 */
export function cleanNumber(val: string): number {
  if (val == null || val === '') return NaN;
  const cleaned = String(val).replace(/[",\s]/g, '');
  const num = parseInt(cleaned, 10);
  return num;
}

/**
 * Parsea una fecha con formato "YYYY-MM-DD H:MM:SS" o "YYYY-MM-DD HH:MM:SS"
 * Maneja horas de un solo digito (ej. "9:44:08")
 */
export function parseDate(val: string): Date {
  if (!val || typeof val !== 'string') return new Date(NaN);

  const trimmed = val.trim();

  // Intentar separar fecha y hora
  const parts = trimmed.split(' ');
  if (parts.length !== 2) return new Date(NaN);

  const [datePart, timePart] = parts;
  const datePieces = datePart.split('-');
  const timePieces = timePart.split(':');

  if (datePieces.length !== 3 || timePieces.length !== 3) return new Date(NaN);

  const year = parseInt(datePieces[0], 10);
  const month = parseInt(datePieces[1], 10) - 1; // Meses base 0 en JS
  const day = parseInt(datePieces[2], 10);
  const hours = parseInt(timePieces[0], 10);
  const minutes = parseInt(timePieces[1], 10);
  const seconds = parseInt(timePieces[2], 10);

  return new Date(year, month, day, hours, minutes, seconds);
}

/**
 * Transforma una fila cruda del CSV a un FunnelRecord tipado.
 * Retorna null si la fila tiene datos invalidos o campos criticos faltantes.
 */
export function parseCsvRow(row: Record<string, string>): FunnelRecord | null {
  try {
    const id = row['_id'];
    if (!id || !id.trim()) return null;

    const sucursal = parseInt(row['Sucursal'], 10);
    if (!Number.isFinite(sucursal)) return null;

    const fechaInicio = parseDate(row['Fecha_inicio_credito']);
    const fechaDispersion = parseDate(row['Fecha_dispersion']);
    if (isNaN(fechaInicio.getTime()) || isNaN(fechaDispersion.getTime())) return null;

    const tiempoSegundos = cleanNumber(row['Tiempo_funnel_segundos_netos']);
    if (!Number.isFinite(tiempoSegundos) || tiempoSegundos < 0) return null;

    return {
      _id: id.trim(),
      Estatus_solicitud: (row['Estatus_solicitud'] || '').trim(),
      Sucursal: sucursal,
      Empresa: (row['Empresa'] || '').trim(),
      codigo_producto: (row['codigo_producto'] || '').trim(),
      Broker: (row['Broker'] || '').trim(),
      FrontEnd: (row['FrontEnd'] || '').trim(),
      Fecha_inicio_credito: fechaInicio,
      Fecha_dispersion: fechaDispersion,
      Tiempo_funnel_segundos_netos: tiempoSegundos,
      Dias_horas_transcurridos: (row['Dias_horas_transcurridos'] || '').trim(),
      Tiempo_total_funnel_formato: (row['Tiempo_total_funnel_formato'] || '').trim(),
      Tarea_mas_tardada: (row['Tarea_mas_tardada'] || '').trim(),
      Tiempo_tarea_mas_tardada_formato: (row['Tiempo_tarea_mas_tardada_formato'] || '').trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Extrae las opciones unicas disponibles para los filtros del dashboard
 */
export function extractAvailableOptions(data: FunnelRecord[]): AvailableOptions {
  if (!data || data.length === 0) {
    return {
      empresas: [],
      productos: [],
      frontEnds: [],
      tareas: [],
      sucursales: [],
      dateRange: { min: new Date(), max: new Date() },
    };
  }

  const empresasSet = new Set<string>();
  const productosSet = new Set<string>();
  const frontEndsSet = new Set<string>();
  const tareasSet = new Set<string>();
  const sucursalesSet = new Set<number>();
  let minDate = data[0].Fecha_inicio_credito;
  let maxDate = data[0].Fecha_inicio_credito;

  for (const record of data) {
    if (record.Empresa) empresasSet.add(record.Empresa);
    if (record.codigo_producto) productosSet.add(record.codigo_producto);
    if (record.FrontEnd) frontEndsSet.add(record.FrontEnd);
    if (record.Tarea_mas_tardada) tareasSet.add(record.Tarea_mas_tardada);
    sucursalesSet.add(record.Sucursal);

    if (record.Fecha_inicio_credito < minDate) minDate = record.Fecha_inicio_credito;
    if (record.Fecha_inicio_credito > maxDate) maxDate = record.Fecha_inicio_credito;
  }

  return {
    empresas: Array.from(empresasSet).sort(),
    productos: Array.from(productosSet).sort(),
    frontEnds: Array.from(frontEndsSet).sort(),
    tareas: Array.from(tareasSet).sort(),
    sucursales: Array.from(sucursalesSet).sort((a, b) => a - b),
    dateRange: { min: minDate, max: maxDate },
  };
}

/**
 * Calcula el percentil p (0-100) de un arreglo de numeros.
 * Usa interpolacion lineal para valores intermedios.
 */
export function percentile(arr: number[], p: number): number {
  if (!arr || arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];

  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

/**
 * Agrupa un arreglo por una clave derivada de cada elemento
 */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const item of arr) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return map;
}

/**
 * Retorna la etiqueta de semana para una fecha, basada en el lunes de esa semana.
 * Formato: "Sem YYYY-MM-DD" donde la fecha es el lunes.
 */
export function getWeekLabel(date: Date): string {
  if (!date || isNaN(date.getTime())) return 'Sem desconocida';

  const d = new Date(date);
  const dayOfWeek = d.getDay();
  // Ajustar al lunes: domingo (0) -> -6, lunes (1) -> 0, martes (2) -> -1, etc.
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `Sem ${year}-${month}-${day}`;
}
