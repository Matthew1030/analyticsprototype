import type { Unit } from './engine/metrics';

/** Display a value in its unit. Dollars are compact ($1.24M); counts use separators. */
export function fmt(v: number | null | undefined, unit: Unit, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  switch (unit) {
    case 'pct': return `${(v * 100).toFixed(digits ?? 1)}%`;
    case 'days': return v.toFixed(digits ?? 1);
    case 'sec': return `${v.toFixed(digits ?? 0)}s`;
    case 'ratio': return v.toFixed(digits ?? 2);
    case 'count': return Math.round(v).toLocaleString('en-US');
    case 'usd': return usd(v, digits);
  }
}

export function usd(v: number, digits?: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(digits ?? 2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(digits ?? 1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(digits ?? 0)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function usdFull(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Change between two values in the metric's unit (percentage points for rates). */
export function fmtDelta(d: number | null, unit: Unit, digits?: number): string {
  if (d === null || !Number.isFinite(d)) return '–';
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  const a = Math.abs(d);
  if (unit === 'pct') return `${sign}${(a * 100).toFixed(digits ?? 1)} pts`;
  if (unit === 'usd') return `${sign}${usd(a)}`;
  return `${sign}${fmt(a, unit, digits)}`;
}

/** Relative change as a percentage (for dollar and count measures). */
export function fmtPctChange(cur: number | null, prior: number | null): string {
  if (cur === null || prior === null || prior === 0) return '–';
  const d = (cur - prior) / Math.abs(prior);
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d * 100).toFixed(1)}%`;
}

/** Date-time in the organization's display time zone, e.g. "October 8, 2026 6:00 AM CT". */
export function fmtDateTime(utc: string, tz: string): string {
  const d = new Date(utc);
  const date = d.toLocaleDateString('en-US', { timeZone: tz, month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const zone = tz === 'America/Chicago' ? 'CT' : tz === 'America/New_York' ? 'ET' : tz;
  return `${date} ${time} ${zone}`;
}

export function fmtDate(day: number): string {
  return new Date(day * 86_400_000).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
}
