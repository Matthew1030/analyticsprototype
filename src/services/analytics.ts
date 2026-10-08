// Analytics service: the single seam between the UI and the data.
// Pages call these functions only (never the engine directly for metric values), so the
// prototype's in-browser engine can be replaced by API calls returning the same contracts.

import { isoDay, monthKey, shortMonthLabel } from '../data/dates';
import type { Dataset } from '../data/model';
import { FACILITY_TYPES, type Engine, type Selections } from '../engine/engine';
import { evaluate, metric, type MetricDef, type Range } from '../engine/metrics';
import { comparePeriod, monthPeriod, priorYearPeriod, type CompareMode, type Period } from '../engine/periods';
import { changeOf, statusOf } from '../engine/status';
import type { AccountRow, BreakdownRow, DimensionId, MetricValue, TrendPoint } from './contracts';

export interface Member { key: number; label: string; sub?: string }

export const DIMENSION_LABEL: Record<DimensionId, string> = {
  facility: 'Hospital', region: 'Region', facilityType: 'Facility type', payer: 'Payer',
  financialClass: 'Financial class', serviceLine: 'Service line', patientType: 'Patient type',
  denialCategory: 'Denial category', rootCause: 'Root cause', editCategory: 'Edit category',
  dnfbHold: 'DNFB hold reason', arAge: 'Aging bucket', accountStatus: 'Account status',
};

/** Members of a dimension. Child dimensions follow the parent filter (payer follows financial class). */
export function members(ds: Dataset, dim: DimensionId, sel: Selections = {}): Member[] {
  const d = ds.dims;
  switch (dim) {
    case 'facility': return d.facilities
      .filter((f) => (!sel.region?.length || sel.region.includes(f.region)) && (!sel.facilityType?.length || sel.facilityType.includes(FACILITY_TYPES.indexOf(f.type))))
      .map((f) => ({ key: f.key, label: f.short, sub: `${d.regions[f.region]} · ${f.type} · ${f.beds} beds` }));
    case 'region': return d.regions.map((n, i) => ({ key: i, label: n }));
    case 'facilityType': return FACILITY_TYPES.map((n, i) => ({ key: i, label: n }));
    case 'payer': return d.payers.filter((p) => !sel.financialClass?.length || sel.financialClass.includes(p.fc))
      .map((p) => ({ key: p.key, label: p.name, sub: d.financialClasses[p.fc] }));
    case 'financialClass': return d.financialClasses.map((n, i) => ({ key: i, label: n }));
    case 'serviceLine': return d.serviceLines.filter((s) => !sel.patientType?.length || sel.patientType.includes(d.patientTypes.indexOf(s.patientType)))
      .map((s) => ({ key: s.key, label: s.name, sub: s.patientType }));
    case 'patientType': return d.patientTypes.map((n, i) => ({ key: i, label: n }));
    case 'denialCategory': return d.denialCategories.map((c) => ({ key: c.key, label: c.name, sub: c.owner }));
    case 'rootCause': return d.rootCauses.filter((r) => !sel.denialCategory?.length || sel.denialCategory.includes(r.category))
      .map((r) => ({ key: r.key, label: r.name, sub: d.denialCategories[r.category].name }));
    case 'editCategory': return d.editCategories.map((c) => ({ key: c.key, label: c.name, sub: c.owner }));
    case 'dnfbHold': return d.dnfbHolds.map((h) => ({ key: h.key, label: h.name, sub: h.owner }));
    case 'arAge': return d.arAge.map((a) => ({ key: a.key, label: a.name }));
    case 'accountStatus': return d.accountStatus.map((n, i) => ({ key: i, label: n }));
  }
}

export function memberLabel(ds: Dataset, dim: DimensionId, key: number): string {
  return members(ds, dim).find((m) => m.key === key)?.label ?? String(key);
}

const isAdditive = (m: MetricDef) => m.unit === 'usd' || m.unit === 'count';

/** One metric value with comparison, target, status and an n-month trend. */
export function metricValue(e: Engine, id: string, period: Period, compare: CompareMode, sel: Selections, trendMonths = 13): MetricValue {
  const m = metric(id);
  const cur = evaluate(m, e, period, sel);
  const cp = comparePeriod(period, compare);
  const cmp = evaluate(m, e, cp, sel);
  const py = evaluate(m, e, priorYearPeriod(period), sel);
  return {
    metric: m.id, name: m.name, rcm_area: m.area, unit: m.unit, direction: m.direction,
    period: period.label, value: cur.value, compare_period: cp.label, compare_value: cmp.value,
    change: cur.value !== null && cmp.value !== null ? cur.value - cmp.value : null,
    change_kind: changeOf(cur.value, cmp.value, m.direction),
    prior_year_value: py.value, target: cur.target, watch_threshold: cur.watch,
    variance_to_target: cur.value !== null && cur.target !== null ? cur.value - cur.target : null,
    status: statusOf(cur.value, cur.target, m.direction, cur.watch),
    trend: trendMonths ? trend(e, id, period.endMi, trendMonths, sel) : [],
    no_data_reason: cur.noData,
  };
}

/** Monthly trend ending at endMi, with target, prior year and a rolling 3-month value. */
export function trend(e: Engine, id: string, endMi: number, months: number, sel: Selections): TrendPoint[] {
  const m = metric(id);
  const first = e.ds.meta.windowStartMonth;
  const out: TrendPoint[] = [];
  for (let mi = endMi - months + 1; mi <= endMi; mi++) {
    if (mi < first) continue;
    const p = monthPeriod(mi);
    const v = evaluate(m, e, p, sel);
    const pyOk = mi - 12 >= first;
    const r3: Range = { startDay: monthPeriod(mi - 2).startDay, endDay: p.endDay, startMi: mi - 2, endMi: mi };
    out.push({
      period: monthKey(mi), label: shortMonthLabel(mi), value: v.value, target: v.target,
      prior_year: pyOk ? evaluate(m, e, monthPeriod(mi - 12), sel).value : null,
      rolling_3: mi - 2 >= first ? (m.type === 'balance' ? avg3(m, e, mi, sel) : evaluate(m, e, r3, sel).value) : null,
    });
  }
  return out;
}

