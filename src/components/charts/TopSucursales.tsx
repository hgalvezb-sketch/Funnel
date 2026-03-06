import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import ChartCard from './ChartCard'
import { buildSucursalData } from '../../utils/chartDataBuilders'
import { CHART_COLORS } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface TopSucursalesProps {
  data: FunnelRecord[]
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-neutral-200">Sucursal {d.sucursal}</p>
      <div className="space-y-1 text-sm">
        <p className="text-neutral-300">
          Cantidad: <span className="font-medium text-neutral-100">{d.cantidad.toLocaleString('es-MX')}</span>
        </p>
        <p className="text-neutral-300">
          Tiempo promedio: <span className="font-medium text-accent-blue">{d.promedioDias.toFixed(1)} dias</span>
        </p>
        <p className="text-neutral-300">
          Empresa principal:{' '}
          <span
            className="font-medium"
            style={{
              color:
                d.empresaPrincipal.toUpperCase() === 'FISA'
                  ? CHART_COLORS.fisa
                  : CHART_COLORS.aef,
            }}
          >
            {d.empresaPrincipal}
          </span>
        </p>
      </div>
    </div>
  )
}

export default function TopSucursales({ data }: TopSucursalesProps) {
  const chartData = useMemo(() => buildSucursalData(data, 20), [data])

  const formattedData = useMemo(
    () => chartData.map((d) => ({ ...d, label: `Suc. ${d.sucursal}` })),
    [chartData]
  )

  return (
    <ChartCard
      title="Top 20 Sucursales por Volumen"
      subtitle="Coloreadas por empresa principal"
    >
      <ResponsiveContainer width="100%" height={600}>
        <BarChart
          data={formattedData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 12 }} />
          <YAxis
            dataKey="label"
            type="category"
            width={80}
            tick={{ fill: '#8e8e93', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {formattedData.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.empresaPrincipal.toUpperCase() === 'FISA'
                    ? CHART_COLORS.fisa
                    : CHART_COLORS.aef
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
