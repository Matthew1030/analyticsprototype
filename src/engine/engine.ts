// Aggregation layer. Every metric is built from these sums at run time,
// the same way a Qlik expression sums base fields over the current selection.

import type { Dataset } from '../data/model';

export type CoreField = 'facility' | 'payer' | 'financialClass' | 'serviceLine';
export type DetailField = 'denialCategory' | 'editCategory' | 'writeOffReason' | 'dnfbHold' | 'arAge';
export type SelField = CoreField | DetailField;
export type Selections = Partial<Record<SelField, number[]>>;

export type FactName = 'claims' | 'ar' | 'dnfb' | 'fe' | 'wq';

/** Core fields that each fact carries. A selection on a missing field gives no data (as in Qlik). */
const FACT_FIELDS: Record<FactName, CoreField[]> = {
  claims: ['facility', 'payer', 'financialClass', 'serviceLine'],
  ar: ['facility', 'payer', 'financialClass', 'serviceLine'],
  dnfb: ['facility', 'serviceLine'],
  fe: ['facility'],
  wq: ['facility'],
};

export const FIELD_LABEL: Record<SelField, string> = {
  facility: 'Facility', payer: 'Payer', financialClass: 'Financial class', serviceLine: 'Service line',
  denialCategory: 'Denial category', editCategory: 'Edit category', writeOffReason: 'Write-off reason',
  dnfbHold: 'DNFB hold reason', arAge: 'A/R age bucket',
};

const active = (s: Selections, f: SelField) => (s[f]?.length ?? 0) > 0;

/** Returns the names of selected fields that the fact does not carry, or [] if the fact can answer. */
export function missingFields(fact: FactName, sel: Selections): CoreField[] {
  const has = FACT_FIELDS[fact];
  return (['facility', 'payer', 'financialClass', 'serviceLine'] as CoreField[]).filter(
    (f) => active(sel, f) && !has.includes(f),
  );
}

export type DetailKind = 'none' | 'denial' | 'edit' | 'writeoff';
export type RowPred = 'all' | 'selfPay';

export interface SnapFilter {
  billed?: number[];
  ageMin?: number; // A/R or DNFB age bucket key, inclusive
  stage?: number; // DNFB stage: 0 = DNFB, 1 = DNSP
  task?: number;
}

export class Engine {
  readonly ds: Dataset;
  readonly baseDay: number;
  readonly lastDay: number;
  private cache = new Map<string, unknown>();
  private byDay: Record<'ar' | 'dnfb' | 'fe', Map<number, number[]>>;
  private payerFc: Int32Array;
  private reasonCat: Int32Array;

  constructor(ds: Dataset) {
    this.ds = ds;
    let min = Infinity;
    const dd = ds.claims.dd;
    for (let i = 0; i < ds.claims.n; i++) if (dd[i] < min) min = dd[i];
    this.baseDay = min - 400;
    this.lastDay = ds.meta.asOfDay;
    this.payerFc = Int32Array.from(ds.dims.payers.map((p) => p.fc));
    this.reasonCat = Int32Array.from(ds.dims.denialReasons.map((r) => r.category));
    this.byDay = { ar: indexByDay(ds.ar.day, ds.ar.n), dnfb: indexByDay(ds.dnfb.day, ds.dnfb.n), fe: indexByDay(ds.fe.day, ds.fe.n) };
  }

  private memo<T>(key: string, fn: () => T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    if (this.cache.size > 20000) this.cache.clear();
    const v = fn();
    this.cache.set(key, v);
    return v;
  }

  /** Row filter for the core fields (and detail fields that the fact carries). */
  private rowOk(fact: FactName, sel: Selections, detail: DetailKind) {
    const set = (f: SelField) => (active(sel, f) ? new Set(sel[f]) : null);
    const fac = set('facility'), pay = set('payer'), fc = set('financialClass'), svc = set('serviceLine');
    const ds = this.ds;
    const pfc = this.payerFc, rc = this.reasonCat;
    if (fact === 'claims') {
      const c = ds.claims;
      const den = detail === 'denial' ? set('denialCategory') : null;
      const ed = detail === 'edit' ? set('editCategory') : null;
      const wo = detail === 'writeoff' ? set('writeOffReason') : null;
      return (i: number) =>
        (!fac || fac.has(c.fac[i])) && (!pay || pay.has(c.payer[i])) && (!fc || fc.has(pfc[c.payer[i]])) &&
        (!svc || svc.has(c.svc[i])) && (!den || (c.denR[i] >= 0 && den.has(rc[c.denR[i]]))) &&
        (!ed || ed.has(c.edit[i])) && (!wo || wo.has(c.woR[i]));
    }
    if (fact === 'ar') {
      const a = ds.ar;
      const age = set('arAge');
      return (i: number) =>
        (!fac || fac.has(a.fac[i])) && (!pay || pay.has(a.payer[i])) && (!fc || fc.has(pfc[a.payer[i]])) &&
        (!svc || svc.has(a.svc[i])) && (!age || age.has(a.age[i]));
    }
    if (fact === 'dnfb') {
      const d = ds.dnfb;
      const hold = set('dnfbHold');
      return (i: number) => (!fac || fac.has(d.fac[i])) && (!svc || svc.has(d.svc[i])) && (!hold || hold.has(d.hold[i]));
    }
    const f = fact === 'fe' ? ds.fe : ds.wq;
    return (i: number) => !fac || fac.has(f.fac[i]);
  }

