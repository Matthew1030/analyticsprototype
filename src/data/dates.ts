// Dates are stored as integer day numbers (days since 1970-01-01, UTC).

const MS_PER_DAY = 86_400_000;

export function dayOf(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function toDate(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

export function isoDay(day: number): string {
  return toDate(day).toISOString().slice(0, 10);
}

/** Month index = year * 12 + (month - 1). */
export function monthIndexOfDay(day: number): number {
  const d = toDate(day);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function monthIndexOfKey(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function monthKey(mi: number): string {
  const y = Math.floor(mi / 12);
  const m = (mi % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function monthStartDay(mi: number): number {
  return dayOf(Math.floor(mi / 12), (mi % 12) + 1, 1);
}

export function monthEndDay(mi: number): number {
  return monthStartDay(mi + 1) - 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(mi: number): string {
  return `${MONTHS[mi % 12]} ${Math.floor(mi / 12)}`;
}

export function shortMonthLabel(mi: number): string {
  return `${MONTHS[mi % 12]} ${String(Math.floor(mi / 12)).slice(2)}`;
}

/** Day of week, 0 = Sunday. */
export function weekday(day: number): number {
  return toDate(day).getUTCDay();
}

/** The Saturday that ends the week of the given day. */
export function weekEndingDay(day: number): number {
  return day + (6 - weekday(day));
}

export function shortDayLabel(day: number): string {
  const d = toDate(day);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
