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
import { buildHistogramData } from '../../utils/chartDataBuilders'
import type { FunnelRecord } from '../../types/funnel'

interface FunnelDistributionProps {
  data: FunnelRecord[]
}

const BIN_COLORS = [
  '#6b7280', // < 12h - gris claro
  '#5f6672', // 12h-1d
  '#535964', // 1-2d
  '#484d57', // 2-3d
  '#3d424b', // 3-5d
  '#33373f', // 5-7d
  '#2a2d34', // 1-2 sem
  '#22252b', // 2-3 sem
  '#1c1e23', // 3-4 sem
  '#16181c', // 1-1.5 mes
  '#111316', // 1.5-2 mes
  '#0c0d0f', // > 2 meses - gris más oscuro
]

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-neutral-200">{d.rango}</p>
      <div className="space-y-1 text-sm">
        <p className="text-neutral-300">
          Cantidad: <span className="font-medium text-neutral-100">{d.cantidad.toLocaleString('es-MX')}</span>
        </p>
        <p className="text-neutral-300">
          Porcentaje: <span className="font-medium text-accent-blue">{d.porcentaje.toFixed(1)}%</span>
        </p>
      </div>
    </div>
  )
}

export default function FunnelDistribution({ data }: FunnelDistributionProps) {
  const chartData = useMemo(() => buildHistogramData(data), [data])

  return (
    <ChartCard
      title="Distribucion de Tiempos"
      subtitle="Histograma de duracion de solicitudes"
    >
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
          <XAxis
            dataKey="rango"
            tick={{ fill: '#8e8e93', fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="cantidad" radius={[4, 4, 0, 0]} maxBarSize={50}>
            {chartData.map((_entry, index) => (
              <Cell key={index} fill={BIN_COLORS[index % BIN_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
