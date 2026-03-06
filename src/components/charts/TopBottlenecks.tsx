import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from './ChartCard'
import { buildBottleneckData } from '../../utils/chartDataBuilders'
import { CHART_COLORS } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface TopBottlenecksProps {
  data: FunnelRecord[]
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-neutral-200 max-w-[250px] break-words">{d.tarea}</p>
      <div className="space-y-1 text-sm">
        <p className="text-neutral-300">
          Frecuencia: <span className="font-medium text-fisa">{d.frecuencia.toLocaleString('es-MX')}</span>
        </p>
        <p className="text-neutral-300">
          Tiempo promedio: <span className="font-medium text-accent-blue">{d.tiempoPromedioDias.toFixed(1)} dias</span>
        </p>
      </div>
    </div>
  )
}

export default function TopBottlenecks({ data }: TopBottlenecksProps) {
  const chartData = useMemo(() => buildBottleneckData(data, 10), [data])

  const truncatedData = useMemo(
    () =>
      chartData.map((d) => ({
        ...d,
        tareaCorta: d.tarea.length > 30 ? d.tarea.slice(0, 27) + '...' : d.tarea,
      })),
    [chartData]
  )

  return (
    <ChartCard
      title="Top 10 Cuellos de Botella"
      subtitle="Tareas mas frecuentes como ultimo paso"
    >
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={truncatedData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 12 }} />
          <YAxis
            dataKey="tareaCorta"
            type="category"
            width={160}
            tick={{ fill: '#8e8e93', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: 10 }}
            formatter={(value) => <span className="text-sm text-neutral-300">{value}</span>}
          />
          <Bar
            dataKey="frecuencia"
            name="Frecuencia"
            fill={CHART_COLORS.fisa}
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          />
          <Bar
            dataKey="tiempoPromedioDias"
            name="Tiempo Promedio (dias)"
            fill={CHART_COLORS.primary}
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
