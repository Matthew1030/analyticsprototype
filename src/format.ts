import type { Unit } from './engine/metrics';

export function fmt(v: number | null | undefined, unit: Unit, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  switch (unit) {
    case 'pct': return `${(v * 100).toFixed(digits ?? 1)}%`;
    case 'days': return v.toFixed(digits ?? 1);
    case 'sec': return `${v.toFixed(digits ?? 1)} sec`;
    case 'score': return Math.round(v).toString();
    case 'count': return Math.round(v).toLocaleString('en-US');
    case 'usd': return usd(v);
  }
}

export function usd(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function usdFull(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Change between two values in the metric's unit (percentage points for rates). */
export function fmtChange(cur: number | null, prior: number | null, unit: Unit): string {
  if (cur === null || prior === null) return '–';
  const d = cur - prior;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  const a = Math.abs(d);
  if (unit === 'pct') return `${sign}${(a * 100).toFixed(1)} pts`;
  if (unit === 'usd') return `${sign}${usd(a)}`;
  return `${sign}${fmt(a, unit)}`;
}
