// Hook para filtrar datos del funnel segun los filtros activos del dashboard

import { useMemo } from 'react';
import { FunnelRecord, DashboardFilters } from '../types/funnel';

/**
 * Filtra los registros del funnel basandose en los filtros activos.
 * Todos los filtros se aplican con logica AND.
 */
export function useFilteredData(
  data: FunnelRecord[],
  filters: DashboardFilters
): FunnelRecord[] {
  return useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.filter((record) => {
      // Filtro por empresas
      if (filters.empresas.length > 0 && !filters.empresas.includes(record.Empresa)) {
        return false;
      }

      // Filtro por productos
      if (filters.productos.length > 0 && !filters.productos.includes(record.codigo_producto)) {
        return false;
      }

      // Filtro por canales (FrontEnd)
      if (filters.frontEnds.length > 0 && !filters.frontEnds.includes(record.FrontEnd)) {
        return false;
      }

      // Filtro por rango de fecha de inicio de credito
      if (filters.dateRange.start && record.Fecha_inicio_credito < filters.dateRange.start) {
        return false;
      }

      if (filters.dateRange.end && record.Fecha_inicio_credito > filters.dateRange.end) {
        return false;
      }

      return true;
    });
  }, [data, filters]);
}
