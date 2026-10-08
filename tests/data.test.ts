import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { METRICS, METRIC_BY_ID, evaluate, type Range } from '../src/engine/metrics';
import { makePeriod, monthPeriod, quarterOfMonth, quarterPeriod, trailingMonths } from '../src/engine/periods';
import { changeOf, statusOf } from '../src/engine/status';
import { breakdown, metricValue } from '../src/services/analytics';
import { DATA_FILES } from '../src/data/model';
import { loadDataset } from './loadDataset';

const ds = loadDataset();
const e = new Engine(ds);
const last = monthPeriod(ds.meta.endMonth);
const lastQ = quarterPeriod(quarterOfMonth(ds.meta.endMonth));
const facKeys = ds.dims.facilities.map((f) => f.key);
const fac = (name: string) => ds.dims.facilities.find((f) => f.short === name)!.key;
const payer = (name: string) => ds.dims.payers.find((p) => p.name === name)!.key;
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6 * Math.max(1, Math.abs(b)));
const span = (months: number): Range => {
  const ps = trailingMonths(ds.meta.endMonth, months);
  return { startDay: ps[0].startDay, endDay: last.endDay, startMi: ps[0].startMi, endMi: last.endMi };
};
const v = (id: string, r: Range, sel = {}) => evaluate(METRIC_BY_ID[id], e, r, sel).value!;

describe('data files', () => {
  it('stay small enough to load in a few seconds', () => {
    const dir = join(__dirname, '..', 'public', 'data');
    const total = DATA_FILES.reduce((s, f) => s + statSync(join(dir, `${f}.json`)).size, 0);
    expect(total).toBeLessThan(16e6);
  });

  it('cover 24 months that end at the configured month', () => {
    expect(ds.meta.endMonth - ds.meta.windowStartMonth + 1).toBe(24);
  });

  it('contain no patient identifiers', () => {
    expect(Object.keys(ds.acc)).not.toEqual(expect.arrayContaining(['name', 'mrn', 'dob', 'ssn', 'patient']));
  });

  it('use realistic facility names, not placeholders', () => {
    for (const f of ds.dims.facilities) expect(f.name).not.toMatch(/^Hospital [A-Z]$/);
  });
});

describe('every metric is computable from the data', () => {
  for (const m of METRICS) {
    it(`${m.id} ${m.name}`, () => {
      for (const r of [last, lastQ, makePeriod('ytd', ds.meta.endMonth), makePeriod('r12', ds.meta.endMonth)]) {
        const res = evaluate(m, e, r, {});
        expect(res.noData).toBeUndefined();
        expect(Number.isFinite(res.value)).toBe(true);
      }
    });
  }

  it('gives a no-data reason when a filter does not apply to the fact', () => {
    const res = evaluate(METRIC_BY_ID.dnfb_days, e, last, { payer: [0] });
    expect(res.value).toBeNull();
    expect(res.noData).toMatch(/payer/);
  });

  it('gives a no-data reason for a facility without the service', () => {
    const noOrders = facKeys.find((f) => !e.feHasCol('ordersReceived', { facility: [f] }));
    expect(noOrders).toBeDefined();
    expect(evaluate(METRIC_BY_ID.scheduled_rate, e, last, { facility: [noOrders!] }).value).toBeNull();
  });
});

describe('scale is plausible for a 10-hospital system', () => {
  it('annual NPSR is between $0.6B and $1.6B, and A/R days are in a realistic range', () => {
    const npsr = v('npsr', span(12));
    expect(npsr).toBeGreaterThan(6e8);
    expect(npsr).toBeLessThan(1.6e9);
    const days = v('net_ar_days', last);
    expect(days).toBeGreaterThan(40);
    expect(days).toBeLessThan(75);
    expect(v('clean_claim_rate', last)).toBeGreaterThan(0.8);
  });
});

