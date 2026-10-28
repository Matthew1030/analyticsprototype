// Day and week periods, the time grains of the ELT period table, and metrics that need a month.

import { describe, expect, it } from 'vitest';
import { isoDay, monthEndDay, weekday } from '../src/data/dates';
import { Engine } from '../src/engine/engine';
import { FRAMEWORK_METRICS } from '../src/engine/framework';
import { evaluate, METRIC_BY_ID, METRICS } from '../src/engine/metrics';
import {
  availablePeriods, comparePeriod, dayPeriod, grainColumns, grainOf, makePeriod, monthPeriod, monthsEarlier, priorYearPeriod, weekPeriod,
} from '../src/engine/periods';
import { loadDataset } from './loadDataset';

const ds = loadDataset();
const e = new Engine(ds);
const lastDay = monthEndDay(ds.meta.endMonth);

describe('day and week periods', () => {
  it('lists every day of the data window, newest first', () => {
    const days = availablePeriods('day', ds.meta.windowStartMonth, ds.meta.endMonth);
    expect(days[0].key).toBe(lastDay);
    expect(days[0].startDay).toBe(days[0].endDay);
    expect(days.length).toBe(lastDay - monthEndDay(ds.meta.windowStartMonth - 1));
  });

  it('lists only complete Sunday-to-Saturday weeks inside the window', () => {
    const weeks = availablePeriods('week', ds.meta.windowStartMonth, ds.meta.endMonth);
    for (const w of weeks) {
      expect(weekday(w.endDay)).toBe(6);
      expect(w.endDay - w.startDay).toBe(6);
      expect(w.endDay).toBeLessThanOrEqual(lastDay);
    }
    expect(weeks[0].endDay).toBeGreaterThan(lastDay - 7);
  });

  it('compares with the day or week before, and with the same weekday 52 weeks earlier', () => {
    const d = dayPeriod(lastDay);
    expect(comparePeriod(d, 'prior').key).toBe(lastDay - 1);
    expect(priorYearPeriod(d).key).toBe(lastDay - 364);
    expect(weekday(priorYearPeriod(d).key)).toBe(weekday(lastDay));
    const w = availablePeriods('week', ds.meta.windowStartMonth, ds.meta.endMonth)[0];
    expect(comparePeriod(w, 'prior').key).toBe(w.key - 7);
    expect(monthsEarlier(w, 3).key).toBe(w.key - 91);
  });

  it('round-trips through makePeriod and has readable labels', () => {
    const w = weekPeriod(availablePeriods('week', ds.meta.windowStartMonth, ds.meta.endMonth)[0].key);
    expect(makePeriod('week', w.key)).toEqual(w);
    expect(w.label).toMatch(/^Week ending [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(dayPeriod(lastDay).label).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });
});

describe('metrics by day and week', () => {
  const day = dayPeriod(lastDay);
  const week = availablePeriods('week', ds.meta.windowStartMonth, ds.meta.endMonth)[0];

  it('calculates flow metrics for a single day', () => {
    expect(evaluate(METRIC_BY_ID.denial_dollar_rate, e, day, {}).value).not.toBeNull();
    expect(evaluate(METRIC_BY_ID.cash, e, day, {}).value).toBeGreaterThan(0);
  });

  it('shows no value, with a reason, for metrics that need a month', () => {
    for (const id of ['gross_ar_days', 'ar_gt90_pct', 'cash_pct_npsr', 'avoidable_wo_pct_net', 'net_collection_rate']) {
      for (const p of [day, week]) {
        const r = evaluate(METRIC_BY_ID[id], e, p, {});
        expect(r.value, `${id} ${p.kind}`).toBeNull();
        expect(r.noData, id).toMatch(/month/);
      }
      expect(evaluate(METRIC_BY_ID[id], e, monthPeriod(ds.meta.endMonth), {}).value, id).not.toBeNull();
    }
  });

  it('calculates DNFB snapshot metrics by week but not by day', () => {
    expect(evaluate(METRIC_BY_ID.dnfb_days, e, week, {}).value).not.toBeNull();
    expect(evaluate(METRIC_BY_ID.dnfb_days, e, day, {}).value).toBeNull();
  });

  it('has no cash goal (a monthly goal) for days and weeks', () => {
    expect(evaluate(METRIC_BY_ID.cash, e, week, {}).target).toBeNull();
    expect(evaluate(METRIC_BY_ID.cash, e, monthPeriod(ds.meta.endMonth), {}).target).not.toBeNull();
  });

  it('marks every month-only metric in the catalog', () => {
    expect(METRICS.filter((m) => m.finest === 'month').length).toBeGreaterThan(5);
    for (const m of METRICS) if (m.finest) expect(['week', 'month']).toContain(m.finest);
  });
});

describe('time grain columns (ELT period table)', () => {
  const month = monthPeriod(ds.meta.endMonth);

  it('follows the period type by default', () => {
    expect(grainOf('day')).toBe('day');
    expect(grainOf('week')).toBe('week');
    expect(grainOf('quarter')).toBe('quarter');
    expect(grainOf('ytd')).toBe('month');
    expect(grainOf('r12')).toBe('month');
  });

  it('ends each grain with the selected period, oldest first', () => {
    const days = grainColumns('day', month, ds.meta.windowStartMonth);
    expect(days).toHaveLength(14);
    expect(days[13].endDay).toBe(lastDay);
    const weeks = grainColumns('week', month, ds.meta.windowStartMonth);
    expect(weeks).toHaveLength(13);
    expect(weekday(weeks[12].endDay)).toBe(6);
    const months = grainColumns('month', month, ds.meta.windowStartMonth);
    expect(months.map((p) => p.key)).toEqual(Array.from({ length: 12 }, (_, i) => ds.meta.endMonth - 11 + i));
  });

  it('keeps quarters and years inside the data window, marking partial ones', () => {
    const qs = grainColumns('quarter', month, ds.meta.windowStartMonth);
    for (const q of qs) expect(q.startMi).toBeGreaterThanOrEqual(ds.meta.windowStartMonth);
    const ys = grainColumns('year', month, ds.meta.windowStartMonth);
    expect(ys.length).toBeGreaterThanOrEqual(2);
    expect(ys[0].startMi).toBeGreaterThanOrEqual(ds.meta.windowStartMonth);
    expect(ys[ys.length - 1].endMi).toBe(ds.meta.endMonth);
    if (ds.meta.endMonth % 12 !== 11) expect(ys[ys.length - 1].label).toMatch(/YTD$/);
    const mid = monthPeriod(ds.meta.endMonth - 1);
    const q = grainColumns('quarter', mid, ds.meta.windowStartMonth).at(-1)!;
    if (mid.endMi % 3 !== 2) { expect(q.endMi).toBe(mid.endMi); expect(q.label).toMatch(/QTD$/); }
  });

  it('gives every framework metric a value for each month column', () => {
    for (const p of grainColumns('month', month, ds.meta.windowStartMonth).slice(-3)) {
      for (const f of FRAMEWORK_METRICS) expect(evaluate(METRIC_BY_ID[f.id], e, p, {}).value, `${f.id} ${isoDay(p.endDay)}`).not.toBeNull();
    }
  });
});
