import { useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from './ChartCard'
import { buildFrontEndData } from '../../utils/chartDataBuilders'
import { CHART_COLORS } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface FrontEndBreakdownProps {
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
              {typeof entry.value === 'number'
                ? entry.name === 'Cantidad'
                  ? entry.value.toLocaleString('es-MX')
                  : entry.value.toFixed(1) + ' dias'
                : entry.value}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

export default function FrontEndBreakdown({ data }: FrontEndBreakdownProps) {
  const chartData = useMemo(() => buildFrontEndData(data), [data])

  return (
    <ChartCard title="Desglose por FrontEnd / Canal" subtitle="Volumen y tiempo promedio por canal">
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="canal"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            label={{
              value: 'Cantidad',
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
              value: 'Dias',
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
            yAxisId="left"
            dataKey="cantidad"
            name="Cantidad"
            fill={CHART_COLORS.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={50}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="promedioDias"
            name="Promedio (dias)"
            stroke={CHART_COLORS.fisa}
            strokeWidth={2}
            dot={{ r: 4, fill: CHART_COLORS.fisa }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
