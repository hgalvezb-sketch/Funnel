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
import { buildProductAvgData } from '../../utils/chartDataBuilders'
import { CHART_PALETTE } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface AvgTimeByProductProps {
  data: FunnelRecord[]
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-slate-200">{d.producto}</p>
      <div className="space-y-1 text-sm">
        <p className="text-slate-300">
          Promedio: <span className="font-medium text-accent-blue">{d.promedio.toFixed(1)} dias</span>
        </p>
        <p className="text-slate-300">
          Mediana: <span className="font-medium text-accent-purple">{d.mediana.toFixed(1)} dias</span>
        </p>
        <p className="text-slate-300">
          Cantidad: <span className="font-medium text-slate-100">{d.cantidad.toLocaleString('es-MX')}</span>
        </p>
      </div>
    </div>
  )
}

export default function AvgTimeByProduct({ data }: AvgTimeByProductProps) {
  const chartData = useMemo(() => buildProductAvgData(data), [data])

  return (
    <ChartCard title="Tiempo Promedio por Producto" subtitle="Ordenado por promedio descendente">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="producto"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={80}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            label={{
              value: 'Dias',
              angle: -90,
              position: 'insideLeft',
              fill: '#64748b',
              fontSize: 12,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="promedio" radius={[4, 4, 0, 0]} maxBarSize={50}>
            {chartData.map((_entry, index) => (
              <Cell key={index} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
