// Aggregation layer. Every metric is built from these sums at run time, for the current
// filter context, so a ratio is always (sum of numerator) / (sum of denominator) and never an
// average of ratios. In production the same contract is served by the analytics data service.

import type { Dataset } from '../data/model';

/** Filter fields that every fact can carry. Region and facility type resolve to facilities. */
export type CoreField = 'facility' | 'region' | 'facilityType' | 'payer' | 'financialClass' | 'serviceLine' | 'patientType';
/** Fields that only some measures carry (applied only where they exist; never blank a visual). */
export type DetailField = 'denialCategory' | 'rootCause' | 'editCategory' | 'dnfbHold' | 'arAge' | 'accountStatus';
export type SelField = CoreField | DetailField;
export type Selections = Partial<Record<SelField, number[]>>;

export type FactName = 'acc' | 'ar' | 'dnfb' | 'fe' | 'ops';

export const CORE_FIELDS: CoreField[] = ['region', 'facilityType', 'facility', 'financialClass', 'payer', 'serviceLine', 'patientType'];

/** Core fields a fact carries. A filter on a missing field means "no data" for that fact. */
const FACT_FIELDS: Record<FactName, CoreField[]> = {
  acc: CORE_FIELDS,
  ar: CORE_FIELDS,
  dnfb: ['facility', 'region', 'facilityType', 'serviceLine', 'patientType'],
  fe: ['facility', 'region', 'facilityType'],
  ops: ['facility', 'region', 'facilityType'],
};

export const FIELD_LABEL: Record<SelField, string> = {
  facility: 'Hospital', region: 'Region', facilityType: 'Facility type', payer: 'Payer',
  financialClass: 'Financial class', serviceLine: 'Service line', patientType: 'Patient type',
  denialCategory: 'Denial category', rootCause: 'Root cause', editCategory: 'Claim edit category',
  dnfbHold: 'DNFB hold reason', arAge: 'A/R aging bucket', accountStatus: 'Account status',
};

/** Facility types, in display order. */
export const FACILITY_TYPES = ['Regional Referral', 'Community', 'Critical Access'];

const active = (s: Selections, f: SelField) => (s[f]?.length ?? 0) > 0;

/** Returns the selected fields that the fact does not carry, or [] if the fact can answer. */
export function missingFields(fact: FactName, sel: Selections): CoreField[] {
  const has = FACT_FIELDS[fact];
  return CORE_FIELDS.filter((f) => active(sel, f) && !has.includes(f));
}

export type DetailKind = 'none' | 'denial' | 'edit';
export type RowPred = 'all' | 'selfPay' | 'insured' | 'inpatient';

export interface SnapFilter {
  billed?: number[]; // 0 unbilled, 1 billed insurance, 2 billed self pay
  ageMin?: number; // A/R or DNFB age bucket key, inclusive
  ageMax?: number;
  stage?: number; // DNFB stage: 0 = DNFB, 1 = DNSP
}

/** Account status -> billed status (A/R). */
const BILLED_OF_STATUS = [0, 0, 1, 1, 1, 1, 2];

export class Engine {
  readonly ds: Dataset;
  readonly baseDay: number;
  readonly lastDay: number;
  readonly weight: number;
  private cache = new Map<string, unknown>();
  private byDay: Record<'ar' | 'dnfb' | 'fe' | 'ops', Map<number, number[]>>;
  private facRegion: Int32Array;
  private facType: Int32Array;
  private svcPt: Int32Array;
  private payerFc: Int32Array;

  constructor(ds: Dataset) {
    this.ds = ds;
    let min = Infinity;
    const dd = ds.acc.dd;
    for (let i = 0; i < ds.acc.n; i++) if (dd[i] < min) min = dd[i];
    this.baseDay = min - 400;
    this.lastDay = ds.meta.asOfDay;
    this.weight = ds.meta.sampleWeight;
    this.facRegion = Int32Array.from(ds.dims.facilities.map((f) => f.region));
    this.facType = Int32Array.from(ds.dims.facilities.map((f) => FACILITY_TYPES.indexOf(f.type)));
    this.svcPt = Int32Array.from(ds.dims.serviceLines.map((s) => ds.dims.patientTypes.indexOf(s.patientType)));
    this.payerFc = Int32Array.from(ds.dims.payers.map((p) => p.fc));
    this.byDay = {
      ar: indexByDay(ds.ar.day, ds.ar.n), dnfb: indexByDay(ds.dnfb.day, ds.dnfb.n),
      fe: indexByDay(ds.fe.day, ds.fe.n), ops: indexByDay(ds.ops.day, ds.ops.n),
    };
  }

