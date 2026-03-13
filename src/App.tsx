import { useRef, useCallback } from 'react'
import { DashboardProvider, useDashboard } from './context/DashboardContext'
import CsvUploader from './components/upload/CsvUploader'
import Header from './components/layout/Header'
import FilterBar from './components/layout/FilterBar'
import DashboardGrid from './components/layout/DashboardGrid'
import VoiceIndicator from './components/voice/VoiceIndicator'
import { useVoiceCommand } from './hooks/useVoiceCommand'

function AppContent() {
  const { state, loadCsvData, loadFromUrl, setFilter, clearFilters } = useDashboard()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleVoiceCommand = useCallback(
    (transcript: string) => {
      const text = transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

      // "limpiar filtros" / "quitar filtros" / "borrar filtros"
      if (/limpiar|quitar|borrar|resetear/.test(text) && /filtro/.test(text)) {
        clearFilters()
        return
      }

      // Buscar coincidencia en opciones disponibles
      const { availableOptions } = state
      const tryMatch = (options: string[], filterKey: 'empresas' | 'productos' | 'frontEnds') => {
        for (const option of options) {
          const normalized = option.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          if (text.includes(normalized)) {
            setFilter(filterKey, [option])
            return true
          }
        }
        return false
      }

      if (tryMatch(availableOptions.empresas, 'empresas')) return
      if (tryMatch(availableOptions.productos, 'productos')) return
      if (tryMatch(availableOptions.frontEnds, 'frontEnds')) return
    },
    [state, setFilter, clearFilters]
  )

  const voice = useVoiceCommand({
    onCommand: handleVoiceCommand,
    enabled: state.rawData.length > 0,
  })

  const handleFileSelect = useCallback(
    (file: File) => {
      loadCsvData(file)
    },
    [loadCsvData]
  )

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleUrlSubmit = useCallback(
    (url: string) => {
      loadFromUrl(url)
    },
    [loadFromUrl]
  )

  const handleHiddenFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFileSelect(files[0])
        e.target.value = ''
      }
    },
    [handleFileSelect]
  )

  const hasData = state.rawData.length > 0

  if (!hasData) {
    return (
      <CsvUploader
        onFileSelect={handleFileSelect}
        onUrlSubmit={handleUrlSubmit}
        isLoading={state.isLoading}
        error={state.error}
      />
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleHiddenFileChange}
        className="hidden"
      />
      <Header
        recordCount={state.filteredData.length}
        onUploadClick={handleUploadClick}
      />
      <FilterBar />
      <DashboardGrid data={state.filteredData} />
      <VoiceIndicator voice={voice} />
    </div>
  )
}

export default function App() {
  return (
    <DashboardProvider>
      <AppContent />
    </DashboardProvider>
  )
}
