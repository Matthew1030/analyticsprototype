import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { METRICS, evaluate } from '../src/engine/metrics';
import { monthPeriod, quarterOfMonth, quarterPeriod, trailing } from '../src/engine/periods';
import { changeOf, statusOf } from '../src/engine/status';
import { loadDataset } from './loadDataset';

const ds = loadDataset();
const e = new Engine(ds);
const last = monthPeriod(ds.meta.endMonth);
const lastQ = quarterPeriod(quarterOfMonth(ds.meta.endMonth));
const facKeys = ds.dims.facilities.map((f) => f.key);
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6 * Math.max(1, Math.abs(b)));

describe('data files', () => {
  it('stay small enough to load in a few seconds', () => {
    const dir = join(__dirname, '..', 'public', 'data');
    const total = ['dims', 'meta', 'claims', 'ar', 'dnfb', 'workqueue', 'frontend']
      .reduce((s, f) => s + statSync(join(dir, `${f}.json`)).size, 0);
    expect(total).toBeLessThan(16e6);
  });

  it('cover 24 months that end at the configured month', () => {
    expect(ds.meta.endMonth - ds.meta.windowStartMonth + 1).toBe(24);
  });

  it('contain no patient identifiers', () => {
    expect(Object.keys(ds.claims)).not.toEqual(expect.arrayContaining(['name', 'mrn', 'dob', 'ssn', 'patient']));
  });
});

describe('every starter metric is computable from the data', () => {
  const skip = new Set(['M28', 'M29']); // calculated across facilities in the ranking (tested below)
  for (const m of METRICS.filter((x) => !skip.has(x.id))) {
    it(`${m.id} ${m.name}`, () => {
      for (const r of [last, lastQ, monthPeriod(ds.meta.windowStartMonth)]) {
        const res = evaluate(m, e, r, {});
        expect(res.noData).toBeUndefined();
        expect(Number.isFinite(res.value)).toBe(true);
      }
    });
  }

  it('front-end metrics give a no-data reason for a facility with no such service', () => {
    const noOrders = facKeys.find((f) => !e.feHasCol('ordersReceived', { facility: [f] }));
    expect(noOrders).toBeDefined();
    const res = evaluate(METRICS.find((m) => m.id === 'M32')!, e, last, { facility: [noOrders!] });
    expect(res.value).toBeNull();
    expect(res.noData).toBeTruthy();
  });

  it('a payer selection gives a no-data reason on facts without a payer field', () => {
    const res = evaluate(METRICS.find((m) => m.id === 'M01')!, e, last, { payer: [0] });
    expect(res.value).toBeNull();
    expect(res.noData).toMatch(/payer/);
  });
});

describe('reconciliation', () => {
  it('claim totals equal facility totals, and facility totals equal system totals', () => {
    for (const p of trailing(last, 24)) {
      let raw = 0;
      const c = ds.claims;
      for (let i = 0; i < c.n; i++) if (c.dd[i] >= p.startDay && c.dd[i] <= p.endDay) raw += c.gross[i];
      const system = e.sum('claims', 'gross', 'dd', p.startDay, p.endDay, {});
      const byFacility = facKeys.reduce((s, f) => s + e.sum('claims', 'gross', 'dd', p.startDay, p.endDay, { facility: [f] }), 0);
      close(system, raw);
      close(byFacility, system);
    }
  });

  it('cash, denials and write-offs by facility sum to the system', () => {
    for (const [col, date] of [['payAmt', 'payD'], ['denAmt', 'denD'], ['woAmt', 'woD'], ['bdAmt', 'bdD']] as const) {
      const sys = e.sum('claims', col, date, lastQ.startDay, lastQ.endDay, {});
      const byFac = facKeys.reduce((s, f) => s + e.sum('claims', col, date, lastQ.startDay, lastQ.endDay, { facility: [f] }), 0);
      close(byFac, sys);
    }
  });

  it('A/R buckets sum to total A/R, and facilities sum to the system', () => {
    for (const day of e.snapshotDays('ar').slice(-24)) {
      const total = e.snapshot('ar', 'gross', day, {});
      const buckets = ds.dims.arAge.reduce((s, b) => s + e.snapshot('ar', 'gross', day, { arAge: [b.key] }), 0);
      const facilities = facKeys.reduce((s, f) => s + e.snapshot('ar', 'gross', day, { facility: [f] }), 0);
      const billed = [0, 1, 2].reduce((s, b) => s + e.snapshot('ar', 'gross', day, {}, { billed: [b] }), 0);
      close(buckets, total);
      close(facilities, total);
      close(billed, total);
    }
  });

  it('DNFB age buckets sum to total DNFB', () => {
    for (const day of e.snapshotDays('dnfb').slice(-30)) {
      const total = e.snapshot('dnfb', 'amount', day, {}, { stage: 0 });
      let sum = 0;
      for (let i = 0; i < ds.dnfb.n; i++) if (ds.dnfb.day[i] === day && ds.dnfb.stage[i] === 0) sum += ds.dnfb.amount[i];
      close(total, sum);
    }
  });

  it('combined ratios come from summed values, not from an average of facility ratios', () => {
    const m = METRICS.find((x) => x.id === 'M05')!;
    const sys = evaluate(m, e, last, {}).value!;
    let clean = 0;
    let sub = 0;
    const rates: number[] = [];
    for (const f of facKeys) {
      const c = e.sum('claims', 'clean', 'sbd', last.startDay, last.endDay, { facility: [f] });
      const s = e.sum('claims', '__one', 'sbd', last.startDay, last.endDay, { facility: [f] });
      clean += c; sub += s; rates.push(c / s);
    }
    close(sys, clean / sub);
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(Math.abs(sys - avg)).toBeGreaterThan(1e-6);
  });

  it('a quarter value equals the summed months, not the average of monthly ratios', () => {
    const m = METRICS.find((x) => x.id === 'M07')!;
    const q = evaluate(m, e, lastQ, {}).value!;
    let den = 0;
    let gross = 0;
    for (let mi = lastQ.startMi; mi <= lastQ.endMi; mi++) {
      const p = monthPeriod(mi);
      den += e.sum('claims', 'denAmt', 'denD', p.startDay, p.endDay, {});
      gross += e.sum('claims', 'gross', 'dd', p.startDay, p.endDay, {});
    }
    close(q, den / gross);
  });
});