  private memo<T>(key: string, fn: () => T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    if (this.cache.size > 30000) this.cache.clear();
    const v = fn();
    this.cache.set(key, v);
    return v;
  }

  /** Facilities allowed by the facility, region and facility type filters (null = all). */
  facilitySet(sel: Selections): Set<number> | null {
    if (!active(sel, 'facility') && !active(sel, 'region') && !active(sel, 'facilityType')) return null;
    const out = new Set<number>();
    for (const f of this.ds.dims.facilities) {
      if (active(sel, 'facility') && !sel.facility!.includes(f.key)) continue;
      if (active(sel, 'region') && !sel.region!.includes(this.facRegion[f.key])) continue;
      if (active(sel, 'facilityType') && !sel.facilityType!.includes(this.facType[f.key])) continue;
      out.add(f.key);
    }
    return out;
  }

  /** Service lines allowed by the service line and patient type filters (null = all). */
  private svcSet(sel: Selections): Set<number> | null {
    if (!active(sel, 'serviceLine') && !active(sel, 'patientType')) return null;
    const out = new Set<number>();
    this.ds.dims.serviceLines.forEach((s) => {
      if (active(sel, 'serviceLine') && !sel.serviceLine!.includes(s.key)) return;
      if (active(sel, 'patientType') && !sel.patientType!.includes(this.svcPt[s.key])) return;
      out.add(s.key);
    });
    return out;
  }

  /** Row filter for a fact under the current filters. */
  private rowOk(fact: FactName, sel: Selections, detail: DetailKind) {
    const set = (f: SelField) => (active(sel, f) ? new Set(sel[f]) : null);
    const fac = this.facilitySet(sel);
    const svc = this.svcSet(sel);
    const pay = set('payer'), fc = set('financialClass');
    const ds = this.ds;
    const pfc = this.payerFc;
    if (fact === 'acc') {
      const c = ds.acc;
      const cat = detail === 'denial' ? set('denialCategory') : null;
      const rc = detail === 'denial' ? set('rootCause') : null;
      const ed = detail === 'edit' ? set('editCategory') : null;
      return (i: number) =>
        (!fac || fac.has(c.fac[i])) && (!pay || pay.has(c.payer[i])) && (!fc || fc.has(c.fc[i])) &&
        (!svc || svc.has(c.svc[i])) && (!cat || cat.has(c.cat[i])) && (!rc || rc.has(c.rc[i])) &&
        (!ed || ed.has(c.edit[i]));
    }
    if (fact === 'ar') {
      const a = ds.ar;
      const age = set('arAge');
      const st = set('accountStatus');
      return (i: number) =>
        (!fac || fac.has(a.fac[i])) && (!pay || pay.has(a.payer[i])) && (!fc || fc.has(pfc[a.payer[i]])) &&
        (!svc || svc.has(a.svc[i])) && (!age || age.has(a.age[i])) && (!st || st.has(a.status[i]));
    }
    if (fact === 'dnfb') {
      const d = ds.dnfb;
      const hold = set('dnfbHold');
      return (i: number) => (!fac || fac.has(d.fac[i])) && (!svc || svc.has(d.svc[i])) && (!hold || hold.has(d.hold[i]));
    }
    const f = fact === 'fe' ? ds.fe : ds.ops;
    return (i: number) => !fac || fac.has(f.fac[i]);
  }

  private predOk(pred: RowPred) {
    const c = this.ds.acc;
    if (pred === 'selfPay') return (i: number) => c.fc[i] === 6;
    if (pred === 'insured') return (i: number) => c.fc[i] !== 6;
    if (pred === 'inpatient') return (i: number) => c.pt[i] === 0;
    return null;
  }

