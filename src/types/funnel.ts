// Tipos principales del dashboard de funnel de originacion FINDEP

export interface FunnelRecord {
  _id: string;
  Estatus_solicitud: string;
  Sucursal: number;
  Empresa: string;
  codigo_producto: string;
  Broker: string;
  FrontEnd: string;
  Fecha_inicio_credito: Date;
  Fecha_dispersion: Date;
  Tiempo_funnel_segundos_netos: number;
  Dias_horas_transcurridos: string;
  Tiempo_total_funnel_formato: string;
  Tarea_mas_tardada: string;
  Tiempo_tarea_mas_tardada_formato: string;
}

export interface DashboardFilters {
  empresas: string[];
  productos: string[];
  frontEnds: string[];
  dateRange: { start: Date | null; end: Date | null };
}

export interface KpiData {
  totalRecords: number;
  avgTimeDays: number;
  medianTimeDays: number;
  minTimeDays: number;
  maxTimeDays: number;
  p90TimeDays: number;
  avgTimeFISA: number;
  avgTimeAEF: number;
}

export interface AvailableOptions {
  empresas: string[];
  productos: string[];
  frontEnds: string[];
  tareas: string[];
  sucursales: number[];
  dateRange: { min: Date; max: Date };
}