describe('planted patterns trace to a cause', () => {
  const denialRate = (sel: object) => evaluate(METRICS.find((x) => x.id === 'M07')!, e, lastQ, sel).value!;

  it('Hospital A has the highest denial rate, driven by Medicare Managed coordination of benefits', () => {
    const rates = facKeys.map((f) => denialRate({ facility: [f] }));
    expect(rates.indexOf(Math.max(...rates))).toBe(0);
    const cob = e.sum('claims', 'denAmt', 'denD', lastQ.startDay, lastQ.endDay, { facility: [0], financialClass: [1], denialCategory: [0] }, { detail: 'denial' });
    const all = e.sum('claims', 'denAmt', 'denD', lastQ.startDay, lastQ.endDay, { facility: [0] });
    expect(cob / all).toBeGreaterThan(0.4);
  });

  it('Hospital C has the most aged billed insurance A/R, in All Other payers', () => {
    const m = METRICS.find((x) => x.id === 'M13')!;
    const year = { startDay: trailing(last, 12)[0].startDay, endDay: last.endDay, startMi: last.endMi - 11, endMi: last.endMi };
    const vals = facKeys.map((f) => evaluate(m, e, year, { facility: [f] }).value!);
    expect(vals.indexOf(Math.max(...vals))).toBe(2);
    const allOther = evaluate(m, e, year, { facility: [2], financialClass: [5] }).value!;
    expect(allOther).toBeGreaterThan(0.45);
  });

  it('Commercial Plan B has the lowest insured cash % NPSR over 12 months', () => {
    const m = METRICS.find((x) => x.id === 'M22')!;
    const year = { startDay: trailing(last, 12)[0].startDay, endDay: last.endDay, startMi: last.endMi - 11, endMi: last.endMi };
    const insured = ds.dims.payers.filter((p) => p.fc !== 6);
    const vals = insured.map((p) => evaluate(m, e, year, { payer: [p.key] }).value!);
    expect(insured[vals.indexOf(Math.min(...vals))].name).toBe('Commercial Plan B');
  });

  it('Hospitals B and E hold the most DNFB dollars aged 11+ days relative to their size', () => {
    const m = METRICS.find((x) => x.id === 'M03')!;
    const vals = facKeys.map((f) => {
      let s = 0;
      for (const p of trailing(last, 6)) s += evaluate(m, e, p, { facility: [f] }).value ?? 0;
      return s;
    });
    const top2 = [...vals.keys()].sort((a, b) => vals[b] - vals[a]).slice(0, 2).sort();
    expect(top2).toEqual([1, 4]);
  });
});

describe('status and change logic', () => {
  it('uses the target, the band and the direction', () => {
    expect(statusOf(3.9, 4, 'down', 0.1)).toBe('On Track');
    expect(statusOf(4.3, 4, 'down', 0.1)).toBe('At Risk');
    expect(statusOf(4.5, 4, 'down', 0.1)).toBe('Off Track');
    expect(statusOf(0.95, 0.9, 'up', 0.1)).toBe('On Track');
    expect(statusOf(0.82, 0.9, 'up', 0.1)).toBe('At Risk');
    expect(statusOf(0.7, 0.9, 'up', 0.1)).toBe('Off Track');
    expect(statusOf(0.7, null, 'up', 0.1)).toBeNull();
  });

  it('shows change as favorable or unfavorable by direction', () => {
    expect(changeOf(5, 6, 'down')).toBe('Favorable');
    expect(changeOf(5, 6, 'up')).toBe('Unfavorable');
    expect(changeOf(5, 6, 'none')).toBeNull();
  });
});

describe('composite facility score', () => {
  it('equals 100 x (N - average rank) / (N - 1) over five metric ranks', async () => {
    const { rankFacilities } = await import('../src/engine/ranking');
    const rows = rankFacilities(e, last, {}, ds.dims.facilities);
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      const ranks = r.ranks.filter((x): x is number => x !== null);
      const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      close(r.score!, (100 * (10 - avg)) / 9);
    }
    expect(rows[0].score).toBeGreaterThanOrEqual(rows[9].score!);
  });
});
