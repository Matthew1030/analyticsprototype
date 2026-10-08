import { monthEndDay, monthLabel, monthStartDay, shortMonthLabel } from '../data/dates';

/** Month, quarter, year to date, or rolling 12 months. All end on a month. */
export type PeriodKind = 'month' | 'quarter' | 'ytd' | 'r12';
/** What the current period is compared with. */
export type CompareMode = 'prior' | 'py';

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = {
  month: 'Month', quarter: 'Quarter', ytd: 'Year to date', r12: 'Rolling 12 months',
};
export const COMPARE_LABEL: Record<CompareMode, string> = { prior: 'Prior period', py: 'Prior year' };

export interface Period {
  kind: PeriodKind;
  /** End month index (y*12+m) for month, ytd and r12; quarter index (y*4+q) for quarters. */
  key: number;
  startMi: number;
  endMi: number;
  startDay: number;
  endDay: number;
  label: string;
  short: string;
}

function build(kind: PeriodKind, key: number, startMi: number, endMi: number, label: string, short: string): Period {
  return { kind, key, startMi, endMi, startDay: monthStartDay(startMi), endDay: monthEndDay(endMi), label, short };
}

export function monthPeriod(mi: number): Period {
  return build('month', mi, mi, mi, monthLabel(mi), shortMonthLabel(mi));
}

export function quarterPeriod(qi: number): Period {
  const y = Math.floor(qi / 4);
  const q = qi % 4;
  const startMi = y * 12 + q * 3;
  return build('quarter', qi, startMi, startMi + 2, `Q${q + 1} ${y}`, `Q${q + 1} ${String(y).slice(2)}`);
}

export function ytdPeriod(endMi: number): Period {
  const startMi = Math.floor(endMi / 12) * 12;
  return build('ytd', endMi, startMi, endMi, `YTD ${monthLabel(endMi)}`, `YTD ${shortMonthLabel(endMi)}`);
}

export function r12Period(endMi: number): Period {
  return build('r12', endMi, endMi - 11, endMi, `12 months to ${monthLabel(endMi)}`, `R12 ${shortMonthLabel(endMi)}`);
}

export function makePeriod(kind: PeriodKind, key: number): Period {
  switch (kind) {
    case 'month': return monthPeriod(key);
    case 'quarter': return quarterPeriod(key);
    case 'ytd': return ytdPeriod(key);
    case 'r12': return r12Period(key);
  }
}

export function quarterOfMonth(mi: number): number {
  return Math.floor(mi / 12) * 4 + Math.floor((mi % 12) / 3);
}

/** The period just before (same length). Year to date compares with the prior-year YTD. */
export function priorPeriod(p: Period): Period {
  if (p.kind === 'quarter') return quarterPeriod(p.key - 1);
  if (p.kind === 'month') return monthPeriod(p.key - 1);
  return makePeriod(p.kind, p.key - 12);
}

/** The same period one year earlier. */
export function priorYearPeriod(p: Period): Period {
  return p.kind === 'quarter' ? quarterPeriod(p.key - 4) : makePeriod(p.kind, p.key - 12);
}

export function comparePeriod(p: Period, mode: CompareMode): Period {
  return mode === 'py' ? priorYearPeriod(p) : priorPeriod(p);
}

/** Shift a period by n months (used for the 2-month cash lag and collection cohorts). */
export function shiftMonths(p: { startMi: number; endMi: number }, n: number): { startDay: number; endDay: number } {
  return { startDay: monthStartDay(p.startMi + n), endDay: monthEndDay(p.endMi + n) };
}

/** The n months that end with month index endMi, oldest first. */
export function trailingMonths(endMi: number, n: number): Period[] {
  const out: Period[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthPeriod(endMi - i));
  return out;
}

/** The n periods of the same kind that end with p, oldest first. */
export function trailing(p: Period, n: number): Period[] {
  const out: Period[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(p.kind === 'quarter' ? quarterPeriod(p.key - i) : p.kind === 'month' ? monthPeriod(p.key - i) : makePeriod(p.kind, p.key - i));
  return out;
}

/** All selectable periods inside the data window, newest first. */
export function availablePeriods(kind: PeriodKind, windowStartMi: number, endMi: number): Period[] {
  const out: Period[] = [];
  if (kind === 'quarter') {
    for (let qi = quarterOfMonth(endMi); qi >= quarterOfMonth(windowStartMi); qi--) {
      const p = quarterPeriod(qi);
      if (p.startMi >= windowStartMi && p.endMi <= endMi) out.push(p);
    }
    return out;
  }
  const first = kind === 'r12' ? windowStartMi + 11 : windowStartMi;
  for (let mi = endMi; mi >= first; mi--) {
    const p = makePeriod(kind, mi);
    if (p.startMi >= windowStartMi) out.push(p);
  }
  return out;
}

/** Number of days in a period (used for daily averages). */
export function daysIn(p: { startDay: number; endDay: number }): number {
  return p.endDay - p.startDay + 1;
}
