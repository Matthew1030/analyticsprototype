// In-memory star schema. Fact columns become typed arrays.
//
// The prototype loads static JSON files. In production these facts come from the analytics
// data service (see src/services/contracts.ts for the response shapes the UI expects).

export interface Dims {
  organization: { key: number; name: string; shortName: string };
  regions: string[];
  facilities: { key: number; name: string; short: string; type: string; beds: number; region: number; city: string }[];
  financialClasses: string[];
  payers: { key: number; name: string; fc: number }[];
  serviceLines: { key: number; name: string; department: string; patientType: string }[];
  patientTypes: string[];
  denialCategories: { key: number; name: string; owner: string }[];
  rootCauses: { key: number; name: string; category: number; recoverable: boolean }[];
  editCategories: { key: number; name: string; owner: string }[];
  dnfbHolds: { key: number; name: string; owner: string }[];
  dnfbAge: { key: number; name: string; min: number; max: number }[];
  arAge: { key: number; name: string; min: number; max: number }[];
  billedStatus: string[];
  accountStatus: string[];
  sourceSystems: { key: string; name: string; feeds: string; cadence: string }[];
}

export interface Meta {
  seed: number;
  windowStartMonth: number;
  endMonth: number;
  asOfDay: number;
  preliminaryMonths: number;
  lastRefreshUtc: string;
  displayTimeZone: string;
  /** Each synthetic account represents this many real accounts. */
  sampleWeight: number;
  /** Accounts discharged before this day are only present if still open in the window. */
  accountsCompleteFromDay: number;
  availability: Record<string, string>;
}

export type Fact<K extends string> = { n: number } & Record<K, Float64Array>;

/** Account (encounter) fact after expansion. Dates are day numbers; -1 = not happened by the as-of date. */
export type AccCol =
  | 'id' | 'fac' | 'payer' | 'fc' | 'svc' | 'pt' | 'dd' | 'gross' | 'net'
  | 'chgLag' | 'lateAmt' | 'missAmt' | 'codeD' | 'codeL' | 'qry' | 'hold'
  | 'fbd' | 'sbd' | 'sbL' | 'edit' | 'clean' | 'regErr'
  | 'rc' | 'cat' | 'recov' | 'denD' | 'denAmt' | 'denNet' | 'apl' | 'aplOvt' | 'ovt'
  | 'payD' | 'payAmt' | 'payExp' | 'pos' | 'woD' | 'woAmt' | 'bdD' | 'bdAmt' | 'chD' | 'chAmt'
  | 'closeD' | 'pend';
export type ArCol = 'day' | 'fac' | 'payer' | 'svc' | 'age' | 'status' | 'gross' | 'net' | 'count';
export type DnfbCol = 'day' | 'fac' | 'svc' | 'hold' | 'age' | 'stage' | 'amount' | 'count';
export type FeCol =
  | 'day' | 'fac' | 'ordersReceived' | 'ordersScheduled' | 'scheduleDaysSum' | 'openOrdersEod'
  | 'preRegDue' | 'preRegDone' | 'eligDue' | 'eligVerified' | 'authRequired' | 'authObtained' | 'authPreService'
  | 'finClearDue' | 'finCleared' | 'callsOffered' | 'callsAnswered' | 'callsAbandoned' | 'answerWaitSecs'
  | 'selfPayAccounts' | 'screened' | 'coverageFound';
export type OpsCol = 'day' | 'fac' | 'rcmCost';

export interface Dataset {
  dims: Dims;
  meta: Meta;
  acc: Fact<AccCol>;
  ar: Fact<ArCol>;
  dnfb: Fact<DnfbCol>;
  fe: Fact<FeCol>;
  ops: Fact<OpsCol>;
}

export const DATA_FILES = ['dims', 'meta', 'accounts', 'ar', 'dnfb', 'access', 'ops'] as const;
export type RawFiles = Record<typeof DATA_FILES[number], unknown>;

function toFact<K extends string>(raw: Record<string, number[]>): Fact<K> {
  const cols = Object.keys(raw);
  const n = raw[cols[0]].length;
  const out: Record<string, unknown> = { n };
  for (const c of cols) {
    if (raw[c].length !== n) throw new Error(`Column ${c} has ${raw[c].length} rows, expected ${n}`);
    out[c] = Float64Array.from(raw[c]);
  }
  return out as Fact<K>;
}

/**
 * Expands the compact account file (lags from anchor dates) into absolute dates and
 * derived flags. In production the data service returns these fields directly.
 */
