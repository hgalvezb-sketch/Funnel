import { useMemo } from 'react'
import {
  FileText,
  Clock,
  TrendingUp,
  ArrowDown,
  ArrowUp,
  Target,
  Building2,
  Building,
} from 'lucide-react'
import KpiCard from './KpiCard'
import { useKpiCalculations } from '../../hooks/useKpiCalculations'
import { formatDays } from '../../utils/timeFormatters'
import { CHART_COLORS } from '../../utils/constants'
import type { FunnelRecord } from '../../types/funnel'

interface KpiRowProps {
  data: FunnelRecord[]
}

export default function KpiRow({ data }: KpiRowProps) {
  const kpis = useKpiCalculations(data)

  const cards = useMemo(
    () => [
      {
        title: 'Total Solicitudes',
        value: kpis.totalRecords.toLocaleString('es-MX'),
        icon: FileText,
        color: CHART_COLORS.primary,
      },
      {
        title: 'Tiempo Promedio',
        value: formatDays(kpis.avgTimeDays),
        subtitle: 'dias promedio',
        icon: Clock,
        color: CHART_COLORS.secondary,
      },
      {
        title: 'Mediana',
        value: formatDays(kpis.medianTimeDays),
        subtitle: 'dias mediana',
        icon: TrendingUp,
        color: '#a1a1a6',
      },
      {
        title: 'Minimo',
        value: formatDays(kpis.minTimeDays),
        subtitle: 'dias minimo',
        icon: ArrowDown,
        color: CHART_COLORS.aef,
      },
      {
        title: 'Maximo',
        value: formatDays(kpis.maxTimeDays),
        subtitle: 'dias maximo',
        icon: ArrowUp,
        color: CHART_COLORS.danger,
      },
      {
        title: 'Percentil 90',
        value: formatDays(kpis.p90TimeDays),
        subtitle: 'P90',
        icon: Target,
        color: CHART_COLORS.warning,
      },
      {
        title: 'Promedio FISA',
        value: formatDays(kpis.avgTimeFISA),
        subtitle: 'dias FISA',
        icon: Building2,
        color: CHART_COLORS.fisa,
      },
      {
        title: 'Promedio AEF',
        value: formatDays(kpis.avgTimeAEF),
        subtitle: 'dias AEF',
        icon: Building,
        color: CHART_COLORS.aef,
      },
    ],
    [kpis]
  )

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  )
}
