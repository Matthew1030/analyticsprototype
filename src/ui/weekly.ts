import { monthIndexOfDay, shortDayLabel, weekEndingDay } from '../data/dates';
import type { Range } from '../engine/metrics';

/** The n weeks (Sunday to Saturday) that end on or before the given day, oldest first. */
export function weeksEnding(endDay: number, n: number): Range[] {
  let last = weekEndingDay(endDay);
  if (last > endDay) last -= 7;
  const out: Range[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const e = last - i * 7;
    out.push({ startDay: e - 6, endDay: e, startMi: monthIndexOfDay(e - 6), endMi: monthIndexOfDay(e) });
  }
  return out;
}

export const weekLabel = (r: Range) => shortDayLabel(r.endDay);
