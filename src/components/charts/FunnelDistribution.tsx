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
  '#22c55e', // < 12h - verde
  '#4ade80', // 12h-1d
  '#86efac', // 1-2d
  '#a3e635', // 2-3d
  '#facc15', // 3-5d
  '#fbbf24', // 5-7d
  '#f59e0b', // 1-2 sem
  '#f97316', // 2-3 sem
  '#fb923c', // 3-4 sem
  '#ef4444', // 1-1.5 mes
  '#dc2626', // 1.5-2 mes
  '#b91c1c', // > 2 meses - rojo
]

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-slate-200">{d.rango}</p>
      <div className="space-y-1 text-sm">
        <p className="text-slate-300">
          Cantidad: <span className="font-medium text-slate-100">{d.cantidad.toLocaleString('es-MX')}</span>
        </p>
        <p className="text-slate-300">
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
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="rango"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
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
