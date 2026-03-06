import { useRef, useCallback, useEffect } from 'react'
import { DashboardProvider, useDashboard } from './context/DashboardContext'
import CsvUploader from './components/upload/CsvUploader'
import Header from './components/layout/Header'
import FilterBar from './components/layout/FilterBar'
import DashboardGrid from './components/layout/DashboardGrid'

function AppContent() {
  const { state, loadCsvData } = useDashboard()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(
    (file: File) => {
      loadCsvData(file)
    },
    [loadCsvData]
  )

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

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

  // Cargar datos de muestra automáticamente si existen en public/
  useEffect(() => {
    if (state.rawData.length === 0 && !state.isLoading) {
      fetch(import.meta.env.BASE_URL + 'sample-data.csv')
        .then(res => {
          if (res.ok) return res.blob()
          return null
        })
        .then(blob => {
          if (blob) {
            const file = new File([blob], 'sample-data.csv', { type: 'text/csv' })
            loadCsvData(file)
          }
        })
        .catch(() => { /* No sample data available, show uploader */ })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = state.rawData.length > 0

  if (!hasData) {
    return (
      <CsvUploader
        onFileSelect={handleFileSelect}
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
