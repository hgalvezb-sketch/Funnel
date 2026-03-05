import { X } from 'lucide-react'

interface DateRangePickerProps {
  startDate: Date | null
  endDate: Date | null
  onStartChange: (date: Date | null) => void
  onEndChange: (date: Date | null) => void
}

function toInputValue(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function fromInputValue(value: string): Date | null {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

export default function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: DateRangePickerProps) {
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Desde</label>
        <div className="relative">
          <input
            type="date"
            value={toInputValue(startDate)}
            onChange={(e) => onStartChange(fromInputValue(e.target.value))}
            className="w-[150px] rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 focus:border-accent-blue focus:outline-none [color-scheme:dark]"
          />
          {startDate && (
            <button
              onClick={() => onStartChange(null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Hasta</label>
        <div className="relative">
          <input
            type="date"
            value={toInputValue(endDate)}
            onChange={(e) => onEndChange(fromInputValue(e.target.value))}
            className="w-[150px] rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 focus:border-accent-blue focus:outline-none [color-scheme:dark]"
          />
          {endDate && (
            <button
              onClick={() => onEndChange(null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