describe('reconciliation', () => {
  it('account totals equal facility totals, and region totals equal the system', () => {
    for (const p of trailingMonths(ds.meta.endMonth, 12)) {
      const system = e.sum('acc', 'gross', 'dd', p.startDay, p.endDay, {});
      const byFacility = facKeys.reduce((s, f) => s + e.sum('acc', 'gross', 'dd', p.startDay, p.endDay, { facility: [f] }), 0);
      const byRegion = ds.dims.regions.reduce((s, _, r) => s + e.sum('acc', 'gross', 'dd', p.startDay, p.endDay, { region: [r] }), 0);
      close(byFacility, system);
      close(byRegion, system);
    }
  });

  it('cash, denials, write-offs, bad debt and charity by facility sum to the system', () => {
    for (const [col, date] of [['payAmt', 'payD'], ['denAmt', 'denD'], ['woAmt', 'woD'], ['bdAmt', 'bdD'], ['chAmt', 'chD']] as const) {
      const sys = e.sum('acc', col, date, lastQ.startDay, lastQ.endDay, {});
      const byFac = facKeys.reduce((s, f) => s + e.sum('acc', col, date, lastQ.startDay, lastQ.endDay, { facility: [f] }), 0);
      close(byFac, sys);
    }
  });

  it('A/R aging buckets sum to total A/R, and payers sum to the system', () => {
    for (const day of e.snapshotDays('ar').slice(-12)) {
      const total = e.snapshot('ar', 'gross', day, {});
      const buckets = ds.dims.arAge.reduce((s, b) => s + e.snapshot('ar', 'gross', day, { arAge: [b.key] }), 0);
      const payers = ds.dims.payers.reduce((s, p) => s + e.snapshot('ar', 'gross', day, { payer: [p.key] }), 0);
      close(buckets, total);
      close(payers, total);
    }
  });

  it('denial root causes sum to total denials', () => {
    const all = e.sum('acc', 'denAmt', 'denD', lastQ.startDay, lastQ.endDay, {}, { detail: 'denial' });
    const byRc = ds.dims.rootCauses.reduce((s, r) => s + e.sum('acc', 'denAmt', 'denD', lastQ.startDay, lastQ.endDay, { rootCause: [r.key] }, { detail: 'denial' }), 0);
    close(byRc, all);
  });

  it('combined ratios come from summed values, not from an average of facility ratios', () => {
    const sys = v('clean_claim_rate', last);
    let clean = 0;
    let sub = 0;
    for (const f of facKeys) {
      clean += e.sum('acc', 'clean', 'sbd', last.startDay, last.endDay, { facility: [f] });
      sub += e.sum('acc', '__one', 'sbd', last.startDay, last.endDay, { facility: [f] });
    }
    close(sys, clean / sub);
  });

  it('additive breakdown shares sum to 1', () => {
    const rows = breakdown(e, 'net_ar', 'payer', last, 'prior', {});
    close(rows.reduce((s, r) => s + (r.share ?? 0), 0), 1);
  });
});

