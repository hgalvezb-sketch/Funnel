import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  color: string
}

export default function KpiCard({ title, value, subtitle, icon: Icon, color }: KpiCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-card-border bg-card/80 backdrop-blur-sm p-4 transition-colors hover:bg-card-hover"
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-50">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
