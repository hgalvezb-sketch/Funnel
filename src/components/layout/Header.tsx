import { BarChart3, Upload, FileSpreadsheet } from 'lucide-react'

interface HeaderProps {
  recordCount: number
  onUploadClick: () => void
}

export default function Header({ recordCount, onUploadClick }: HeaderProps) {
  return (
    <header className="bg-card border-b border-card-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-accent-blue" />
            <div>
              <h1 className="text-xl font-bold text-slate-50">
                Dashboard Funnel de Originacion
              </h1>
              <p className="text-sm text-slate-400">FINDEP - Financiera Independencia</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {recordCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5">
              <FileSpreadsheet className="h-4 w-4 text-accent-blue" />
              <span className="text-sm text-slate-300">
                {recordCount.toLocaleString('es-MX')} registros
              </span>
            </div>
          )}
          <button
            onClick={onUploadClick}
            className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-blue-light"
          >
            <Upload className="h-4 w-4" />
            Cargar CSV
          </button>
        </div>
      </div>
    </header>
  )
}
