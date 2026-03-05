// Utilidades para formateo y conversion de tiempos del funnel

/**
 * Convierte segundos a dias decimales
 */
export function secondsToDays(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds / 86400;
}

/**
 * Formatea dias a texto legible:
 * - Menos de 1 dia: muestra horas (ej. "5.2 horas")
 * - 1 a 30 dias: muestra dias con 1 decimal (ej. "4.1 dias")
 * - Mas de 30 dias: muestra meses y dias (ej. "2 meses 5 dias")
 */
export function formatDays(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '0 horas';

  if (days < 1) {
    const hours = days * 24;
    return `${hours.toFixed(1)} horas`;
  }

  if (days <= 30) {
    return `${days.toFixed(1)} dias`;
  }

  const months = Math.floor(days / 30);
  const remainingDays = Math.round(days % 30);

  if (remainingDays === 0) {
    return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  }

  return `${months} ${months === 1 ? 'mes' : 'meses'} ${remainingDays} dias`;
}

/**
 * Formatea segundos al formato DD:HH:MM:SS
 */
export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';

  const totalSeconds = Math.round(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

/**
 * Parsea formato "DD:HH:MM:SS" a segundos totales
 */
export function parseFunnelTime(formatted: string): number {
  if (!formatted || typeof formatted !== 'string') return 0;

  const parts = formatted.split(':').map(p => parseInt(p.trim(), 10));

  if (parts.length !== 4 || parts.some(p => !Number.isFinite(p))) return 0;

  const [days, hours, minutes, seconds] = parts;
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}
