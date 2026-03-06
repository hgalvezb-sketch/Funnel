// Contexto global del dashboard con useReducer para manejo de estado

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { FunnelRecord, DashboardFilters, AvailableOptions } from '../types/funnel';
import { extractAvailableOptions } from '../utils/dataProcessing';
import { useCsvParser } from '../hooks/useCsvParser';
import { useFilteredData } from '../hooks/useFilteredData';

// --- Estado ---

interface DashboardState {
  rawData: FunnelRecord[];
  filteredData: FunnelRecord[];
  filters: DashboardFilters;
  isLoading: boolean;
  error: string | null;
  availableOptions: AvailableOptions;
}

const initialFilters: DashboardFilters = {
  empresas: [],
  productos: [],
  frontEnds: [],
  dateRange: { start: null, end: null },
};

const initialOptions: AvailableOptions = {
  empresas: [],
  productos: [],
  frontEnds: [],
  tareas: [],
  sucursales: [],
  dateRange: { min: new Date(), max: new Date() },
};

const initialState: DashboardState = {
  rawData: [],
  filteredData: [],
  filters: initialFilters,
  isLoading: false,
  error: null,
  availableOptions: initialOptions,
};

// --- Acciones ---

type DashboardAction =
  | { type: 'SET_DATA'; payload: { data: FunnelRecord[]; options: AvailableOptions } }
  | { type: 'SET_FILTERS'; payload: Partial<DashboardFilters> }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_FILTERED_DATA'; payload: FunnelRecord[] };

// --- Reducer ---

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'SET_DATA':
      return {
        ...state,
        rawData: action.payload.data,
        filteredData: action.payload.data, // Sin filtros inicialmente, todos los datos
        availableOptions: action.payload.options,
        filters: initialFilters,
        isLoading: false,
        error: null,
      };

    case 'SET_FILTERS':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
      };

    case 'CLEAR_FILTERS':
      return {
        ...state,
        filters: initialFilters,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_FILTERED_DATA':
      return {
        ...state,
        filteredData: action.payload,
      };

    default:
      return state;
  }
}

// --- Contexto ---

interface DashboardContextValue {
  state: DashboardState;
  dispatch: React.Dispatch<DashboardAction>;
  loadCsvData: (file: File) => Promise<void>;
  loadFromUrl: (url: string) => Promise<void>;
  setFilter: (filterKey: keyof DashboardFilters, value: DashboardFilters[keyof DashboardFilters]) => void;
  clearFilters: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

// --- Provider ---

interface DashboardProviderProps {
  children: ReactNode;
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const { parseFile } = useCsvParser();

  // Recalcular datos filtrados cada vez que cambian rawData o filters
  const filteredData = useFilteredData(state.rawData, state.filters);

  // Sincronizar filteredData con el estado cuando cambie
  // Usamos un valor derivado en lugar de useEffect para evitar renders extra
  const currentState: DashboardState = {
    ...state,
    filteredData: state.rawData.length > 0 ? filteredData : state.filteredData,
  };

  // Cargar datos desde un archivo CSV
  const loadCsvData = useCallback(
    async (file: File): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const records = await parseFile(file);
        const options = extractAvailableOptions(records);
        dispatch({ type: 'SET_DATA', payload: { data: records, options } });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido al cargar CSV';
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    },
    [parseFile]
  );

  // Extraer ID de archivo desde URL de Google Drive/Sheets
  const extractGoogleId = (url: string): { id: string; type: 'sheets' | 'drive' } | null => {
    // Google Sheets: https://docs.google.com/spreadsheets/d/{ID}/...
    const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (sheetsMatch) return { id: sheetsMatch[1], type: 'sheets' }

    // Google Drive file: https://drive.google.com/file/d/{ID}/...
    const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
    if (driveFileMatch) return { id: driveFileMatch[1], type: 'drive' }

    // Google Drive open: https://drive.google.com/open?id={ID}
    const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/)
    if (driveOpenMatch) return { id: driveOpenMatch[1], type: 'drive' }

    // Google Drive uc: https://drive.google.com/uc?id={ID}
    const driveUcMatch = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/)
    if (driveUcMatch) return { id: driveUcMatch[1], type: 'drive' }

    return null
  }

  // Cargar datos desde una URL de Google Drive/Sheets
  const loadFromUrl = useCallback(
    async (url: string): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null })

      try {
        const extracted = extractGoogleId(url.trim())
        if (!extracted) {
          throw new Error(
            'URL no válida. Usa un enlace de Google Sheets o Google Drive. ' +
            'Ejemplo: https://docs.google.com/spreadsheets/d/.../edit'
          )
        }

        const googleUrl =
          extracted.type === 'sheets'
            ? `https://docs.google.com/spreadsheets/d/${extracted.id}/export?format=csv`
            : `https://drive.google.com/uc?export=download&id=${extracted.id}`

        // Intentar fetch directo primero, si falla por CORS usar proxy
        let response: Response
        try {
          response = await fetch(googleUrl)
        } catch {
          // CORS bloqueado — usar proxy
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`
          response = await fetch(proxyUrl)
        }

        if (!response.ok) {
          throw new Error(
            `No se pudo descargar el archivo (HTTP ${response.status}). ` +
            'Verifica que el archivo sea público o esté compartido con "Cualquiera con el enlace".'
          )
        }

        const blob = await response.blob()
        const file = new File([blob], 'google-drive-data.csv', { type: 'text/csv' })
        const records = await parseFile(file)
        const options = extractAvailableOptions(records)
        dispatch({ type: 'SET_DATA', payload: { data: records, options } })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido al cargar desde URL'
        dispatch({ type: 'SET_ERROR', payload: message })
      }
    },
    [parseFile]
  )

  // Actualizar un filtro individual
  const setFilter = useCallback(
    (filterKey: keyof DashboardFilters, value: DashboardFilters[keyof DashboardFilters]) => {
      dispatch({
        type: 'SET_FILTERS',
        payload: { [filterKey]: value } as Partial<DashboardFilters>,
      });
    },
    []
  );

  // Limpiar todos los filtros
  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_FILTERS' });
  }, []);

  const contextValue: DashboardContextValue = {
    state: currentState,
    dispatch,
    loadCsvData,
    loadFromUrl,
    setFilter,
    clearFilters,
  };

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
}

// --- Hook de acceso ---

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard debe usarse dentro de un DashboardProvider');
  }
  return context;
}
