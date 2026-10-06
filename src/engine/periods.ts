import { monthEndDay, monthLabel, monthStartDay, shortMonthLabel } from '../data/dates';

export type PeriodKind = 'month' | 'quarter';

export interface Period {
  kind: PeriodKind;
  /** month index (y*12+m) for months, quarter index (y*4+q) for quarters */
  key: number;
  startMi: number;
  endMi: number;
  startDay: number;
  endDay: number;
  label: string;
  short: string;
}

export function monthPeriod(mi: number): Period {
  return {
    kind: 'month', key: mi, startMi: mi, endMi: mi,
    startDay: monthStartDay(mi), endDay: monthEndDay(mi),
    label: monthLabel(mi), short: shortMonthLabel(mi),
  };
}

export function quarterPeriod(qi: number): Period {
  const y = Math.floor(qi / 4);
  const q = qi % 4;
  const startMi = y * 12 + q * 3;
  return {
    kind: 'quarter', key: qi, startMi, endMi: startMi + 2,
    startDay: monthStartDay(startMi), endDay: monthEndDay(startMi + 2),
    label: `Q${q + 1} ${y}`, short: `Q${q + 1} ${String(y).slice(2)}`,
  };
}

export function makePeriod(kind: PeriodKind, key: number): Period {
  return kind === 'month' ? monthPeriod(key) : quarterPeriod(key);
}

export function quarterOfMonth(mi: number): number {
  return Math.floor(mi / 12) * 4 + Math.floor((mi % 12) / 3);
}

export function priorPeriod(p: Period): Period {
  return makePeriod(p.kind, p.key - 1);
}

/** Shift a period by n months (used for the 2-month cash lag). */
export function shiftMonths(p: { startMi: number; endMi: number }, n: number): { startDay: number; endDay: number } {
  return { startDay: monthStartDay(p.startMi + n), endDay: monthEndDay(p.endMi + n) };
}

/** The n periods that end with p, oldest first. */
export function trailing(p: Period, n: number): Period[] {
  const out: Period[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(makePeriod(p.kind, p.key - i));
  return out;
}

/** All selectable periods inside the data window, newest first. */
export function availablePeriods(kind: PeriodKind, windowStartMi: number, endMi: number): Period[] {
  const out: Period[] = [];
  if (kind === 'month') {
    for (let mi = endMi; mi >= windowStartMi; mi--) out.push(monthPeriod(mi));
  } else {
    for (let qi = quarterOfMonth(endMi); qi >= quarterOfMonth(windowStartMi); qi--) {
      const p = quarterPeriod(qi);
      if (p.startMi >= windowStartMi && p.endMi <= endMi) out.push(p);
    }
  }
  return out;
}

/** Number of periods of this kind inside the window. */
export function periodsInWindow(kind: PeriodKind, windowStartMi: number, endMi: number): number {
  return availablePeriods(kind, windowStartMi, endMi).length;
}
