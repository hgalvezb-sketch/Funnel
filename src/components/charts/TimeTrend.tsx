import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from './ChartCard'
import { buildTrendData } from '../../utils/chartDataBuilders'
import { CHART_COLORS } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface TimeTrendProps {
  data: FunnelRecord[]
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-slate-200">{label}</p>
      <div className="space-y-1 text-sm">
        {payload.map((entry: any) => (
          <p key={entry.name} className="text-slate-300">
            {entry.name}:{' '}
            <span className="font-medium" style={{ color: entry.color }}>
              {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
              {entry.name !== 'Volumen' ? ' dias' : ''}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

export default function TimeTrend({ data }: TimeTrendProps) {
  const chartData = useMemo(() => buildTrendData(data), [data])

  return (
    <ChartCard
      title="Tendencia Temporal"
      subtitle="Promedio semanal y volumen de solicitudes"
    >
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="semana"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            angle={-30}
            textAnchor="end"
            height={50}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            label={{
              value: 'Dias',
              angle: -90,
              position: 'insideLeft',
              fill: '#64748b',
              fontSize: 12,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            label={{
              value: 'Volumen',
              angle: 90,
              position: 'insideRight',
              fill: '#64748b',
              fontSize: 12,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: 10 }}
            formatter={(value) => <span className="text-sm text-slate-300">{value}</span>}
          />
          <Bar
            yAxisId="right"
            dataKey="volumen"
            name="Volumen"
            fill={CHART_COLORS.primary}
            opacity={0.25}
            radius={[2, 2, 0, 0]}
            maxBarSize={30}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="promedioTotal"
            name="Promedio Total"
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="promedioFISA"
            name="Promedio FISA"
            stroke={CHART_COLORS.fisa}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="promedioAEF"
            name="Promedio AEF"
            stroke={CHART_COLORS.aef}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
