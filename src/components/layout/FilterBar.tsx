import { FilterX } from 'lucide-react'
import MultiSelect from '../filters/MultiSelect'
import DateRangePicker from '../filters/DateRangePicker'
import { useDashboard } from '../../context/DashboardContext'

export default function FilterBar() {
  const { state, setFilter, clearFilters } = useDashboard()
  const { filters, availableOptions } = state

  const hasActiveFilters =
    filters.empresas.length > 0 ||
    filters.productos.length > 0 ||
    filters.frontEnds.length > 0 ||
    filters.dateRange.start !== null ||
    filters.dateRange.end !== null

  return (
    <div className="border-b border-card-border bg-card px-6 py-3">
      <div className="flex flex-wrap items-end gap-4">
        <MultiSelect
          label="Empresa"
          options={availableOptions.empresas}
          selected={filters.empresas}
          onChange={(val) => setFilter('empresas', val)}
        />
        <MultiSelect
          label="Producto"
          options={availableOptions.productos}
          selected={filters.productos}
          onChange={(val) => setFilter('productos', val)}
        />
        <MultiSelect
          label="FrontEnd"
          options={availableOptions.frontEnds}
          selected={filters.frontEnds}
          onChange={(val) => setFilter('frontEnds', val)}
        />
        <DateRangePicker
          startDate={filters.dateRange.start}
          endDate={filters.dateRange.end}
          onStartChange={(date) =>
            setFilter('dateRange', { ...filters.dateRange, start: date })
          }
          onEndChange={(date) =>
            setFilter('dateRange', { ...filters.dateRange, end: date })
          }
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-600 px-3 py-2 text-sm text-neutral-400 transition-colors hover:border-accent-red/50 hover:text-accent-red"
          >
            <FilterX className="h-4 w-4" />
            Limpiar Filtros
          </button>
        )}
      </div>
    </div>
  )
}
