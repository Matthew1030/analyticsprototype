import { isoDay, MONTHS, monthEndDay, monthIndexOfDay, monthLabel, monthStartDay, shortDayLabel, shortMonthLabel, toDate, weekEndingDay } from '../data/dates';

/** Day, week (Sunday to Saturday), month, quarter, year to date, or rolling 12 months. */
export type PeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'ytd' | 'r12';
/** What the current period is compared with. */
export type CompareMode = 'prior' | 'py';
/** Periods shorter than a month. Metrics that need a full month are not calculated for them. */
export type SubMonthGrain = 'day' | 'week';

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = {
  day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', ytd: 'Year to date', r12: 'Rolling 12 months',
};
export const COMPARE_LABEL: Record<CompareMode, string> = { prior: 'Prior period', py: 'Prior year' };

export interface Period {
  kind: PeriodKind;
  /**
   * Day number for days; day number of the closing Saturday for weeks; end month index (y*12+m)
   * for month, ytd and r12; quarter index (y*4+q) for quarters.
   */
  key: number;
  startMi: number;
  endMi: number;
  startDay: number;
  endDay: number;
  label: string;
  short: string;
  /** Set for days and weeks only. */
  grain?: SubMonthGrain;
}

/** "Sep 26, 2026" */
export function longDayLabel(day: number): string {
  const d = toDate(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
/** "09/26/26" */
const dayShort = (day: number) => `${shortDayLabel(day)}/${String(toDate(day).getUTCFullYear()).slice(2)}`;

function build(kind: PeriodKind, key: number, startMi: number, endMi: number, label: string, short: string): Period {
  return { kind, key, startMi, endMi, startDay: monthStartDay(startMi), endDay: monthEndDay(endMi), label, short };
}

export function dayPeriod(day: number): Period {
  const mi = monthIndexOfDay(day);
  return { kind: 'day', key: day, startMi: mi, endMi: mi, startDay: day, endDay: day, label: longDayLabel(day), short: dayShort(day), grain: 'day' };
}

/** The week (Sunday to Saturday) that ends on the given Saturday. */
export function weekPeriod(saturday: number): Period {
  return {
    kind: 'week', key: saturday, startMi: monthIndexOfDay(saturday - 6), endMi: monthIndexOfDay(saturday), startDay: saturday - 6, endDay: saturday,
    label: `Week ending ${longDayLabel(saturday)}`, short: `Wk ${dayShort(saturday)}`, grain: 'week',
  };
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
    case 'day': return dayPeriod(key);
    case 'week': return weekPeriod(key);
    case 'month': return monthPeriod(key);
    case 'quarter': return quarterPeriod(key);
    case 'ytd': return ytdPeriod(key);
    case 'r12': return r12Period(key);
  }
}

export function quarterOfMonth(mi: number): number {
  return Math.floor(mi / 12) * 4 + Math.floor((mi % 12) / 3);
}

/** Key step between consecutive periods of a kind (days and weeks are keyed by day number). */
const STEP: Record<PeriodKind, number> = { day: 1, week: 7, month: 1, quarter: 1, ytd: 1, r12: 1 };
/** Key step for one year. Days and weeks use 52 weeks, so the prior year falls on the same weekday. */
const YEAR: Record<PeriodKind, number> = { day: 364, week: 364, month: 12, quarter: 4, ytd: 12, r12: 12 };

/** The period n steps before p, of the same kind. */
export function shiftPeriod(p: Period, n: number): Period {
  return makePeriod(p.kind, p.key - n * STEP[p.kind]);
}

/** The period just before (same length). Year to date compares with the prior-year YTD. */
export function priorPeriod(p: Period): Period {
  return p.kind === 'ytd' ? priorYearPeriod(p) : shiftPeriod(p, 1);
}

/** The same period one year earlier (for days and weeks: 52 weeks earlier, same weekday). */
export function priorYearPeriod(p: Period): Period {
  return makePeriod(p.kind, p.key - YEAR[p.kind]);
}

export function comparePeriod(p: Period, mode: CompareMode): Period {
  return mode === 'py' ? priorYearPeriod(p) : priorPeriod(p);
}

/**
 * The same kind of period about n months earlier (n = 3, 6 or 12). Days and weeks move by 13
 * weeks per quarter, so they stay on the same weekday. Quarters compare by month.
 */
export function monthsEarlier(p: Period, n: number): Period {
  if (p.grain) return makePeriod(p.kind, p.key - (n / 3) * 91);
  return makePeriod(p.kind === 'quarter' ? 'month' : p.kind, p.endMi - n);
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
  for (let i = n - 1; i >= 0; i--) out.push(shiftPeriod(p, i));
  return out;
}

/** All selectable periods inside the data window, newest first. Weeks must be complete. */
export function availablePeriods(kind: PeriodKind, windowStartMi: number, endMi: number): Period[] {
  const out: Period[] = [];
  const firstDay = monthStartDay(windowStartMi);
  const lastDay = monthEndDay(endMi);
  if (kind === 'day') {
    for (let d = lastDay; d >= firstDay; d--) out.push(dayPeriod(d));
    return out;
  }
  if (kind === 'week') {
    let sat = weekEndingDay(lastDay);
    if (sat > lastDay) sat -= 7;
    for (; sat - 6 >= firstDay; sat -= 7) out.push(weekPeriod(sat));
    return out;
  }
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

/** Start and end dates of a period, for notes ("2026-09-20 to 2026-09-26"). */
export function periodDates(p: { startDay: number; endDay: number }): string {
  return p.startDay === p.endDay ? isoDay(p.startDay) : `${isoDay(p.startDay)} to ${isoDay(p.endDay)}`;
}

// ---------------------------------------------------------------- time grain for period columns

/** Time scale of the columns in a period-by-period table or trend. */
export type TimeGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export const TIME_GRAIN_LABEL: Record<TimeGrain, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
/** Number of columns for each grain. Years show every year in the data window. */
export const TIME_GRAIN_COUNT: Record<TimeGrain, number> = { day: 14, week: 13, month: 12, quarter: 8, year: 10 };

/** The grain that matches a period type (year to date and rolling 12 months show months). */
export function grainOf(kind: PeriodKind): TimeGrain {
  return kind === 'day' || kind === 'week' || kind === 'quarter' ? kind : 'month';
}

/**
 * The periods of one grain that end with the selected period, oldest first, inside the data
 * window. Days end on the period's last day; weeks with the last full week on or before it.
 * Months, quarters and years end with the period's last month: a quarter or year that is not
 * complete runs to that month and is marked "to date".
 */
export function grainColumns(grain: TimeGrain, p: Period, windowStartMi: number, n = TIME_GRAIN_COUNT[grain]): Period[] {
  const firstDay = monthStartDay(windowStartMi);
  let list: Period[];
  if (grain === 'day') list = trailing(dayPeriod(p.endDay), n);
  else if (grain === 'week') {
    let sat = weekEndingDay(p.endDay);
    if (sat > p.endDay) sat -= 7;
    list = trailing(weekPeriod(sat), n);
  } else if (grain === 'month') list = trailingMonths(p.endMi, n);
  else if (grain === 'quarter') {
    const last = quarterPeriod(quarterOfMonth(p.endMi));
    list = trailing(last, n);
    if (last.endMi > p.endMi) list[list.length - 1] = { ...last, endMi: p.endMi, endDay: monthEndDay(p.endMi), label: `${last.label} QTD`, short: `${last.short} QTD` };
  } else {
    const y = Math.floor(p.endMi / 12);
    list = [];
    for (let k = n - 1; k >= 0; k--) {
      const startMi = Math.max((y - k) * 12, windowStartMi);
      const endMi = Math.min((y - k) * 12 + 11, p.endMi);
      if (endMi < startMi) continue;
      const full = startMi === (y - k) * 12 && endMi === (y - k) * 12 + 11;
      const name = String(y - k);
      const part = full ? '' : endMi === p.endMi && startMi === (y - k) * 12 ? ' YTD' : ` (${MONTHS[startMi % 12]}–${MONTHS[endMi % 12]})`;
      list.push(build('ytd', endMi, startMi, endMi, `${name}${part}`, `${name}${part}`));
    }
  }
  return list.filter((x) => x.startDay >= firstDay);
}

