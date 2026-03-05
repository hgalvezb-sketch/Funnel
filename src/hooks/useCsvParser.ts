// Hook para parseo de archivos CSV con PapaParse

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { FunnelRecord } from '../types/funnel';
import { parseCsvRow } from '../utils/dataProcessing';

// Cabeceras requeridas en el CSV
const REQUIRED_HEADERS = [
  '_id',
  'Estatus_solicitud',
  'Sucursal',
  'Empresa',
  'codigo_producto',
  'Broker',
  'FrontEnd',
  'Fecha_inicio_credito',
  'Fecha_dispersion',
  'Tiempo_funnel_segundos_netos',
  'Dias_horas_transcurridos',
  'Tiempo_total_funnel_formato',
  'Tarea_mas_tardada',
  'Tiempo_tarea_mas_tardada_formato',
];

interface UseCsvParserResult {
  parseFile: (file: File) => Promise<FunnelRecord[]>;
  isLoading: boolean;
  error: string | null;
}

export function useCsvParser(): UseCsvParserResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseFile = useCallback((file: File): Promise<FunnelRecord[]> => {
    return new Promise((resolve, reject) => {
      setIsLoading(true);
      setError(null);

      Papa.parse<Record<string, string>>(file, {
        header: true,
        dynamicTyping: false, // Critico: mantener como string para manejar comas en numeros
        skipEmptyLines: true,
        complete: (results) => {
          try {
            // Validar que existan las cabeceras requeridas
            const headers = results.meta.fields || [];
            const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));

            if (missingHeaders.length > 0) {
              const errorMsg = `Cabeceras faltantes en el CSV: ${missingHeaders.join(', ')}`;
              setError(errorMsg);
              setIsLoading(false);
              reject(new Error(errorMsg));
              return;
            }

            // Parsear cada fila y filtrar las invalidas
            const records: FunnelRecord[] = [];
            let invalidCount = 0;

            for (const row of results.data) {
              const parsed = parseCsvRow(row);
              if (parsed) {
                records.push(parsed);
              } else {
                invalidCount++;
              }
            }

            console.log(
              `[useCsvParser] Parseo completo: ${records.length} registros validos, ${invalidCount} invalidos de ${results.data.length} filas totales`
            );

            if (records.length === 0) {
              const errorMsg = 'No se encontraron registros validos en el CSV';
              setError(errorMsg);
              setIsLoading(false);
              reject(new Error(errorMsg));
              return;
            }

            setIsLoading(false);
            resolve(records);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Error desconocido al procesar CSV';
            setError(errorMsg);
            setIsLoading(false);
            reject(new Error(errorMsg));
          }
        },
        error: (err) => {
          const errorMsg = `Error al leer CSV: ${err.message}`;
          setError(errorMsg);
          setIsLoading(false);
          reject(new Error(errorMsg));
        },
      });
    });
  }, []);

  return { parseFile, isLoading, error };
}
