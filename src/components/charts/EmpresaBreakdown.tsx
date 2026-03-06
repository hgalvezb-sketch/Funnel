import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from './ChartCard'
import { buildEmpresaData } from '../../utils/chartDataBuilders'
import { CHART_COLORS } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface EmpresaBreakdownProps {
  data: FunnelRecord[]
}

const EMPRESA_COLORS: Record<string, string> = {
  FISA: CHART_COLORS.fisa,
  AEF: CHART_COLORS.aef,
}

function getEmpresaColor(empresa: string): string {
  return EMPRESA_COLORS[empresa.toUpperCase()] || CHART_COLORS.secondary
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 shadow-xl">
      <p className="mb-2 font-semibold text-neutral-200">{d.empresa}</p>
      <div className="space-y-1 text-sm">
        <p className="text-neutral-300">
          Cantidad: <span className="font-medium text-neutral-100">{d.cantidad.toLocaleString('es-MX')}</span>
        </p>
        <p className="text-neutral-300">
          Promedio: <span className="font-medium text-accent-blue">{d.promedioDias.toFixed(1)} dias</span>
        </p>
        <p className="text-neutral-300">
          Porcentaje: <span className="font-medium text-accent-purple">{d.porcentaje.toFixed(1)}%</span>
        </p>
      </div>
    </div>
  )
}

function CenterLabel({ viewBox, total }: any) {
  const { cx, cy } = viewBox
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#8e8e93" fontSize={12}>
        Total
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#f2f2f7" fontSize={22} fontWeight="bold">
        {total.toLocaleString('es-MX')}
      </text>
    </g>
  )
}

export default function EmpresaBreakdown({ data }: EmpresaBreakdownProps) {
  const chartData = useMemo(() => buildEmpresaData(data), [data])
  const total = useMemo(() => chartData.reduce((sum, d) => sum + d.cantidad, 0), [chartData])

  return (
    <ChartCard title="Distribucion por Empresa" subtitle="FISA vs AEF">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={3}
            dataKey="cantidad"
            nameKey="empresa"
            label={({ empresa, porcentaje }) => `${empresa} (${porcentaje.toFixed(0)}%)`}
            labelLine={{ stroke: '#636366' }}
          >
            {chartData.map((entry) => (
              <Cell key={entry.empresa} fill={getEmpresaColor(entry.empresa)} />
            ))}
            <CenterLabel total={total} />
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span className="text-sm text-neutral-300">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {chartData.map((d) => (
          <div
            key={d.empresa}
            className="rounded-lg border border-card-border bg-neutral-800/50 p-3 text-center"
          >
            <p
              className="text-sm font-semibold"
              style={{ color: getEmpresaColor(d.empresa) }}
            >
              {d.empresa}
            </p>
            <p className="mt-1 text-lg font-bold text-neutral-100">
              {d.promedioDias.toFixed(1)} dias
            </p>
            <p className="text-xs text-neutral-500">promedio</p>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
