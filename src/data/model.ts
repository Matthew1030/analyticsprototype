// In-memory star schema. Fact columns become typed arrays.

export interface Dims {
  client: { key: number; name: string };
  facilities: { key: number; name: string; type: string; beds: number }[];
  financialClasses: string[];
  payers: { key: number; name: string; fc: number }[];
  serviceLines: { key: number; name: string; department: string; patientType: string }[];
  denialCategories: string[];
  denialReasons: { key: number; name: string; category: number }[];
  writeOffReasons: { key: number; name: string }[];
  editCategories: { key: number; name: string }[];
  dnfbHolds: { key: number; name: string; owner: string }[];
  dnfbAge: { key: number; name: string; min: number; max: number }[];
  arAge: { key: number; name: string; min: number; max: number }[];
  billedStatus: string[];
  workQueues: { key: number; name: string }[];
}

export interface Meta {
  seed: number;
  windowStartMonth: number;
  endMonth: number;
  asOfDay: number;
  preliminaryMonths: number;
  lastRefreshUtc: string;
  availability: Record<string, string>;
}

export type Fact<K extends string> = { n: number } & Record<K, Float64Array>;

export type ClaimCol =
  | 'id' | 'fac' | 'payer' | 'svc' | 'dd' | 'fbd' | 'sbd' | 'gross' | 'net' | 'clean' | 'edit'
  | 'hold' | 'denR' | 'denD' | 'denAmt' | 'payD' | 'payAmt' | 'pos' | 'woD' | 'woAmt' | 'woR'
  | 'bdD' | 'bdAmt' | 'closeD';
export type ArCol = 'day' | 'fac' | 'payer' | 'svc' | 'age' | 'billed' | 'gross' | 'net' | 'count';
export type DnfbCol = 'day' | 'fac' | 'svc' | 'hold' | 'age' | 'stage' | 'amount' | 'count';
export type WqCol = 'day' | 'fac' | 'task' | 'assigned' | 'completed';
export type FeCol =
  | 'day' | 'fac' | 'ordersReceived' | 'ordersScheduled' | 'scheduleDaysSum' | 'openOrdersEod'
  | 'preRegDue' | 'preRegSameDay' | 'preReg1Day' | 'preReg2Day' | 'dpa2Due' | 'dpa2Done'
  | 'callsOffered' | 'callsAnswered' | 'callsAbandoned' | 'answerWaitSecs' | 'selfPayAccounts'
  | 'screened' | 'eligibleScreened' | 'converted' | 'appsInitiated' | 'ipAdmissions' | 'ipPriorDayDone';

export interface Dataset {
  dims: Dims;
  meta: Meta;
  claims: Fact<ClaimCol>;
  ar: Fact<ArCol>;
  dnfb: Fact<DnfbCol>;
  wq: Fact<WqCol>;
  fe: Fact<FeCol>;
}

export type RawFiles = Record<'dims' | 'meta' | 'claims' | 'ar' | 'dnfb' | 'workqueue' | 'frontend', unknown>;

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

export function buildDataset(raw: RawFiles): Dataset {
  return {
    dims: raw.dims as Dims,
    meta: raw.meta as Meta,
    claims: toFact<ClaimCol>(raw.claims as Record<string, number[]>),
    ar: toFact<ArCol>(raw.ar as Record<string, number[]>),
    dnfb: toFact<DnfbCol>(raw.dnfb as Record<string, number[]>),
    wq: toFact<WqCol>(raw.workqueue as Record<string, number[]>),
    fe: toFact<FeCol>(raw.frontend as Record<string, number[]>),
  };
}

export const DATA_FILES = ['dims', 'meta', 'claims', 'ar', 'dnfb', 'workqueue', 'frontend'] as const;

export async function fetchDataset(base = 'data/'): Promise<Dataset> {
  const entries = await Promise.all(
    DATA_FILES.map(async (f) => {
      const res = await fetch(`${base}${f}.json`);
      if (!res.ok) throw new Error(`Cannot load ${f}.json (${res.status})`);
      return [f, await res.json()] as const;
    }),
  );
  return buildDataset(Object.fromEntries(entries) as RawFiles);
}