  /**
   * Prefix-sum series of a value by a date column. Rows with no date (-1) are left out.
   * Account values are scaled by the sample weight.
   */
  private series(fact: 'acc' | 'fe' | 'ops', col: string, dateCol: string, sel: Selections, detail: DetailKind, pred: RowPred): Float64Array {
    const key = `S|${fact}|${col}|${dateCol}|${detail}|${pred}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const f = this.ds[fact] as unknown as Record<string, Float64Array> & { n: number };
      const ok = this.rowOk(fact, sel, detail);
      const pOk = fact === 'acc' ? this.predOk(pred) : null;
      const len = this.lastDay - this.baseDay + 2;
      const daily = new Float64Array(len);
      const dates = f[dateCol];
      const vals = col === '__one' ? null : f[col];
      const w = fact === 'acc' ? this.weight : 1;
      for (let i = 0; i < f.n; i++) {
        const d = dates[i];
        if (d < 0 || d > this.lastDay || d < this.baseDay) continue;
        if (vals && vals[i] < 0) continue;
        if (pOk && !pOk(i)) continue;
        if (!ok(i)) continue;
        daily[d - this.baseDay + 1] += (vals ? vals[i] : 1) * w;
      }
      for (let i = 1; i < len; i++) daily[i] += daily[i - 1];
      return daily;
    });
  }

  /** Sum of a value between two days (inclusive). */
  sum(fact: 'acc' | 'fe' | 'ops', col: string, dateCol: string, start: number, end: number, sel: Selections,
    opts: { detail?: DetailKind; pred?: RowPred } = {}): number {
    const s = this.series(fact, col, dateCol, sel, opts.detail ?? 'none', opts.pred ?? 'all');
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
        if (billed && !billed.has(BILLED_OF_STATUS[f.status[i]])) continue;
        if (filter.ageMin !== undefined && f.age[i] < filter.ageMin) continue;
        if (filter.ageMax !== undefined && f.age[i] > filter.ageMax) continue;
        if (filter.stage !== undefined && f.stage[i] !== filter.stage) continue;
        if (f[col][i] < 0 || !ok(i)) continue;
        total += f[col][i];
      }
      return total;
    });
  }

  /** Snapshot totals split by one column of the snapshot (e.g. A/R by age bucket), one pass. */
  snapshotBy(fact: 'ar' | 'dnfb', col: string, by: string, day: number, sel: Selections, filter: SnapFilter = {}): Map<number, number> {
    const key = `PB|${fact}|${col}|${by}|${day}|${JSON.stringify(filter)}|${JSON.stringify(sel)}`;
    return this.memo(key, () => {
      const out = new Map<number, number>();
      const rows = this.byDay[fact].get(day);
      if (!rows) return out;
      const f = this.ds[fact] as unknown as Record<string, Float64Array>;
      const ok = this.rowOk(fact, sel, 'none');
      const groupCol = by === 'fc' ? null : f[by];
      for (const i of rows) {
        if (filter.stage !== undefined && f.stage[i] !== filter.stage) continue;
        if (filter.billed && !filter.billed.includes(BILLED_OF_STATUS[f.status[i]])) continue;
        if (!ok(i)) continue;
        const g = groupCol ? groupCol[i] : this.payerFc[f.payer[i]];
        out.set(g, (out.get(g) ?? 0) + f[col][i]);
      }
      return out;
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

  /** Open accounts at a day (account drill-through). Returns row indexes. */
  openAccounts(day: number, sel: Selections, predicate?: (i: number) => boolean): number[] {
    const c = this.ds.acc;
    const ok = this.rowOk('acc', sel, 'none');
    const out: number[] = [];
    for (let i = 0; i < c.n; i++) {
      if (c.dd[i] > day) continue;
      if (c.closeD[i] !== -1 && c.closeD[i] <= day) continue;
      if (!ok(i)) continue;
      if (predicate && !predicate(i)) continue;
      out.push(i);
    }
    return out;
  }

  /** Accounts with an event date in a range (account drill-through). Returns row indexes. */
  accountsByDate(dateCol: 'dd' | 'denD' | 'payD' | 'sbd' | 'woD', start: number, end: number, sel: Selections, detail: DetailKind = 'none'): number[] {
    const c = this.ds.acc as unknown as Record<string, Float64Array> & { n: number };
    const ok = this.rowOk('acc', sel, detail);
    const dates = c[dateCol];
    const out: number[] = [];
    for (let i = 0; i < c.n; i++) {
      const d = dates[i];
      if (d < start || d > end || d < 0) continue;
      if (ok(i)) out.push(i);
    }
    return out;
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
