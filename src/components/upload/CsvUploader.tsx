import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react'

interface CsvUploaderProps {
  onFileSelect: (file: File) => void
  isLoading: boolean
  error: string | null
}

export default function CsvUploader({ onFileSelect, isLoading, error }: CsvUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (files.length > 0 && files[0].name.endsWith('.csv')) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect]
  )

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-8">
      <div className="w-full max-w-xl animate-fade-in">
        <div className="mb-8 text-center">
          <FileSpreadsheet className="mx-auto mb-4 h-16 w-16 text-accent-blue" />
          <h1 className="mb-2 text-3xl font-bold text-neutral-50">
            Dashboard Funnel de Originacion
          </h1>
          <p className="text-neutral-400">
            Carga un archivo CSV con los datos del funnel para comenzar
          </p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          className={`
            cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200
            ${
              isDragOver
                ? 'border-accent-blue bg-accent-blue/10 scale-[1.02]'
                : 'border-neutral-600 bg-card hover:border-accent-blue/50 hover:bg-card-hover'
            }
            ${isLoading ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-accent-blue" />
              <p className="text-lg font-medium text-neutral-300">Procesando archivo...</p>
              <p className="text-sm text-neutral-500">Esto puede tomar unos segundos</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Upload
                className={`h-12 w-12 ${isDragOver ? 'text-accent-blue' : 'text-neutral-500'}`}
              />
              <div>
                <p className="text-lg font-medium text-neutral-300">
                  Arrastra tu archivo CSV aqui
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  o haz clic para seleccionar un archivo
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-red" />
            <div>
              <p className="font-medium text-accent-red">Error al procesar el archivo</p>
              <p className="mt-1 text-sm text-accent-red-light">{error}</p>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-neutral-600">
          Formato esperado: CSV con columnas de solicitudes del funnel de originacion
        </p>
      </div>
    </div>
  )
}
