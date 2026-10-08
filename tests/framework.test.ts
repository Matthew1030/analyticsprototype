import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { FRAMEWORK, FRAMEWORK_METRICS } from '../src/engine/framework';
import { evaluate, METRIC_BY_ID } from '../src/engine/metrics';
import { monthPeriod } from '../src/engine/periods';
import { CONFIG, staticTarget } from '../src/engine/status';
import { loadDataset } from './loadDataset';

const ds = loadDataset();
const e = new Engine(ds);
const last = monthPeriod(ds.meta.endMonth);

describe('ELT metric framework', () => {
  it('has exactly the client codes P1–P13 without P3', () => {
    expect(FRAMEWORK_METRICS.map((m) => m.code).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))
      .toEqual(['P1', 'P2', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13']);
  });

  it('maps every code to a catalog metric with the same code, a direction and a target (P2 has none)', () => {
    for (const f of FRAMEWORK_METRICS) {
      const m = METRIC_BY_ID[f.id];
      expect(m, f.id).toBeDefined();
      expect(m.code).toBe(f.code);
      expect(m.direction).not.toBe('none');
      const t = evaluate(m, e, last, {}).target;
      if (f.code === 'P2') expect(t).toBeNull();
      else expect(t, f.id).not.toBeNull();
    }
  });

  it('uses the client targets and settings', () => {
    expect(evaluate(METRIC_BY_ID.gross_ar_days, e, last, {}).target).toBe(45);
    expect(evaluate(METRIC_BY_ID.dnfb_days, e, last, {}).target).toBe(CONFIG.framework.billHoldDays + 1.5);
    expect(evaluate(METRIC_BY_ID.cash_pct_npsr, e, last, {}).target).toBe(1);
    expect(staticTarget('avoidable_wo_unrealized_pct')).toBe(0.01);
  });

  it('counts only billed A/R in % of AR over 90 days (P4)', () => {
    const d = e.snapshotDayOnOrBefore('ar', last.endDay)!;
    const billed = e.snapshot('ar', 'gross', d, {}, { billed: [1, 2] });
    const old = e.snapshot('ar', 'gross', d, {}, { billed: [1, 2], ageMin: 3 });
    expect(evaluate(METRIC_BY_ID.ar_gt90_pct, e, last, {}).value).toBeCloseTo(old / billed, 9);
  });

  it('puts every metric in one group only', () => {
    const ids = FRAMEWORK.flatMap((g) => g.metrics.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('computes a plausible value for every metric, enterprise-wide and per hospital', () => {
    for (const f of FRAMEWORK_METRICS) {
      const v = evaluate(METRIC_BY_ID[f.id], e, last, {}).value;
      expect(v, f.id).not.toBeNull();
      expect(Number.isFinite(v!), f.id).toBe(true);
      if (METRIC_BY_ID[f.id].unit === 'pct') expect(Math.abs(v!), f.id).toBeLessThan(1.5);
      for (const h of ds.dims.facilities) expect(evaluate(METRIC_BY_ID[f.id], e, last, { facility: [h.key] }).value, `${f.id} ${h.short}`).not.toBeNull();
    }
  });

  it('keeps modeled credit balances small and positive (days of net revenue)', () => {
    const v = evaluate(METRIC_BY_ID.credit_balance_days, e, last, {}).value!;
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(5);
  });
});