function avg3(m: MetricDef, e: Engine, mi: number, sel: Selections) {
  const vals = [0, 1, 2].map((k) => evaluate(m, e, monthPeriod(mi - k), sel).value);
  return vals.some((v) => v === null) ? null : (vals as number[]).reduce((a, b) => a + b, 0) / 3;
}

/** A metric split by the members of one dimension, with comparison and contribution. */
export function breakdown(e: Engine, id: string, dim: DimensionId, period: Period, compare: CompareMode, sel: Selections): BreakdownRow[] {
  const m = metric(id);
  const cp = comparePeriod(period, compare);
  const chosen = sel[dim] ?? [];
  const list = members(e.ds, dim, sel).filter((x) => chosen.length <= 1 || chosen.includes(x.key));
  const base = { ...sel, [dim]: [] };
  const total = isAdditive(m) ? evaluate(m, e, period, chosen.length > 1 ? sel : base).value : null;
  return list.map((x) => {
    const s = { ...sel, [dim]: [x.key] };
    const cur = evaluate(m, e, period, s);
    const cmp = evaluate(m, e, cp, s);
    const change = cur.value !== null && cmp.value !== null ? cur.value - cmp.value : null;
    return {
      key: x.key, label: x.label, value: cur.value, compare_value: cmp.value, change,
      target: cur.target, status: statusOf(cur.value, cur.target, m.direction, cur.watch),
      share: total && cur.value !== null ? cur.value / total : null,
      contribution: isAdditive(m) ? change : null,
    };
  });
}

/** Status label for display (null = no target). */
export function statusText(s: MetricValue['status']) {
  return s ?? 'No target';
}

// ---------- account drill-through ----------

export interface AccountQuery {
  mode: 'open' | 'denied' | 'dnfb';
  day: number; // snapshot day for open accounts; end day for event lists
  start?: number;
  arAge?: number[];
  accountStatus?: number[];
}

/** Accounts behind an aggregate (no patient identifiers). Balances are per sampled account. */
export function accounts(e: Engine, q: AccountQuery, sel: Selections, limit = 500): AccountRow[] {
  const ds = e.ds;
  const c = ds.acc;
  const d = ds.dims;
  const age = q.arAge?.length ? q.arAge.map((k) => d.arAge[k]) : null;
  let idx: number[];
  if (q.mode === 'open') {
    idx = e.openAccounts(q.day, sel, (i) => {
      const a = q.day - c.dd[i];
      if (age && !age.some((b) => a >= b.min && a <= b.max)) return false;
      if (q.accountStatus?.length && !q.accountStatus.includes(statusAt(e, i, q.day))) return false;
      return true;
    });
  } else if (q.mode === 'dnfb') {
    idx = e.openAccounts(q.day, sel, (i) => c.fbd[i] === -1 || c.fbd[i] > q.day);
  } else {
    idx = e.accountsByDate('denD', q.start ?? q.day - 30, q.day, sel, 'denial');
  }
  const rows = idx.map((i) => {
    const cash = c.pos[i] + (c.payD[i] !== -1 && c.payD[i] <= q.day ? c.payAmt[i] : 0);
    const st = statusAt(e, i, q.day);
    const last = Math.max(c.dd[i], c.fbd[i], c.sbd[i], c.denD[i], c.payD[i] <= q.day ? c.payD[i] : -1);
    return {
      i,
      row: {
        account_id: `A${Math.round(c.id[i])}`,
        facility: d.facilities[c.fac[i]].short,
        payer: d.payers[c.payer[i]].name,
        financial_class: d.financialClasses[c.fc[i]],
        service_line: d.serviceLines[c.svc[i]].name,
        discharge_date: isoDay(c.dd[i]),
        days_since_discharge: q.day - c.dd[i],
        gross_charges: c.gross[i],
        balance: q.mode === 'denied' ? c.denAmt[i] : Math.max(0, c.gross[i] - cash),
        status: q.mode === 'denied' ? deniedStatus(e, i) : d.accountStatus[st],
        denial_root_cause: c.rc[i] >= 0 ? d.rootCauses[c.rc[i]].name : null,
        last_activity: isoDay(last),
      } as AccountRow,
    };
  });
  rows.sort((a, b) => b.row.balance - a.row.balance);
  return rows.slice(0, limit).map((r) => r.row);
}

function statusAt(e: Engine, i: number, day: number): number {
  const c = e.ds.acc;
  if (c.fbd[i] === -1 || c.fbd[i] > day) return 0;
  if (c.sbd[i] === -1 || c.sbd[i] > day) return 1;
  if (c.fc[i] === 6) return 6;
  if (c.denD[i] !== -1 && c.denD[i] <= day) return c.apl[i] ? 3 : 4;
  if (c.pend[i] && day - c.sbd[i] > 30) return 5;
  return 2;
}

function deniedStatus(e: Engine, i: number): string {
  const c = e.ds.acc;
  if (c.woD[i] !== -1) return 'Written off';
  if (c.payD[i] !== -1) return c.apl[i] ? 'Overturned on appeal' : 'Corrected and paid';
  return c.apl[i] ? 'In appeal' : 'Open, rework';
}

/** Count of accounts behind an aggregate, scaled to the full population. */
export function populationCount(e: Engine, sampleCount: number) {
  return sampleCount * e.weight;
}
