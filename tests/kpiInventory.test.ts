// Client KPI inventory: coverage map and the metrics added for it.

import { describe, expect, it } from 'vitest';
import { KPI_COVERAGE } from '../src/config/kpiCoverage';
import { Engine } from '../src/engine/engine';
import { FRAMEWORK_METRICS } from '../src/engine/framework';
import { APPEAL_STATUSES, appealStatusCounts, evaluate, METRIC_BY_ID } from '../src/engine/metrics';
import { monthPeriod } from '../src/engine/periods';
import { loadDataset } from './loadDataset';

const ds = loadDataset();
const e = new Engine(ds);
const last = monthPeriod(ds.meta.endMonth);
const v = (id: string, sel = {}) => evaluate(METRIC_BY_ID[id], e, last, sel).value!;

describe('client KPI coverage map', () => {
  it('has every row of the client sheet (73)', () => {
    expect(KPI_COVERAGE).toHaveLength(73);
  });

  it('points only at catalog metrics', () => {
    for (const k of KPI_COVERAGE) for (const id of k.metrics) expect(METRIC_BY_ID[id], `${k.kpi} → ${id}`).toBeDefined();
  });

  it('names the data to supply for every proxy and source-needed KPI', () => {
    for (const k of KPI_COVERAGE.filter((x) => x.coverage === 'Proxy' || x.coverage === 'Source needed')) expect(k.source, k.kpi).toBeTruthy();
  });

  it('gives a metric or a view for every KPI the data can answer', () => {
    for (const k of KPI_COVERAGE.filter((x) => x.coverage === 'Metric' || x.coverage === 'Proxy')) expect(k.metrics.length, k.kpi).toBeGreaterThan(0);
  });

  it('does not use an ELT framework metric id for a new KPI metric', () => {
    const elt = new Set(FRAMEWORK_METRICS.map((m) => m.id));
    for (const id of ['credit_balance_dollars', 'dnsp_dollars', 'contractual_adj_dollars', 'service_month_yield']) expect(elt.has(id)).toBe(false);
  });
});

describe('KPI inventory metrics are consistent', () => {
  it('72-hour windows are stricter than the before-service rates', () => {
    expect(v('prereg_rate_72h')).toBeLessThan(v('prereg_rate'));
    expect(v('fin_clearance_rate_72h')).toBeLessThan(v('fin_clearance_rate'));
  });

  it('all-line call measures include the patient access line', () => {
    expect(v('call_volume_total')).toBeGreaterThan(v('call_volume') + v('calls_outbound'));
    const all = v('call_abandon_rate_all');
    const lo = Math.min(v('call_abandon_rate'), v('cbo_call_abandon_rate'));
    const hi = Math.max(v('call_abandon_rate'), v('cbo_call_abandon_rate'));
    expect(all).toBeGreaterThanOrEqual(lo);
    expect(all).toBeLessThanOrEqual(hi);
  });

  it('shares stay between 0 and 1', () => {
    for (const id of ['open_orders_24h_pct', 'lead_time_3plus_pct', 'scheduled_under_72h_pct', 'pos_yield', 'pos_estimate_accuracy',
      'pos_missed_residual_pct', 'medicaid_screening_rate', 'medicaid_eligible_completion', 'first_pass_yield', 'appeal_upheld_rate',
      'retraction_pct_cash', 'scheduled_rate_final', 'missed_charge_rate']) {
      expect(v(id), id).toBeGreaterThan(0);
      expect(v(id), id).toBeLessThan(1);
    }
  });

  it('upheld and overturned appeals add up to all resolved appeals', () => {
    expect(v('appeal_upheld_rate') + v('appeal_success')).toBeCloseTo(1, 9);
  });

  it('open appeals equal the appeal statuses, and the status split covers every open denial', () => {
    const st = appealStatusCounts(e, last.endDay, {});
    expect(st).toHaveLength(APPEAL_STATUSES.length);
    expect(v('appeals_open')).toBe(st[1] + st[2] + st[3]);
    const open = e.accountTotal('test-open-den', {}, 'denial', (i) => {
      const a = ds.acc;
      return a.denD[i] >= 0 && a.denD[i] <= last.endDay && (a.closeD[i] === -1 || a.closeD[i] > last.endDay) ? 1 : 0;
    });
    expect(st.reduce((a, b) => a + b, 0)).toBeCloseTo(open, 6);
  });

  it('late charges $ and % agree with gross charges', () => {
    expect(v('late_charges_dollars') / v('gross_charges')).toBeCloseTo(v('late_charge_pct'), 9);
  });

  it('contractual adjustments $ and % agree', () => {
    expect(v('contractual_adj_dollars') / v('gross_charges')).toBeCloseTo(v('contractual_adj_pct'), 9);
  });

  it('first pass yield is below the clean claim rate', () => {
    expect(v('first_pass_yield')).toBeLessThan(v('clean_claim_rate'));
  });

  it('new front-end metrics give a no-data reason for a hospital without the service', () => {
    const noOrders = ds.dims.facilities.map((f) => f.key).find((f) => !e.feHasCol('ordersReceived', { facility: [f] }))!;
    expect(evaluate(METRIC_BY_ID.scheduled_rate_final, e, last, { facility: [noOrders] }).value).toBeNull();
    expect(evaluate(METRIC_BY_ID.open_orders_24h_pct, e, last, { facility: [noOrders] }).value).toBeNull();
  });
});