function expandAccounts(raw: Record<string, number[]>, dims: Dims): Fact<AccCol> {
  const n = raw.fac.length;
  const cols: AccCol[] = [
    'id', 'fac', 'payer', 'fc', 'svc', 'pt', 'dd', 'gross', 'net', 'chgLag', 'lateAmt', 'missAmt', 'codeD', 'codeL',
    'qry', 'hold', 'fbd', 'sbd', 'sbL', 'edit', 'clean', 'regErr', 'rc', 'cat', 'recov', 'denD', 'denAmt', 'denNet',
    'apl', 'aplOvt', 'ovt', 'payD', 'payAmt', 'payExp', 'pos', 'woD', 'woAmt', 'bdD', 'bdAmt', 'chD', 'chAmt', 'closeD', 'pend',
  ];
  const o = Object.fromEntries(cols.map((c) => [c, new Float64Array(n)])) as Record<AccCol, Float64Array>;
  const ptIndex = (svc: number) => dims.patientTypes.indexOf(dims.serviceLines[svc].patientType);
  const at = (anchor: number, lag: number) => (anchor < 0 || lag < 0 ? -1 : anchor + lag);
  for (let i = 0; i < n; i++) {
    const dd = raw.dd[i];
    const payer = raw.payer[i];
    const fc = dims.payers[payer].fc;
    const selfPay = fc === 6;
    o.id[i] = 4_100_000 + i * 7 + (i % 5);
    o.fac[i] = raw.fac[i]; o.payer[i] = payer; o.fc[i] = fc; o.svc[i] = raw.svc[i]; o.pt[i] = ptIndex(raw.svc[i]);
    o.dd[i] = dd; o.gross[i] = raw.gross[i]; o.net[i] = raw.net[i];
    o.chgLag[i] = raw.chgLag[i]; o.lateAmt[i] = raw.lateAmt[i]; o.missAmt[i] = raw.missAmt[i];
    o.codeL[i] = raw.codeL[i]; o.codeD[i] = at(dd, raw.codeL[i]); o.qry[i] = raw.qry[i]; o.hold[i] = raw.hold[i];
    const fbd = at(dd, raw.fbL[i]);
    const sbd = at(fbd, raw.sbL[i]);
    o.fbd[i] = fbd; o.sbd[i] = sbd; o.sbL[i] = sbd >= 0 ? raw.sbL[i] : -1;
    o.edit[i] = raw.edit[i];
    o.clean[i] = sbd < 0 ? -1 : raw.edit[i] === -1 ? 1 : 0;
    o.regErr[i] = sbd >= 0 && raw.edit[i] === 0 ? 1 : 0;
    const rc = raw.rc[i];
    const denD = rc >= 0 ? at(sbd, raw.denL[i]) : -1;
    o.rc[i] = rc; o.cat[i] = rc >= 0 ? dims.rootCauses[rc].category : -1;
    o.recov[i] = rc >= 0 && dims.rootCauses[rc].recoverable ? 1 : 0;
    o.denD[i] = denD; o.denAmt[i] = denD >= 0 ? raw.gross[i] : 0; o.denNet[i] = denD >= 0 ? raw.net[i] : 0;
    o.apl[i] = raw.apl[i];
    const payD = at(dd, raw.payL[i]);
    o.payD[i] = payD; o.payAmt[i] = raw.payAmt[i];
    o.payExp[i] = payD >= 0 && !selfPay ? raw.net[i] : 0;
    o.ovt[i] = denD >= 0 && payD >= 0 ? 1 : 0;
    o.aplOvt[i] = o.ovt[i] && raw.apl[i] ? 1 : 0;
    o.pos[i] = raw.pos[i];
    const woD = at(denD, raw.woL[i]);
    o.woD[i] = woD; o.woAmt[i] = woD >= 0 ? raw.net[i] : 0;
    const relD = at(sbd, raw.bdL[i]);
    const charity = raw.chr[i] === 1;
    o.bdD[i] = charity ? -1 : relD; o.bdAmt[i] = charity ? 0 : raw.bdAmt[i];
    o.chD[i] = charity ? relD : -1; o.chAmt[i] = charity ? raw.bdAmt[i] : 0;
    // Self-pay accounts close at the bad debt or charity transfer; insured accounts at payment or write-off.
    o.closeD[i] = woD >= 0 ? woD : relD >= 0 ? relD : !selfPay && payD >= 0 ? payD : -1;
    o.pend[i] = raw.pend[i];
  }
  return { n, ...o } as Fact<AccCol>;
}

export function buildDataset(raw: RawFiles): Dataset {
  const dims = raw.dims as Dims;
  return {
    dims,
    meta: raw.meta as Meta,
    acc: expandAccounts(raw.accounts as Record<string, number[]>, dims),
    ar: toFact<ArCol>(raw.ar as Record<string, number[]>),
    dnfb: toFact<DnfbCol>(raw.dnfb as Record<string, number[]>),
    fe: toFact<FeCol>(raw.access as Record<string, number[]>),
    ops: toFact<OpsCol>(raw.ops as Record<string, number[]>),
  };
}

export async function fetchDataset(base = 'data/', onProgress?: (done: number, total: number) => void): Promise<Dataset> {
  let done = 0;
  const entries = await Promise.all(
    DATA_FILES.map(async (f) => {
      const res = await fetch(`${base}${f}.json`);
      if (!res.ok) throw new Error(`The data service did not return "${f}" (HTTP ${res.status}).`);
      const json = await res.json();
      onProgress?.(++done, DATA_FILES.length);
      return [f, json] as const;
    }),
  );
  return buildDataset(Object.fromEntries(entries) as RawFiles);
}
