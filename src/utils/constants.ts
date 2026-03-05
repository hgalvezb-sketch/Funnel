export const CHART_COLORS = {
  fisa: '#f97316',
  fisaLight: '#fb923c',
  aef: '#22c55e',
  aefLight: '#4ade80',
  primary: '#3b82f6',
  primaryLight: '#60a5fa',
  secondary: '#8b5cf6',
  secondaryLight: '#a78bfa',
  danger: '#ef4444',
  dangerLight: '#f87171',
  warning: '#f59e0b',
  warningLight: '#fbbf24',
} as const

export const HISTOGRAM_BINS = [
  '< 12h',
  '12h-1d',
  '1-2d',
  '2-3d',
  '3-5d',
  '5-7d',
  '1-2 sem',
  '2-3 sem',
  '3-4 sem',
  '1-1.5 mes',
  '1.5-2 mes',
  '> 2 meses',
] as const

export const CHART_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#84cc16',
  '#a855f7',
] as const