  /**
   * Prefix-sum series of a claims, front-end or work-queue value by a date column.
   * Rows with no date (-1) are left out.
   */
  private series(fact: 'claims' | 'fe' | 'wq', col: string, dateCol: string, sel: Selections, detail: DetailKind, pred: RowPred, task = -1): Float64Array {
    const key = `S|${fact}|${col}|${dateCol}|${detail}|${pred}|${task}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const f = this.ds[fact] as unknown as Record<string, Float64Array> & { n: number };
      const ok = this.rowOk(fact, sel, detail);
      const len = this.lastDay - this.baseDay + 2;
      const daily = new Float64Array(len);
      const dates = f[dateCol];
      const vals = col === '__one' ? null : f[col];
      const payer = fact === 'claims' ? f.payer : null;
      const tasks = fact === 'wq' ? f.task : null;
      for (let i = 0; i < f.n; i++) {
        const d = dates[i];
        if (d < 0 || d > this.lastDay) continue;
        if (pred === 'selfPay' && payer && this.payerFc[payer[i]] !== 6) continue;
        if (tasks && task >= 0 && tasks[i] !== task) continue;
        if (vals && vals[i] < 0) continue;
        if (!ok(i)) continue;
        daily[d - this.baseDay + 1] += vals ? vals[i] : 1;
      }
      for (let i = 1; i < len; i++) daily[i] += daily[i - 1];
      return daily;
    });
  }

  /** Sum of a value between two days (inclusive). */
  sum(fact: 'claims' | 'fe' | 'wq', col: string, dateCol: string, start: number, end: number, sel: Selections,
    opts: { detail?: DetailKind; pred?: RowPred; task?: number } = {}): number {
    const s = this.series(fact, col, dateCol, sel, opts.detail ?? 'none', opts.pred ?? 'all', opts.task ?? -1);
    const a = Math.max(start, this.baseDay) - this.baseDay;
    const b = Math.min(end, this.lastDay) - this.baseDay + 1;
    if (b <= a) return 0;
    return s[b] - s[a];
  }

  /** Sum of a snapshot value (A/R, DNFB, open orders) on one snapshot day. */
  snapshot(fact: 'ar' | 'dnfb' | 'fe', col: string, day: number, sel: Selections, filter: SnapFilter = {}): number {
    const key = `P|${fact}|${col}|${day}|${JSON.stringify(filter)}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const rows = this.byDay[fact].get(day);
      if (!rows) return 0;
      const f = this.ds[fact] as unknown as Record<string, Float64Array>;
      const ok = this.rowOk(fact, sel, 'none');
      const billed = filter.billed ? new Set(filter.billed) : null;
      let total = 0;
      for (const i of rows) {
        if (billed && !billed.has(f.billed[i])) continue;
        if (filter.ageMin !== undefined && f.age[i] < filter.ageMin) continue;
        if (filter.stage !== undefined && f.stage[i] !== filter.stage) continue;
        if (f[col][i] < 0 || !ok(i)) continue;
        total += f[col][i];
      }
      return total;
    });
  }

  /** Cash posted in a date range, split by days from discharge to posting (A/R age buckets). */
  cashByAge(start: number, end: number, sel: Selections): number[] {
    const key = `CA|${start}|${end}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const c = this.ds.claims;
      const buckets = this.ds.dims.arAge;
      const out = buckets.map(() => 0);
      const ok = this.rowOk('claims', sel, 'none');
      const bucketOf = (age: number) => buckets.findIndex((b) => age >= b.min && age <= b.max);
      for (let i = 0; i < c.n; i++) {
        const pd = c.payD[i];
        const hasPay = pd >= start && pd <= end && c.payAmt[i] > 0;
        const hasPos = c.dd[i] >= start && c.dd[i] <= end && c.pos[i] > 0;
        if (!hasPay && !hasPos) continue;
        if (!ok(i)) continue;
        if (hasPay) out[bucketOf(pd - c.dd[i])] += c.payAmt[i];
        if (hasPos) out[0] += c.pos[i];
      }
      return out;
    });
  }

  /** True if the fact has any rows for this selection (ignores dates). */
  hasRows(fact: FactName, sel: Selections): boolean {
    if (missingFields(fact, sel).length) return false;
    const key = `H|${fact}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const f = this.ds[fact] as unknown as { n: number };
      const ok = this.rowOk(fact, sel, 'none');
      if (fact === 'fe') {
        const fe = this.ds.fe;
        for (let i = 0; i < fe.n; i++) if (ok(i) && (fe.ordersReceived[i] >= 0 || fe.callsOffered[i] >= 0)) return true;
        return false;
      }
      for (let i = 0; i < f.n; i++) if (ok(i)) return true;
      return false;
    });
  }

  /** Front-end facts: -1 means the facility has no such service. */
  feHasCol(col: string, sel: Selections): boolean {
    const key = `FC|${col}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const fe = this.ds.fe as unknown as Record<string, Float64Array> & { n: number };
      const ok = this.rowOk('fe', sel, 'none');
      for (let i = 0; i < fe.n; i++) if (ok(i) && fe[col][i] >= 0) return true;
      return false;
    });
  }

  /** Latest snapshot day that is on or before the given day. */
  snapshotDayOnOrBefore(fact: 'ar' | 'dnfb', day: number): number | null {
    let best: number | null = null;
    for (const d of this.byDay[fact].keys()) if (d <= day && (best === null || d > best)) best = d;
    return best;
  }

  snapshotDays(fact: 'ar' | 'dnfb'): number[] {
    return [...this.byDay[fact].keys()].sort((a, b) => a - b);
  }

  clearCache() {
    this.cache.clear();
  }
}

function indexByDay(days: Float64Array, n: number): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const d = days[i];
    let arr = m.get(d);
    if (!arr) { arr = []; m.set(d, arr); }
    arr.push(i);
  }
  return m;
}
