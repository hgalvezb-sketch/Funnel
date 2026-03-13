import { useRef, useCallback, useEffect, useState } from 'react'
import { DashboardProvider, useDashboard } from './context/DashboardContext'
import CsvUploader from './components/upload/CsvUploader'
import Header from './components/layout/Header'
import FilterBar from './components/layout/FilterBar'
import DashboardGrid from './components/layout/DashboardGrid'
import VoiceOverlay from './components/voice/VoiceOverlay'
import { useVoiceRecognition } from './hooks/useVoiceRecognition'
import { processVoiceCommand } from './utils/voiceCommands'

function AppContent() {
  const { state, loadCsvData, loadFromUrl, setFilter, clearFilters } = useDashboard()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lastVoiceMessage, setLastVoiceMessage] = useState<string | null>(null)
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Procesar resultado de voz
  const handleVoiceResult = useCallback(
    (transcript: string) => {
      const result = processVoiceCommand(transcript, state.availableOptions)

      if (result.action === 'clear') {
        clearFilters()
      } else if (result.action === 'filter' && result.filterKey && result.filterValue) {
        setFilter(result.filterKey, result.filterValue)
      }

      setLastVoiceMessage(result.message)
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
      messageTimeoutRef.current = setTimeout(() => setLastVoiceMessage(null), 3000)
    },
    [state.availableOptions, setFilter, clearFilters]
  )

  const voice = useVoiceRecognition({ onResult: handleVoiceResult, lang: 'es-MX' })

  // Activar/desactivar voz con barra espaciadora (solo cuando hay datos)
  useEffect(() => {
    if (!voice.isSupported || state.rawData.length === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el foco está en un input/textarea/select
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        voice.startListening()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        voice.stopListening()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [voice.isSupported, voice.startListening, voice.stopListening, state.rawData.length])

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
    }
  }, [])

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

      {/* Voice overlay */}
      <VoiceOverlay
        isListening={voice.isListening}
        transcript={voice.transcript}
        interimTranscript={voice.interimTranscript}
        error={voice.error}
        lastMessage={lastVoiceMessage}
        isSupported={voice.isSupported}
      />

      {/* Voice hint en el header */}
      {voice.isSupported && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="flex items-center gap-2 rounded-lg bg-card border border-card-border px-3 py-2 shadow-lg opacity-60 hover:opacity-100 transition-opacity">
            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-neutral-800 border border-neutral-600 rounded text-neutral-400">
              Espacio
            </kbd>
            <span className="text-xs text-neutral-500">Voz</span>
          </div>
        </div>
      )}
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
