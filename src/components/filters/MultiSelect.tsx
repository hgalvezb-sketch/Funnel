import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const selectAll = () => onChange([...options])
  const clearAll = () => onChange([])

  const displayText =
    selected.length === 0
      ? `Todos`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} seleccionados`

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full min-w-[160px] items-center justify-between gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500"
      >
        <span className="truncate">{displayText}</span>
        <div className="flex items-center gap-1">
          {selected.length > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-blue px-1.5 text-xs font-medium text-white">
              {selected.length}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-lg border border-slate-600 bg-slate-800 py-1 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <button
              onClick={selectAll}
              className="text-xs font-medium text-accent-blue hover:text-accent-blue-light"
            >
              Seleccionar todo
            </button>
            <button
              onClick={clearAll}
              className="text-xs font-medium text-slate-400 hover:text-slate-300"
            >
              Limpiar
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selected.includes(option)
              return (
                <button
                  key={option}
                  onClick={() => toggleOption(option)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-slate-700"
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? 'border-accent-blue bg-accent-blue'
                        : 'border-slate-500 bg-slate-700'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className={isSelected ? 'text-slate-200' : 'text-slate-400'}>
                    {option}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