describe('planted patterns trace to a cause', () => {
  it('net A/R days rose over the last 6 months, most at Williamson Regional', () => {
    const six = monthPeriod(ds.meta.endMonth - 6);
    expect(v('net_ar_days', last)).toBeGreaterThan(v('net_ar_days', six) + 3);
    const rise = facKeys.filter((f) => ds.dims.facilities[f].type !== 'Critical Access')
      .map((f) => ({ f, d: v('net_ar_days', last, { facility: [f] }) - v('net_ar_days', six, { facility: [f] }) }))
      .sort((a, b) => b.d - a.d);
    expect(rise[0].f).toBe(fac('Williamson Regional'));
  });

  it('Humana MA is the largest payer in the 121–180 bucket at Williamson Regional', () => {
    const day = e.snapshotDayOnOrBefore('ar', last.endDay)!;
    const by = e.snapshotBy('ar', 'net', 'payer', day, { facility: [fac('Williamson Regional')], arAge: [4] });
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe(payer('Humana Medicare Advantage'));
  });

  it('Valley Regional has the highest denial rate among larger hospitals, led by COB denials', () => {
    const big = facKeys.filter((f) => ds.dims.facilities[f].type !== 'Critical Access');
    const rates = big.map((f) => v('denial_rate', lastQ, { facility: [f] }));
    expect(big[rates.indexOf(Math.max(...rates))]).toBe(fac('Valley Regional'));
    const cats = ds.dims.denialCategories.map((c) => e.sum('acc', '__one', 'denD', lastQ.startDay, lastQ.endDay, { facility: [fac('Valley Regional')], financialClass: [1], denialCategory: [c.key] }, { detail: 'denial' }));
    expect(ds.dims.denialCategories[cats.indexOf(Math.max(...cats))].name).toBe('Coordination of benefits');
  });

  it('Cigna has the most negative payment variance', () => {
    const insured = ds.dims.payers.filter((p) => p.fc !== 6);
    const vals = insured.map((p) => v('payment_variance_pct', span(12), { payer: [p.key] }));
    expect(insured[vals.indexOf(Math.min(...vals))].name).toBe('Cigna');
    expect(Math.min(...vals)).toBeLessThan(-0.05);
  });

  it('Riverbend has the longest coding turnaround in the last 3 months', () => {
    const vals = facKeys.map((f) => v('coding_tat', span(3), { facility: [f] }));
    expect(facKeys[vals.indexOf(Math.max(...vals))]).toBe(fac('Riverbend'));
  });

  it('Pine Ridge has the lowest clean claim rate, mostly registration edits', () => {
    const vals = facKeys.map((f) => v('clean_claim_rate', span(6), { facility: [f] }));
    expect(facKeys[vals.indexOf(Math.min(...vals))]).toBe(fac('Pine Ridge'));
  });
});

describe('status and change logic', () => {
  it('uses the target, the watch threshold and the direction', () => {
    expect(statusOf(49, 50, 'down', 54)).toBe('On target');
    expect(statusOf(53, 50, 'down', 54)).toBe('Watch');
    expect(statusOf(58.4, 50, 'down', 54)).toBe('Off target');
    expect(statusOf(0.99, 0.98, 'up', 0.95)).toBe('On target');
    expect(statusOf(0.963, 0.98, 'up', 0.95)).toBe('Watch');
    expect(statusOf(0.9, 0.98, 'up', 0.95)).toBe('Off target');
    expect(statusOf(0.7, null, 'up', null)).toBeNull();
  });

  it('shows change as favorable or unfavorable by direction', () => {
    expect(changeOf(5, 6, 'down')).toBe('Favorable');
    expect(changeOf(5, 6, 'up')).toBe('Unfavorable');
    expect(changeOf(5, 6, 'none')).toBeNull();
  });
});

describe('service contract', () => {
  it('metricValue returns the API shape with comparison, target and trend', () => {
    const mv = metricValue(e, 'net_ar_days', last, 'prior', {}, 13);
    expect(mv).toMatchObject({ metric: 'net_ar_days', unit: 'days', direction: 'down' });
    expect(mv.trend).toHaveLength(13);
    expect(mv.variance_to_target).toBeCloseTo(mv.value! - mv.target!, 9);
    expect(['On target', 'Watch', 'Off target']).toContain(mv.status);
  });
});

describe('data version check', () => {
  it('rejects data files from an older version with a clear message', async () => {
    const { buildDataset, DataVersionError } = await import('../src/data/model');
    const old = { dims: { client: { key: 0, name: 'x' }, facilities: [] }, meta: {}, accounts: {}, ar: {}, dnfb: {}, access: {}, ops: {} };
    expect(() => buildDataset(old as never)).toThrow(DataVersionError);
    expect(() => buildDataset(old as never)).toThrow(/Reload the page without the cache/);
  });
});
