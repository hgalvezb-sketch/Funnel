import type { FunnelRecord } from '../../types/funnel'
import KpiRow from '../kpi/KpiRow'
import AvgTimeByProduct from '../charts/AvgTimeByProduct'
import FunnelDistribution from '../charts/FunnelDistribution'
import TimeTrend from '../charts/TimeTrend'
import EmpresaBreakdown from '../charts/EmpresaBreakdown'
import TopBottlenecks from '../charts/TopBottlenecks'
import FrontEndBreakdown from '../charts/FrontEndBreakdown'
import TopSucursales from '../charts/TopSucursales'

interface DashboardGridProps {
  data: FunnelRecord[]
}

export default function DashboardGrid({ data }: DashboardGridProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center p-20">
        <p className="text-neutral-500">No hay datos que coincidan con los filtros seleccionados.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* KPIs */}
      <div className="animate-fade-in">
        <KpiRow data={data} />
      </div>

      {/* Row 2: Product avg + Histogram */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="animate-fade-in">
          <AvgTimeByProduct data={data} />
        </div>
        <div className="animate-fade-in">
          <FunnelDistribution data={data} />
        </div>
      </div>

      {/* Row 3: Time trend + Empresa breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 animate-fade-in">
          <TimeTrend data={data} />
        </div>
        <div className="animate-fade-in">
          <EmpresaBreakdown data={data} />
        </div>
      </div>

      {/* Row 4: Bottlenecks + FrontEnd */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="animate-fade-in">
          <TopBottlenecks data={data} />
        </div>
        <div className="animate-fade-in">
          <FrontEndBreakdown data={data} />
        </div>
      </div>

      {/* Row 5: Top Sucursales (full width) */}
      <div className="animate-fade-in">
        <TopSucursales data={data} />
      </div>
    </div>
  )
}
