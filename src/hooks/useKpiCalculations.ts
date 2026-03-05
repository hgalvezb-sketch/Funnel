// Hook para calcular KPIs principales del dashboard

import { useMemo } from 'react';
import { FunnelRecord, KpiData } from '../types/funnel';
import { secondsToDays } from '../utils/timeFormatters';
import { percentile } from '../utils/dataProcessing';

/**
 * Calcula los KPIs principales a partir de los registros filtrados.
 * Todos los tiempos se convierten de segundos a dias.
 */
export function useKpiCalculations(data: FunnelRecord[]): KpiData {
  return useMemo(() => {
    if (!data || data.length === 0) {
      return {
        totalRecords: 0,
        avgTimeDays: 0,
        medianTimeDays: 0,
        minTimeDays: 0,
        maxTimeDays: 0,
        p90TimeDays: 0,
        avgTimeFISA: 0,
        avgTimeAEF: 0,
      };
    }

    // Convertir todos los tiempos a dias
    const timesInDays = data.map((r) => secondsToDays(r.Tiempo_funnel_segundos_netos));

    // Totales
    const totalRecords = data.length;
    const sum = timesInDays.reduce((acc, val) => acc + val, 0);
    const avgTimeDays = sum / totalRecords;

    // Percentiles y extremos
    const medianTimeDays = percentile(timesInDays, 50);
    const sorted = [...timesInDays].sort((a, b) => a - b);
    const minTimeDays = sorted[0];
    const maxTimeDays = sorted[sorted.length - 1];
    const p90TimeDays = percentile(timesInDays, 90);

    // Promedios por empresa
    const fisaRecords = data.filter((r) => r.Empresa === 'FISA');
    const aefRecords = data.filter((r) => r.Empresa === 'AEF');

    const avgTimeFISA =
      fisaRecords.length > 0
        ? fisaRecords.reduce((acc, r) => acc + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
          fisaRecords.length
        : 0;

    const avgTimeAEF =
      aefRecords.length > 0
        ? aefRecords.reduce((acc, r) => acc + secondsToDays(r.Tiempo_funnel_segundos_netos), 0) /
          aefRecords.length
        : 0;

    return {
      totalRecords,
      avgTimeDays,
      medianTimeDays,
      minTimeDays,
      maxTimeDays,
      p90TimeDays,
      avgTimeFISA,
      avgTimeAEF,
    };
  }, [data]);
}
