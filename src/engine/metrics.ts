// Metric catalog. One definition and one calculation per metric, for every client.
// All definitions are DRAFT. Several metrics have more than one common industry definition
// (flagged multiDef). Confirm each definition with the client's finance team before use.
//
// The calculation text is platform-neutral pseudo-logic over the logical data model
// (src/services/contracts.ts). It does not assume any BI tool or database.

import { monthEndDay } from '../data/dates';
import { hash01 } from '../data/hash';
import type { Engine, FactName, Selections } from './engine';
import { FIELD_LABEL, missingFields } from './engine';
import { shiftMonths, type SubMonthGrain } from './periods';
import { CONFIG, staticTarget, watchFor } from './status';

export type Unit = 'pct' | 'days' | 'usd' | 'count' | 'sec' | 'ratio';
export type Direction = 'up' | 'down' | 'none';
export const UNIT_LABEL: Record<Unit, string> = { pct: '%', days: 'Days', usd: '$', count: 'Count', sec: 'Seconds', ratio: 'Ratio' };
/** Revenue cycle area, in lifecycle order (plus enterprise financials). */
export type RcmArea =
  | 'Patient Access' | 'Charge Capture' | 'Coding' | 'Clinical Documentation'
  | 'Billing' | 'Denials' | 'A/R' | 'Cash' | 'Financial';

/** Prefix of the metric code for each area. */
export const AREA_CODE: Record<RcmArea, string> = {
  'Patient Access': 'PA', 'Charge Capture': 'CC', Coding: 'CO', 'Clinical Documentation': 'CD',
  Billing: 'BL', Denials: 'DN', 'A/R': 'AR', Cash: 'CA', Financial: 'FN',
};

export const RCM_AREAS: RcmArea[] = [
  'Patient Access', 'Charge Capture', 'Coding', 'Clinical Documentation', 'Billing', 'Denials', 'A/R', 'Cash', 'Financial',
];

/** A range of days. Periods and weeks both fit this shape. */
export interface Range {
  startDay: number;
  endDay: number;
  startMi: number;
  endMi: number;
  /** Set when the range is a day or a week (a period shorter than a month). */
  grain?: SubMonthGrain;
}

export interface Ctx {
  e: Engine;
  r: Range;
  sel: Selections;
}

/** Page that holds the main analysis for a metric. */
export type AnalysisPage = 'ar' | 'denials' | 'cash' | 'access' | 'midcycle' | 'billing' | 'payers' | 'executive';

export interface MetricDef {
  id: string;
  name: string;
  short?: string;
  area: RcmArea;
  unit: Unit;
  direction: Direction;
  /** flow = sum over the period; balance = point in time at period end. */
  type: 'flow' | 'balance';
  /**
   * Shortest period the metric is calculated for (default: day). 'week': it reads the weekly
   * DNFB snapshots. 'month': it reads month-end A/R snapshots, monthly cost data, monthly
   * revenue averages or monthly cohorts. Shorter periods show no value.
   */
  finest?: 'week' | 'month';
  /** Time recency: how often the value refreshes (Hourly, Daily, Weekly, Monthly, Yearly). Not set yet. */
  recency?: 'H' | 'D' | 'W' | 'M' | 'Y';
  definition: string;
  calculation: string;
  /** The calculation in plain terms, for business readers (e.g. "Appealed denials / denials"). */
  formula: string;
  sourceFields: string[];
  multiDef?: boolean;
  fact: FactName;
  page: AnalysisPage;
  /** Digits for display (default by unit). */
  digits?: number;
  /**
   * Unique metric code: RCM area prefix (AREA_CODE) and a number within the area, e.g. AR-06.
   * Fixed once given: a new metric takes the next free number in its area, and a removed
   * metric's code is not used again.
   */
  code: string;
  compute: (c: Ctx) => number | null;
  /** Dynamic target (e.g. cash goal); otherwise the static target in config. */
  target?: (c: Ctx) => number | null;
}

const div = (n: number, d: number) => (d > 0 ? n / d : null);

// ---------- shared building blocks ----------
const s = (c: Ctx, col: string, date: string, opts?: Parameters<Engine['sum']>[6]) =>
  c.e.sum('acc', col, date, c.r.startDay, c.r.endDay, c.sel, opts);
const gross = (c: Ctx, st = c.r.startDay, en = c.r.endDay) => c.e.sum('acc', 'gross', 'dd', st, en, c.sel);
const net = (c: Ctx, st = c.r.startDay, en = c.r.endDay) => c.e.sum('acc', 'net', 'dd', st, en, c.sel);
const adgr = (c: Ctx, day: number) => gross(c, day - 89, day) / 90;
const adnr = (c: Ctx, day: number) => net(c, day - 89, day) / 90;
const cash = (c: Ctx, st = c.r.startDay, en = c.r.endDay) =>
  c.e.sum('acc', 'payAmt', 'payD', st, en, c.sel) + c.e.sum('acc', 'pos', 'dd', st, en, c.sel);
/**
 * NPSR lagged for cash comparisons, scaled to the length of the period: average daily NPSR over
 * the same-length windows shifted back 1, 2 and 3 months, times the days in the period.
 * Normalizing per day removes the month-length effect (e.g. February).
 */
const lagNet = (c: Ctx) => {
  let t = 0;
  let days = 0;
  for (const k of [1, 2, 3]) { const x = shiftMonths(c.r, -k); t += net(c, x.startDay, x.endDay); days += x.endDay - x.startDay + 1; }
  return days ? (t / days) * (c.r.endDay - c.r.startDay + 1) : 0;
};
const arDay = (c: Ctx) => c.e.snapshotDayOnOrBefore('ar', c.r.endDay);
const dnfbDay = (c: Ctx) => c.e.snapshotDayOnOrBefore('dnfb', c.r.endDay);
const ar = (c: Ctx, col: 'gross' | 'net', f: { billed?: number[]; ageMin?: number; ageMax?: number } = {}) => {
  const d = arDay(c);
  return d === null ? null : c.e.snapshot('ar', col, d, c.sel, f);
};
/** A/R ratio metrics (days, aging shares) ignore the aging-bucket and account-status filters:
 *  those filters slice balances, and a ratio of one slice against total revenue would mislead. */
const whole = (c: Ctx): Ctx => ({ ...c, sel: { ...c.sel, arAge: [], accountStatus: [] } });
const dnfb = (c: Ctx, stage: number, opts: { ageMin?: number; col?: 'amount' | 'count'; hold?: number[] } = {}) => {
  const d = dnfbDay(c);
  if (d === null) return null;
  const sel = opts.hold ? { ...c.sel, dnfbHold: opts.hold } : c.sel;
  return c.e.snapshot('dnfb', opts.col ?? 'amount', d, sel, { stage, ageMin: opts.ageMin });
};
const fe = (c: Ctx, col: string) => c.e.sum('fe', col, 'day', c.r.startDay, c.r.endDay, c.sel);
const feRatio = (c: Ctx, n: string, d: string) => (c.e.feHasCol(d, c.sel) ? div(fe(c, n), fe(c, d)) : null);
const feCount = (c: Ctx, col: string) => (c.e.feHasCol(col, c.sel) ? fe(c, col) : null);
const submittedGross = (c: Ctx) => s(c, 'gross', 'sbd');
const denied = (c: Ctx, col: 'denAmt' | 'denNet' = 'denAmt') => s(c, col, 'denD', { detail: 'denial' });
const deniedIn = (c: Ctx, cats: number[]) => {
  const cur = c.sel.denialCategory;
  const use = cur?.length ? cats.filter((k) => cur.includes(k)) : cats;
  if (!use.length) return 0;
  return c.e.sum('acc', 'denAmt', 'denD', c.r.startDay, c.r.endDay, { ...c.sel, denialCategory: use }, { detail: 'denial' });
};
const cashGoal = (c: Ctx) => CONFIG.cashGoalPctOfNpsr * lagNet(c);

// ---------- modeled components (synthetic: the prototype data has no source for them) ----------
const endOf = (c: Ctx) => Math.min(c.r.endDay, c.e.lastDay);
/**
 * Insurance credit balances (overpayments awaiting refund). The synthetic data carries no
 * overpayments, so the prototype models them: about 5% of paid insurance accounts carry a credit
 * of 10–50% of expected net from 3 days after payment until refund 15–165 days later.
 */
const creditOf = (a: Engine['ds']['acc'], i: number) => {
  if (a.fc[i] === 6 || a.payD[i] === -1) return null;
  const id = a.id[i];
  if (hash01(id, 21) >= 0.05) return null;
  const start = a.payD[i] + 3;
  const lag = 15 + Math.floor(hash01(id, 22) * 150);
  return { start, refund: start + lag, amount: a.net[i] * (0.1 + 0.4 * hash01(id, 23)) };
};
const creditAt = (c: Ctx, day: number) => {
  const a = c.e.ds.acc;
  return c.e.accountTotal(`credit|${day}`, c.sel, 'none', (i) => {
    const t = creditOf(a, i);
    return t && t.start <= day && day < t.refund ? t.amount : 0;
  });
};
/** Refunds of the modeled credit balances, on the day each credit is refunded. */
const refundsIn = (c: Ctx) => {
  const a = c.e.ds.acc;
  const st = c.r.startDay;
  const en = Math.min(c.r.endDay, c.e.lastDay);
  return c.e.accountTotal(`refund|${st}|${en}`, c.sel, 'none', (i) => {
    const t = creditOf(a, i);
    return t && t.refund >= st && t.refund <= en ? t.amount : 0;
  });
};
/**
 * Average monthly NPSR for the three months that end with the period's last month, times the
 * months in the period (the denominator of CA-03, DN-01 and DN-02).
 */
const avgMonthlyNet = (c: Ctx) => {
  let t = 0;
  for (let k = 0; k < 3; k++) t += net(c, monthEndDay(c.r.endMi - k - 1) + 1, monthEndDay(c.r.endMi - k));
  return (t / 3) * (c.r.endMi - c.r.startMi + 1);
};
/**
 * Unrealized bad debt: open self-pay balances that meet the bad-debt criteria (older than the
 * configured days from discharge) and are not yet written off.
 */
const unrealizedBadDebtAt = (c: Ctx, day: number) => {
  const a = c.e.ds.acc;
  const days = CONFIG.framework.badDebtCriteriaDays;
  return c.e.accountTotal(`ubd|${day}|${days}`, c.sel, 'none', (i) => {
    if (a.fc[i] !== 6 || a.dd[i] > day - days || (a.closeD[i] !== -1 && a.closeD[i] <= day)) return 0;
    const paid = a.pos[i] + (a.payD[i] !== -1 && a.payD[i] <= day ? a.payAmt[i] : 0);
    return Math.max(0, a.net[i] - paid);
  });
};
/** Unrealized avoidable write-offs: expected net on open, unresolved denials older than the configured days. */
const staleDenialsAt = (c: Ctx, day: number) => {
  const a = c.e.ds.acc;
  const days = CONFIG.framework.unrealizedDenialDays;
  return c.e.accountTotal(`stale-den|${day}|${days}`, c.sel, 'denial', (i) =>
    (a.denD[i] !== -1 && a.denD[i] <= day - days && (a.payD[i] === -1 || a.payD[i] > day) && (a.woD[i] === -1 || a.woD[i] > day) ? a.denNet[i] : 0));
};
const avoidableWo = (c: Ctx) => s(c, 'woAmt', 'woD', { detail: 'denial' });

/** Final outcomes of orders closed without an appointment (client KPI: open-order categorization). */
export const ORDER_OUTCOMES = [
  { col: 'ordersDuplicate', name: 'Duplicate' }, { col: 'ordersAlreadyScheduled', name: 'Already scheduled' },
  { col: 'ordersLeakage', name: 'Leakage' }, { col: 'ordersCancelled', name: 'Cancelled' },
] as const;

/** Denial work status at a day, for open denials and appeals (client KPI: clinical appeal status). */
export const APPEAL_STATUSES = [
  'To be reviewed', 'Reviewed, to be appealed', '1st level appeal', '2nd level appeal', 'Not appealed, in rework',
] as const;
/**
 * Status of a denied account at a day, or -1 when the denial is not open. The prototype derives it
 * from the denial date, the appeal flag and the appeal level; production reads the appeal tracking status.
 */
export function appealStatusOf(a: Engine['ds']['acc'], i: number, day: number): number {
  const den = a.denD[i];
  if (den < 0 || den > day) return -1;
  if (a.closeD[i] !== -1 && a.closeD[i] <= day) return -1;
  const age = day - den;
  if (age < 7) return 0;
  if (!a.apl[i]) return 4;
  if (age < 20) return 1;
  return a.aplLvl[i] === 2 && age >= 75 ? 3 : 2;
}
export function appealStatusCounts(e: Engine, day: number, sel: Selections): number[] {
  const a = e.ds.acc;
  return APPEAL_STATUSES.map((_, k) => e.accountTotal(`aplst|${day}|${k}`, sel, 'denial', (i) => (appealStatusOf(a, i, day) === k ? 1 : 0)));
}

export const METRICS: MetricDef[] = [
  // ================= Financial =================
  {
    id: 'npsr', code: 'FN-01', name: 'Net patient service revenue', short: 'NPSR', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'executive',
    definition: 'Expected net revenue (gross charges less expected contractual allowances) for accounts discharged in the period.',
    calculation: 'SUM(account.expected_net) WHERE discharge_date IN period',
    formula: 'Gross charges − expected contractual allowances, for accounts discharged in the period',
    sourceFields: ['account.expected_net', 'account.discharge_date'], multiDef: true, fact: 'acc',
    compute: (c) => net(c),
  },
  {
    id: 'gross_charges', code: 'FN-02', name: 'Gross charges', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'executive',
    definition: 'Gross charges for accounts discharged in the period.',
    calculation: 'SUM(account.gross_charges) WHERE discharge_date IN period',
    formula: 'Total gross charges, for accounts discharged in the period',
    sourceFields: ['account.gross_charges', 'account.discharge_date'], fact: 'acc',
    compute: (c) => gross(c),
  },
  {
    id: 'contractual_adj_pct', code: 'FN-03', name: 'Contractual adjustment rate', short: 'Contractual adj. %', area: 'Financial', unit: 'pct', direction: 'none', type: 'flow', page: 'payers',
    definition: 'Expected contractual allowance as a share of gross charges.',
    calculation: '1 − SUM(expected_net) / SUM(gross_charges), by discharge date',
    formula: '(Gross charges − expected net revenue) / gross charges',
    sourceFields: ['account.gross_charges', 'account.expected_net'], fact: 'acc',
    compute: (c) => { const g = gross(c); return g > 0 ? 1 - net(c) / g : null; },
  },
  {
    id: 'contractual_adj_dollars', code: 'FN-04', name: 'Contractual adjustments ($)', short: 'Contractual adj. $', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'cash',
    definition: 'All contractual adjustments: gross charges less expected net reimbursement, for accounts discharged in the period. Excludes charity, bad debt and denial write-offs.',
    calculation: 'SUM(gross_charges) − SUM(expected_net), by discharge date',
    formula: 'Gross charges − expected net revenue',
    sourceFields: ['account.gross_charges', 'account.expected_net'], fact: 'acc',
    compute: (c) => gross(c) - net(c),
  },
  {
    id: 'bad_debt', code: 'FN-05', name: 'Bad debt write-offs', area: 'Financial', unit: 'usd', direction: 'down', type: 'flow', page: 'executive',
    definition: 'Patient balances transferred to bad debt in the period.',
    calculation: 'SUM(transaction.amount) WHERE type = BAD_DEBT AND post_date IN period',
    formula: 'Total patient balances transferred to bad debt',
    sourceFields: ['transaction.amount', 'transaction.type', 'transaction.post_date'], fact: 'acc',
    compute: (c) => s(c, 'bdAmt', 'bdD'),
  },
  {
    id: 'bad_debt_pct', code: 'FN-06', name: 'Bad debt % of NPSR', short: 'Bad debt % NPSR', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'executive', digits: 2,
    definition: 'Bad debt write-offs as a share of net patient service revenue in the same period.',
    calculation: 'Bad debt write-offs (post date) / NPSR (discharge date)',
    formula: 'Bad debt write-offs / net patient service revenue (NPSR)',
    sourceFields: ['transaction.amount', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'bdAmt', 'bdD'), net(c)),
  },
  {
    id: 'charity', code: 'FN-07', name: 'Charity care', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'executive',
    definition: 'Patient balances adjusted under the financial assistance policy in the period.',
    calculation: 'SUM(transaction.amount) WHERE type = CHARITY AND post_date IN period',
    formula: 'Total charity care (financial assistance) adjustments',
    sourceFields: ['transaction.amount', 'transaction.type'], fact: 'acc',
    compute: (c) => s(c, 'chAmt', 'chD'),
  },
  {
    id: 'charity_pct', code: 'FN-08', name: 'Charity care % of NPSR', short: 'Charity care % NPSR', area: 'Financial', unit: 'pct', direction: 'none', type: 'flow', page: 'executive', digits: 2,
    definition: 'Charity care adjustments as a share of NPSR. No target: the level follows community need and policy.',
    calculation: 'Charity adjustments (post date) / NPSR (discharge date)',
    formula: 'Charity care adjustments / NPSR',
    sourceFields: ['transaction.amount', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(s(c, 'chAmt', 'chD'), net(c)),
  },
  {
    id: 'cost_to_collect', code: 'FN-09', name: 'Cost to collect', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'executive', finest: 'month', digits: 2,
    definition: 'Revenue cycle operating cost as a share of cash collected.',
    calculation: 'SUM(gl.rcm_operating_cost) / Cash collections, same period',
    formula: 'Revenue cycle operating cost / cash collected',
    sourceFields: ['gl.rcm_operating_cost', 'transaction.amount'], multiDef: true, fact: 'ops',
    compute: (c) => (missingFields('acc', c.sel).length ? null : div(c.e.sum('ops', 'rcmCost', 'day', c.r.startDay, c.r.endDay, c.sel), cash(c))),
  },
  // ================= ELT metric framework additions =================
  {
    id: 'net_to_gross', code: 'FN-10', name: 'Net to gross ratio', short: 'Net to gross', area: 'Financial', unit: 'pct', direction: 'up', type: 'flow', page: 'payers',
    definition: 'Net patient revenue as a percentage of gross patient revenue; reflects contractual adjustments and overall yield. No target: depends on facility and payer mix.',
    calculation: '(Net Patient Revenue ÷ Gross Patient Revenue) × 100, by discharge date',
    formula: 'Net patient revenue / gross patient revenue',
    sourceFields: ['account.expected_net', 'account.gross_charges'], fact: 'acc',
    compute: (c) => div(net(c), gross(c)),
  },
  {
    id: 'credit_balance_days', code: 'AR-01', name: 'Net days in credit balance', short: 'Credit balance days', area: 'A/R', unit: 'days', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Absolute patient-account credit-balance exposure expressed as days of average daily net patient service revenue. Prototype: credit balances are modeled, because the synthetic data has no overpayments.',
    calculation: 'Absolute(Month-End Credit Balance AR) ÷ (Trailing 90-day Net Patient Service Revenue ÷ 90)',
    formula: 'Credit balances at period end (absolute value) / average daily net revenue (last 90 days)',
    sourceFields: ['account.credit_balance', 'account.expected_net'], fact: 'acc',
    compute: (c) => { const d = endOf(c); return div(Math.abs(creditAt(c, d)), adnr(c, d)); },
  },
  {
    id: 'pos_pct_net', code: 'PA-01', name: 'Point-of-service cash % of net revenue', short: 'POS cash % net rev', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access', digits: 2,
    definition: 'Patient cash collected before service, at service, or within the defined POS window as a percentage of net revenue.',
    calculation: '(Patient POS Payments ÷ Net Patient Service Revenue) × 100, by service date',
    formula: 'Point-of-service patient payments / NPSR',
    sourceFields: ['transaction.amount', 'transaction.pos_flag', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(s(c, 'pos', 'dd'), net(c)),
  },
  {
    id: 'bad_debt_pct_gross', code: 'FN-11', name: 'Bad debt as % of gross revenue', short: 'Bad debt % gross rev', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'cash', digits: 2,
    definition: 'Bad debt provision recorded on the income statement as a percentage of gross patient service revenue. Prototype: the provision is the bad debt transfers posted in the period.',
    calculation: '(Bad Debt Provision ÷ Gross Patient Service Revenue) × 100',
    formula: 'Bad debt provision / gross patient service revenue',
    sourceFields: ['gl.bad_debt_provision', 'account.gross_charges'], fact: 'acc',
    compute: (c) => div(s(c, 'bdAmt', 'bdD'), gross(c)),
  },
  {
    id: 'bad_debt_unrealized_pct', code: 'FN-12', name: 'Bad debt incl. unrealized as % of gross revenue', short: 'Bad debt incl. unrealized', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'cash', digits: 2,
    definition: 'Bad debt already recorded plus open account balances that meet the organization\'s bad-debt criteria but have not yet been written off, as a percentage of gross patient service revenue. Prototype criteria: self-pay balances open more than the configured days after discharge.',
    calculation: '((Bad Debt Provision + Unrealized Bad Debt at period end) ÷ Gross Patient Service Revenue) × 100',
    formula: '(Bad debt provision + unrealized bad debt at period end) / gross patient service revenue',
    sourceFields: ['gl.bad_debt_provision', 'account.balance', 'config.bad_debt_criteria_days', 'account.gross_charges'], fact: 'acc',
    compute: (c) => div(s(c, 'bdAmt', 'bdD') + unrealizedBadDebtAt(c, endOf(c)), gross(c)),
  },
  {
    id: 'avoidable_wo_pct_net', code: 'DN-01', name: 'Avoidable write-offs as % of net revenue', short: 'Avoidable W/O % net', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials', finest: 'month', digits: 2,
    definition: 'Realized avoidable write-offs as a percentage of average monthly net patient service revenue. Prototype: avoidable write-offs are write-offs after a final denial, net of recoveries.',
    calculation: '(Net Avoidable Write-Offs ÷ Average Monthly Net Patient Service Revenue) × 100',
    formula: 'Net avoidable write-offs / average monthly NPSR',
    sourceFields: ['transaction.amount', 'transaction.type', 'denial.root_cause', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(avoidableWo(c), avgMonthlyNet(c)),
  },
  {
    id: 'avoidable_wo_unrealized_pct', code: 'DN-02', name: 'Avoidable write-offs incl. unrealized as % of net revenue', short: 'Avoidable W/O incl. unrealized', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials', finest: 'month', digits: 2,
    definition: 'Realized avoidable write-offs plus unrealized avoidable write-offs, as a percentage of net patient service revenue. Prototype definition of unrealized: expected net on open, unresolved denials older than the configured days.',
    calculation: '((Net Avoidable Write-Offs + Defined Unrealized Avoidable Write-Offs at period end) ÷ Average Monthly Net Patient Service Revenue) × 100',
    formula: '(Net avoidable write-offs + unrealized avoidable write-offs at period end) / average monthly NPSR',
    sourceFields: ['transaction.amount', 'denial.denial_date', 'denial.status', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(avoidableWo(c) + staleDenialsAt(c, endOf(c)), avgMonthlyNet(c)),
  },
  // ================= Cash =================
  {
    id: 'cash', code: 'CA-01', name: 'Cash collections', area: 'Cash', unit: 'usd', direction: 'up', type: 'flow', page: 'cash',
    definition: 'Payer and patient payments posted in the period, including point-of-service cash. Target = cash goal (goal % × lagged NPSR).',
    calculation: 'SUM(transaction.amount) WHERE type = PAYMENT AND post_date IN period',
    formula: 'Payer payments + patient payments (including point-of-service cash)',
    sourceFields: ['transaction.amount', 'transaction.type', 'transaction.post_date'], fact: 'acc',
    compute: (c) => cash(c),
    // The cash goal is a monthly goal (CA-02): no target for days and weeks.
    target: (c) => (c.r.grain ? null : cashGoal(c)),
  },
  {
    id: 'cash_goal', code: 'CA-02', name: 'Cash goal', area: 'Cash', unit: 'usd', direction: 'none', type: 'flow', page: 'cash', finest: 'month',
    definition: 'Expected cash for the period: the cash-to-NPSR goal × lagged average daily NPSR (period shifted back 1, 2 and 3 months) × days in the period.',
    calculation: 'cash_goal_pct × lagged average daily NPSR × days in period',
    formula: 'Cash goal % × average daily NPSR of the 3 prior months × days in the period',
    sourceFields: ['config.cash_goal_pct', 'account.expected_net'], fact: 'acc',
    compute: (c) => cashGoal(c),
  },
  {
    id: 'cash_pct_npsr', code: 'CA-03', name: 'Cash as % of net revenue', short: 'Cash % net rev', area: 'Cash', unit: 'pct', direction: 'up', type: 'flow', page: 'cash', finest: 'month',
    definition: 'Total patient service cash collected in the reporting period as a percentage of average monthly net patient service revenue for the most recent 3 months (including the reporting month). Multi-month periods compare against the monthly average times the months in the period.',
    calculation: '(Total Patient Service Cash Collected ÷ Average Monthly Net Patient Service Revenue for the Most Recent 3 Months) × 100',
    formula: 'Cash collections / average monthly NPSR of the most recent 3 months',
    sourceFields: ['transaction.amount', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(cash(c), avgMonthlyNet(c)),
  },
  {
    id: 'net_collection_rate', code: 'CA-04', name: 'Net collection rate', area: 'Cash', unit: 'pct', direction: 'up', type: 'flow', page: 'cash', finest: 'month',
    definition: 'Payments received to date on accounts discharged 7–9 months before period end, as a share of their expected net revenue (mature cohort).',
    calculation: 'SUM(payments to date) / SUM(expected_net) WHERE discharge_date IN (period end −9 to −7 months)',
    formula: 'Payments to date / expected net revenue, for accounts discharged 7–9 months before period end',
    sourceFields: ['transaction.amount', 'account.expected_net', 'account.discharge_date'], multiDef: true, fact: 'acc',
    compute: (c) => {
      const st = monthEndDay(c.r.endMi - 9) + 1;
      const en = monthEndDay(c.r.endMi - 6);
      if (st < c.e.ds.meta.accountsCompleteFromDay) return null; // cohort older than the loaded history
      const paid = c.e.sum('acc', 'payAmt', 'dd', st, en, c.sel) + c.e.sum('acc', 'pos', 'dd', st, en, c.sel);
      return div(paid, net(c, st, en));
    },
  },
  {
    id: 'payment_variance', code: 'CA-05', name: 'Payment variance', area: 'Cash', unit: 'usd', direction: 'up', type: 'flow', page: 'payers',
    definition: 'Insurance payments posted minus expected reimbursement on the same accounts. Negative = underpaid.',
    calculation: 'SUM(payment.amount − account.expected_net) WHERE payer_type = INSURANCE AND post_date IN period',
    formula: 'Insurance payments − expected reimbursement on the same accounts',
    sourceFields: ['transaction.amount', 'account.expected_net', 'contract.expected_reimbursement'], fact: 'acc',
    compute: (c) => s(c, 'payAmt', 'payD', { pred: 'insured' }) - s(c, 'payExp', 'payD'),
  },
  {
    id: 'payment_variance_pct', code: 'CA-06', name: 'Payment variance %', short: 'Pmt variance %', area: 'Cash', unit: 'pct', direction: 'up', type: 'flow', page: 'payers',
    definition: 'Payment variance as a share of expected reimbursement on paid insurance accounts. Below −2% signals underpayment.',
    calculation: '(SUM(payment) − SUM(expected)) / SUM(expected), insurance payments in period',
    formula: '(Insurance payments − expected reimbursement) / expected reimbursement',
    sourceFields: ['transaction.amount', 'account.expected_net'], fact: 'acc',
    compute: (c) => { const e = s(c, 'payExp', 'payD'); return e > 0 ? (s(c, 'payAmt', 'payD', { pred: 'insured' }) - e) / e : null; },
  },
  {
    id: 'patient_cash', code: 'CA-07', name: 'Patient cash (self-pay)', short: 'Patient cash', area: 'Cash', unit: 'usd', direction: 'up', type: 'flow', page: 'cash',
    definition: 'Payments from patients: point-of-service cash plus self-pay payments posted in the period. Prototype data has no patient payments on insured accounts; production includes them (payment source = patient).',
    calculation: 'SUM(transaction.amount) WHERE type = PAYMENT AND payment_source = PATIENT AND post_date IN period',
    formula: 'Point-of-service cash + self-pay payments',
    sourceFields: ['transaction.amount', 'transaction.payment_source'], fact: 'acc',
    compute: (c) => s(c, 'payAmt', 'payD', { pred: 'selfPay' }) + s(c, 'pos', 'dd'),
  },
  {
    id: 'refunds', code: 'CA-08', name: 'Refunds', area: 'Cash', unit: 'usd', direction: 'none', type: 'flow', page: 'cash',
    definition: 'Credit balances refunded to payers or patients in the period. Prototype: the refunds of the modeled insurance credit balances (see AR-01).',
    calculation: 'SUM(transaction.amount) WHERE type = REFUND AND post_date IN period',
    formula: 'Total credit balances refunded to payers or patients',
    sourceFields: ['transaction.amount', 'transaction.type'], fact: 'acc',
    compute: (c) => refundsIn(c),
  },
  {
    id: 'retractions', code: 'CA-09', name: 'Insurance retractions', short: 'Retractions', area: 'Cash', unit: 'usd', direction: 'down', type: 'flow', page: 'cash',
    definition: 'Insurance payments taken back by the payer (recoupments and takebacks) posted in the period.',
    calculation: 'SUM(ABS(transaction.amount)) WHERE type = RETRACTION AND post_date IN period',
    formula: 'Total insurance payments taken back by payers',
    sourceFields: ['transaction.amount', 'transaction.type'], fact: 'acc',
    compute: (c) => s(c, 'retAmt', 'retD', { pred: 'insured' }),
  },
  {
    id: 'retraction_pct_cash', code: 'CA-10', name: 'Insurance retractions % of total cash', short: 'Retractions % cash', area: 'Cash', unit: 'pct', direction: 'down', type: 'flow', page: 'cash', digits: 2,
    definition: 'Insurance retractions as a share of total cash posted in the period.',
    calculation: 'SUM(retractions) / SUM(cash posted), post date in period',
    formula: 'Insurance retractions / total cash posted',
    sourceFields: ['transaction.amount', 'transaction.type'], fact: 'acc',
    compute: (c) => div(s(c, 'retAmt', 'retD', { pred: 'insured' }), cash(c)),
  },
  {
    id: 'service_month_yield', code: 'CA-11', name: 'Life-to-date yield by service month', short: 'LTD yield', area: 'Cash', unit: 'pct', direction: 'none', type: 'flow', page: 'cash', finest: 'month',
    definition: 'Payments to date on accounts discharged in the period, as a share of charges less contractual adjustments (expected net). Recent service months are still being paid, so their yield is low until they mature.',
    calculation: 'SUM(payments to data date) / (SUM(gross_charges) − SUM(contractual adjustments)) WHERE discharge_date IN period',
    formula: 'Payments to date / (gross charges − contractual adjustments), for accounts discharged in the period',
    sourceFields: ['transaction.amount', 'account.gross_charges', 'account.expected_net', 'account.discharge_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'payAmt', 'dd') + s(c, 'pos', 'dd'), net(c)),
  },
  // ================= A/R =================
  {
    id: 'credit_balance_dollars', code: 'AR-02', name: 'Credit balances ($)', short: 'Credit balances $', area: 'A/R', unit: 'usd', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Absolute value of accounts with a credit balance (overpayments awaiting refund) at period end. Prototype: modeled credits (see AR-01).',
    calculation: 'ABS(SUM(account.balance WHERE balance < 0)) at period end',
    formula: 'Total credit balances at period end (absolute value)',
    sourceFields: ['account.balance'], fact: 'acc',
    compute: (c) => Math.abs(creditAt(c, endOf(c))),
  },
  {
    id: 'gross_ar', code: 'AR-03', name: 'Gross A/R', area: 'A/R', unit: 'usd', direction: 'none', type: 'balance', page: 'ar', finest: 'month',
    definition: 'Open debit balances (gross charges less payments) at the period-end snapshot.',
    calculation: 'SUM(ar_snapshot.gross_balance) WHERE snapshot_date = period end',
    formula: 'Total open debit balances at period end (gross charges − payments)',
    sourceFields: ['ar_snapshot.gross_balance', 'ar_snapshot.snapshot_date'], fact: 'ar',
    compute: (c) => ar(c, 'gross'),
  },
  {
    id: 'net_ar', code: 'AR-04', name: 'Net A/R', area: 'A/R', unit: 'usd', direction: 'none', type: 'balance', page: 'ar', finest: 'month',
    definition: 'Open debit balances net of expected contractual allowances at the period-end snapshot.',
    calculation: 'SUM(ar_snapshot.net_balance) WHERE snapshot_date = period end',
    formula: 'Total open debit balances at period end, net of expected contractual allowances',
    sourceFields: ['ar_snapshot.net_balance'], fact: 'ar',
    compute: (c) => ar(c, 'net'),
  },
  {
    id: 'net_ar_days', code: 'AR-05', name: 'Net A/R days', area: 'A/R', unit: 'days', direction: 'down', type: 'balance', page: 'ar', finest: 'month',
    definition: 'Net A/R at period end divided by average daily net revenue over the last 90 days. Ignores aging-bucket and account-status filters.',
    calculation: 'Net A/R (period end) / (SUM(expected_net, last 90 days) / 90)',
    formula: 'Net A/R at period end / average daily net revenue (last 90 days)',
    sourceFields: ['ar_snapshot.net_balance', 'account.expected_net'], multiDef: true, fact: 'ar',
    compute: (c0) => { const c = whole(c0); const v = ar(c, 'net'); return v === null ? null : div(v, adnr(c, arDay(c)!)); },
  },
  {
    id: 'gross_ar_days', code: 'AR-06', name: 'Gross A/R days', area: 'A/R', unit: 'days', direction: 'down', type: 'balance', page: 'ar', finest: 'month',
    definition: 'Month-end gross accounts receivable divided by trailing average daily gross patient service revenue.',
    calculation: 'Ending Gross AR ÷ (Trailing 90-Day Gross Patient Service Revenue ÷ 90)',
    formula: 'Gross A/R at period end / average daily gross revenue (last 90 days)',
    sourceFields: ['ar_snapshot.gross_balance', 'account.gross_charges'], multiDef: true, fact: 'ar',
    compute: (c0) => { const c = whole(c0); const v = ar(c, 'gross'); return v === null ? null : div(v, adgr(c, arDay(c)!)); },
  },
  {
    id: 'ar_gt90_pct', code: 'AR-07', name: 'A/R > 90 days', area: 'A/R', unit: 'pct', direction: 'down', type: 'balance', page: 'ar', finest: 'month',
    definition: 'Percentage of billed gross AR in the aged trial balance 91+ day aging buckets.',
    calculation: '(Billed Gross AR in 91+ Buckets ÷ Total Billed Gross AR) × 100, period-end snapshot',
    formula: 'Billed gross A/R aged 91+ days / total billed gross A/R',
    sourceFields: ['ar_snapshot.gross_balance', 'ar_snapshot.aging_bucket', 'ar_snapshot.billed_status'], fact: 'ar',
    compute: (c0) => { const c = whole(c0); const a = ar(c, 'gross', { ageMin: 3, billed: [1, 2] }); const b = ar(c, 'gross', { billed: [1, 2] }); return a === null || b === null ? null : div(a, b); },
  },
  {
    id: 'ar_gt180_pct', code: 'AR-08', name: 'A/R > 180 days', area: 'A/R', unit: 'pct', direction: 'down', type: 'balance', page: 'ar', finest: 'month',
    definition: 'Share of gross A/R more than 180 days from discharge.',
    calculation: 'Gross A/R aged 181+ days / gross A/R, period-end snapshot',
    formula: 'Gross A/R aged 181+ days / total gross A/R',
    sourceFields: ['ar_snapshot.gross_balance', 'ar_snapshot.aging_bucket'], fact: 'ar',
    compute: (c0) => { const c = whole(c0); const a = ar(c, 'gross', { ageMin: 5 }); const b = ar(c, 'gross'); return a === null || b === null ? null : div(a, b); },
  },
  // ================= Denials =================
  {
    id: 'denial_rate', code: 'DN-03', name: 'Initial denial rate', short: 'Denial rate', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Claims with an initial denial (by denial date) as a share of claims submitted (by submit date) in the period.',
    calculation: 'COUNT(denial.claim_id, denial date) / COUNT(claim.claim_id, submit date)',
    formula: 'Claims initially denied / claims submitted',
    sourceFields: ['denial.claim_id', 'denial.denial_date', 'claim.claim_id', 'claim.submit_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(c.e.sum('acc', '__one', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' }), s(c, '__one', 'sbd')),
  },
  {
    id: 'denial_dollar_rate', code: 'DN-04', name: 'Initial denial rate (claim dollars)', short: 'Denial rate ($)', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Gross charges on claims initially denied at first adjudication as a percentage of gross charges on claims submitted. Prototype: denials by denial date over claims by submit date in the same period (a period-matched approximation of the submission cohort).',
    calculation: '(Gross Charges on Initially Denied Claims ÷ Gross Charges on Claims Submitted) × 100',
    formula: 'Gross charges on initially denied claims / gross charges on claims submitted',
    sourceFields: ['denial.gross_amount', 'denial.denial_date', 'claim.gross_charges', 'claim.submit_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(denied(c), submittedGross(c)),
  },
  {
    id: 'denial_dollars', code: 'DN-05', name: 'Initial denials ($)', short: 'Denied $', area: 'Denials', unit: 'usd', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Gross charges on claims with an initial denial, by denial date.',
    calculation: 'SUM(denial.gross_amount) WHERE denial_date IN period',
    formula: 'Total gross charges on initially denied claims',
    sourceFields: ['denial.gross_amount', 'denial.denial_date', 'denial.root_cause'], fact: 'acc',
    compute: (c) => denied(c),
  },
  {
    id: 'denied_claims', code: 'DN-06', name: 'Denied claims', area: 'Denials', unit: 'count', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Number of claims with an initial denial, by denial date.',
    calculation: 'COUNT(denial.claim_id) WHERE denial_date IN period',
    formula: 'Count of claims with an initial denial',
    sourceFields: ['denial.claim_id', 'denial.denial_date'], fact: 'acc',
    compute: (c) => c.e.sum('acc', '__one', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' }),
  },
  {
    id: 'denial_pct_npsr', code: 'DN-07', name: 'Denials as % of NPSR', short: 'Denials % NPSR', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Expected net revenue on initially denied claims as a share of NPSR in the period.',
    calculation: 'SUM(denied account expected_net, denial date) / NPSR (discharge date)',
    formula: 'Expected net revenue on denied claims / NPSR',
    sourceFields: ['denial.claim_id', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(denied(c, 'denNet'), net(c)),
  },
  {
    id: 'recoverable_pct', code: 'DN-08', name: 'Recoverable denials', short: 'Recoverable %', area: 'Denials', unit: 'pct', direction: 'none', type: 'flow', page: 'denials',
    definition: 'Share of denied dollars whose root cause is usually correctable or appealable.',
    calculation: 'SUM(denial.gross_amount WHERE root_cause.recoverable) / SUM(denial.gross_amount)',
    formula: 'Denied $ with a recoverable root cause / total denied $',
    sourceFields: ['denial.gross_amount', 'root_cause.recoverable'], fact: 'acc',
    compute: (c) => div(recoverableDollars(c), denied(c)),
  },
  {
    id: 'appeal_rate', code: 'DN-09', name: 'Appeal rate', area: 'Denials', unit: 'pct', direction: 'none', type: 'flow', page: 'denials',
    definition: 'Share of denied claims (by denial date) that were formally appealed. Corrected-and-rebilled claims are not appeals.',
    calculation: 'COUNT(denial WHERE appealed) / COUNT(denial), by denial date',
    formula: 'Appealed denials / denials',
    sourceFields: ['denial.appeal_flag', 'denial.denial_date'], fact: 'acc',
    compute: (c) => div(s(c, 'apl', 'denD', { detail: 'denial' }), c.e.sum('acc', '__one', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' })),
  },
  {
    id: 'appeal_success', code: 'DN-10', name: 'Appeal success rate', short: 'Appeal success', area: 'Denials', unit: 'pct', direction: 'up', type: 'flow', page: 'denials',
    definition: 'Share of appeals resolved in the period that were overturned (paid).',
    calculation: 'COUNT(appeal WHERE resolved AND overturned) / COUNT(appeal WHERE resolved), by resolution date',
    formula: 'Appeals overturned / appeals resolved',
    sourceFields: ['appeal.outcome', 'appeal.resolution_date'], fact: 'acc',
    compute: (c) => div(s(c, 'aplOvt', 'closeD', { detail: 'denial' }), c.e.sum('acc', 'apl', 'closeD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' })),
  },
  {
    id: 'appeal_upheld_rate', code: 'DN-11', name: 'Appeal upheld rate', short: 'Upheld rate', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Share of resolved appeals where the payer upheld the denial (not overturned). For clinical appeals, filter the denial category to Medical necessity and Documentation.',
    calculation: 'COUNT(appeal WHERE resolved AND NOT overturned) / COUNT(appeal WHERE resolved), by resolution date',
    formula: 'Appeals upheld (not overturned) / appeals resolved',
    sourceFields: ['appeal.status', 'appeal.outcome', 'appeal.resolved_date'], fact: 'acc',
    compute: (c) => {
      const res = c.e.sum('acc', 'apl', 'closeD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' });
      return div(res - s(c, 'aplOvt', 'closeD', { detail: 'denial' }), res);
    },
  },
  {
    id: 'appeals_filed', code: 'DN-12', name: 'Appeals filed', area: 'Denials', unit: 'count', direction: 'none', type: 'flow', page: 'denials',
    definition: 'Denials appealed, by denial date (new appeal volume). For clinical appeals, filter the denial category.',
    calculation: 'COUNT(denial WHERE appealed), by denial date',
    formula: 'Count of denials appealed',
    sourceFields: ['appeal.status', 'claim_denial.denial_date'], fact: 'acc',
    compute: (c) => s(c, 'apl', 'denD', { detail: 'denial' }),
  },
  {
    id: 'appeals_resolved', code: 'DN-13', name: 'Appeals resolved', area: 'Denials', unit: 'count', direction: 'none', type: 'flow', page: 'denials',
    definition: 'Appeals closed in the period (overturned or upheld).',
    calculation: 'COUNT(appeal WHERE resolved_date IN period)',
    formula: 'Count of appeals resolved (overturned or upheld)',
    sourceFields: ['appeal.resolved_date'], fact: 'acc',
    compute: (c) => c.e.sum('acc', 'apl', 'closeD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' }),
  },
  {
    id: 'appeals_open', code: 'DN-14', name: 'Open appeals', area: 'Denials', unit: 'count', direction: 'down', type: 'balance', page: 'denials',
    definition: 'Denials marked for appeal and not yet resolved at period end (to be appealed, 1st and 2nd level).',
    calculation: 'COUNT(appeal WHERE filed AND NOT resolved) at period end',
    formula: 'Count of appeals filed and not resolved at period end',
    sourceFields: ['appeal.status'], fact: 'acc',
    compute: (c) => { const st = appealStatusCounts(c.e, endOf(c), c.sel); return st[1] + st[2] + st[3]; },
  },
  {
    id: 'denial_writeoffs', code: 'DN-15', name: 'Denial write-offs', area: 'Denials', unit: 'usd', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Expected net revenue written off after a final denial, by write-off date.',
    calculation: 'SUM(transaction.amount) WHERE type = DENIAL_WRITE_OFF AND post_date IN period',
    formula: 'Total expected net revenue written off after a final denial',
    sourceFields: ['transaction.amount', 'transaction.type', 'denial.root_cause'], fact: 'acc',
    compute: (c) => s(c, 'woAmt', 'woD', { detail: 'denial' }),
  },
  {
    id: 'denial_wo_pct_npsr', code: 'DN-16', name: 'Denial write-offs % of NPSR', short: 'Denial W/O % NPSR', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials', digits: 2,
    definition: 'Denial write-offs as a share of NPSR in the same period.',
    calculation: 'Denial write-offs (post date) / NPSR (discharge date)',
    formula: 'Denial write-offs / NPSR',
    sourceFields: ['transaction.amount', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'woAmt', 'woD', { detail: 'denial' }), net(c)),
  },
  {
    id: 'front_end_denial_rate', code: 'PA-02', name: 'Front-end denial rate', area: 'Patient Access', unit: 'pct', direction: 'down', type: 'flow', page: 'access', digits: 2,
    definition: 'Denied dollars in eligibility, authorization and coordination-of-benefits categories as a share of gross charges submitted.',
    calculation: 'SUM(denial.gross_amount WHERE category IN (Eligibility, Authorization, COB)) / SUM(claim.gross_charges, submit date)',
    formula: 'Denied $ (eligibility, authorization, COB) / gross charges submitted',
    sourceFields: ['denial.gross_amount', 'denial.category', 'claim.gross_charges'], fact: 'acc',
    compute: (c) => div(deniedIn(c, [0, 1, 5]), submittedGross(c)),
  },
  // ================= Billing =================
  {
    id: 'clean_claim_rate', code: 'BL-01', name: 'Clean claim rate', area: 'Billing', unit: 'pct', direction: 'up', type: 'flow', page: 'billing',
    definition: 'Share of claims that pass all edits on first submission with no manual touch.',
    calculation: 'COUNT(claim WHERE first_pass_clean) / COUNT(claim), by submit date',
    formula: 'Claims clean on first submission / claims submitted',
    sourceFields: ['claim.first_pass_clean', 'claim.submit_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'clean', 'sbd'), s(c, '__one', 'sbd')),
  },
  {
    id: 'rework_claims', code: 'BL-02', name: 'Claims failing edits', short: 'Edit failures', area: 'Billing', unit: 'count', direction: 'down', type: 'flow', page: 'billing',
    definition: 'Claims that failed at least one claim edit on first submission and needed manual rework.',
    calculation: 'COUNT(claim WHERE NOT first_pass_clean), by submit date (split by edit category)',
    formula: 'Count of claims that failed an edit on first submission',
    sourceFields: ['claim_edit.category', 'claim.submit_date'], fact: 'acc',
    compute: (c) => s(c, '__one', 'sbd', { detail: 'edit' }) - s(c, 'clean', 'sbd', { detail: 'edit' }),
  },
  {
    id: 'claims_submitted', code: 'BL-03', name: 'Claims submitted', area: 'Billing', unit: 'count', direction: 'none', type: 'flow', page: 'billing',
    definition: 'Claims sent to payers in the period.',
    calculation: 'COUNT(claim) WHERE submit_date IN period',
    formula: 'Count of claims submitted',
    sourceFields: ['claim.claim_id', 'claim.submit_date'], fact: 'acc',
    compute: (c) => s(c, '__one', 'sbd'),
  },
  {
    id: 'claims_submitted_dollars', code: 'BL-04', name: 'Claims submitted ($)', short: 'Submitted $', area: 'Billing', unit: 'usd', direction: 'none', type: 'flow', page: 'billing',
    definition: 'Gross charges on claims exported from the scrubber to payers in the period.',
    calculation: 'SUM(claim.gross_charges) WHERE submit_date IN period',
    formula: 'Total gross charges on claims submitted',
    sourceFields: ['claim.gross_charges', 'claim.submit_date'], fact: 'acc',
    compute: (c) => submittedGross(c),
  },
  {
    id: 'first_pass_yield', code: 'BL-05', name: 'First pass yield', area: 'Billing', unit: 'pct', direction: 'up', type: 'flow', page: 'billing',
    definition: 'Share of adjudicated insurance claims that passed edits on the first submission, were not denied, and were paid. Prototype: a claim with no scrubber edit stands in for "no 277 rejection".',
    calculation: 'COUNT(claim WHERE no edit AND no 277 rejection AND no denial AND paid) / COUNT(claim adjudicated), by submit date',
    formula: 'Claims with no edit, no rejection, no denial and paid / claims adjudicated',
    sourceFields: ['claim_edit.category', 'claim_status_277.status', 'claim_denial.denial_date', 'transaction.amount'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'fpy', 'sbd'), s(c, 'adjud', 'sbd')),
  },
  {
    id: 'billing_lag', code: 'BL-06', name: 'Billing lag (final bill to submit)', short: 'Billing lag', area: 'Billing', unit: 'days', direction: 'down', type: 'flow', page: 'billing',
    definition: 'Average days from final bill to claim submission, for claims submitted in the period.',
    calculation: 'AVG(submit_date − final_bill_date) WHERE submit_date IN period',
    formula: 'Average days from final bill to claim submission',
    sourceFields: ['claim.submit_date', 'account.final_bill_date'], fact: 'acc',
    compute: (c) => div(s(c, 'sbL', 'sbd'), s(c, '__one', 'sbd')),
  },
  {
    id: 'dnfb_dollars', code: 'BL-07', name: 'DNFB', short: 'DNFB $', area: 'Billing', unit: 'usd', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Gross charges of discharged accounts not yet final billed, at the period-end snapshot.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE stage = DNFB AND snapshot_date = period end',
    formula: 'Total gross charges on discharged accounts not final billed at period end',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.stage'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0),
  },
  {
    id: 'dnfb_days', code: 'BL-08', name: 'Days in DNFB', short: 'DNFB days', area: 'Billing', unit: 'days', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Month-end gross charges for discharged accounts not yet final billed, expressed as days of average daily gross patient service revenue. Target: bill hold + 1.5 days.',
    calculation: 'Month-End Gross Dollars in DNFB ÷ (Trailing 90-Day Gross Patient Service Revenue ÷ 90)',
    formula: 'DNFB $ at period end / average daily gross revenue (last 90 days)',
    sourceFields: ['dnfb_snapshot.gross_amount', 'account.gross_charges'], multiDef: true, fact: 'dnfb',
    target: () => CONFIG.framework.billHoldDays + 1.5,
    compute: (c) => { const v = dnfb(c, 0); return v === null ? null : div(v, adgr(c, dnfbDay(c)!)); },
  },
  {
    id: 'dnsp_days', code: 'BL-09', name: 'Billed not submitted days', short: 'DNSP days', area: 'Billing', unit: 'days', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Final-billed charges held by claim edits (not yet sent to the payer) at period end, as days of average daily gross charges.',
    calculation: 'DNSP $ (period end) / (SUM(gross_charges, last 90 days) / 90)',
    formula: 'Billed not submitted $ at period end / average daily gross charges (last 90 days)',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.stage'], fact: 'dnfb',
    compute: (c) => { const v = dnfb(c, 1); return v === null ? null : div(v, adgr(c, dnfbDay(c)!)); },
  },
  {
    id: 'dnsp_dollars', code: 'BL-10', name: 'Billed not submitted ($)', short: 'DNSP $', area: 'Billing', unit: 'usd', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Gross charges on final-billed claims not yet exported to the payer (open scrubber edits) at period end.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE stage = DNSP AND snapshot_date = period end',
    formula: 'Total gross charges on final-billed claims not yet sent to the payer at period end',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.stage'], fact: 'dnfb',
    compute: (c) => dnfb(c, 1),
  },
  {
    id: 'dnsp_accounts', code: 'BL-11', name: 'Billed claims not submitted', short: 'DNSP claims', area: 'Billing', unit: 'count', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Final-billed claims with no export to the payer (open scrubber edits) at period end.',
    calculation: 'COUNT(dnfb_snapshot.account) WHERE stage = DNSP AND snapshot_date = period end',
    formula: 'Count of final-billed claims not yet sent to the payer at period end',
    sourceFields: ['dnfb_snapshot.stage'], fact: 'dnfb',
    compute: (c) => dnfb(c, 1, { col: 'count' }),
  },
  {
    id: 'unbilled_accounts', code: 'BL-12', name: 'Unbilled accounts (DNFB)', short: 'Unbilled accounts', area: 'Billing', unit: 'count', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Number of discharged accounts not final billed at the period-end snapshot.',
    calculation: 'COUNT(dnfb_snapshot.account) WHERE stage = DNFB AND snapshot_date = period end',
    formula: 'Count of discharged accounts not final billed at period end',
    sourceFields: ['dnfb_snapshot.account_count'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0, { col: 'count' }),
  },
  {
    id: 'dnfb_15plus_pct', code: 'BL-13', name: 'DNFB aged 15+ days', short: 'DNFB 15+ days %', area: 'Billing', unit: 'pct', direction: 'down', type: 'balance', page: 'billing', finest: 'week',
    definition: 'Share of DNFB dollars 15 or more days past discharge.',
    calculation: 'DNFB $ aged 15+ days / DNFB $, period-end snapshot',
    formula: 'DNFB $ aged 15+ days / total DNFB $',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.age_bucket'], fact: 'dnfb',
    compute: (c) => { const a = dnfb(c, 0, { ageMin: 3 }); const b = dnfb(c, 0); return a === null || b === null ? null : div(a, b); },
  },
  // ================= Charge capture =================
  {
    id: 'charge_lag', code: 'CC-01', name: 'Charge lag', area: 'Charge Capture', unit: 'days', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Average days from date of service to charge posting, for accounts discharged in the period.',
    calculation: 'AVG(charge_post_date − service_date) WHERE discharge_date IN period',
    formula: 'Average days from date of service to charge posting',
    sourceFields: ['charge.post_date', 'charge.service_date'], fact: 'acc',
    compute: (c) => div(s(c, 'chgLag', 'dd'), s(c, '__one', 'dd')),
  },
  {
    id: 'late_charge_pct', code: 'CC-02', name: 'Late charges', short: 'Late charge %', area: 'Charge Capture', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Charges posted after the final bill (requiring a late charge or corrected claim), as a share of gross charges.',
    calculation: 'SUM(charge.amount WHERE post_date > final_bill_date) / SUM(gross_charges), by discharge date',
    formula: 'Charges posted after the final bill / gross charges',
    sourceFields: ['charge.amount', 'charge.post_date', 'account.final_bill_date'], fact: 'acc',
    compute: (c) => div(s(c, 'lateAmt', 'dd'), gross(c)),
  },
  {
    id: 'missing_charges', code: 'CC-03', name: 'Missing charges recovered', area: 'Charge Capture', unit: 'usd', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Charges found by charge reconciliation and added before billing, for accounts discharged in the period.',
    calculation: 'SUM(charge.amount WHERE source = RECONCILIATION) WHERE discharge_date IN period',
    formula: 'Total charges found by charge reconciliation before billing',
    sourceFields: ['charge.amount', 'charge.source'], fact: 'acc',
    compute: (c) => s(c, 'missAmt', 'dd'),
  },
  {
    id: 'late_charges_dollars', code: 'CC-04', name: 'Late charges ($)', short: 'Late charges $', area: 'Charge Capture', unit: 'usd', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Charges posted after the final bill, for accounts discharged in the period.',
    calculation: 'SUM(charge.amount WHERE post_date > final_bill_date), by discharge date',
    formula: 'Total charges posted after the final bill',
    sourceFields: ['charge.amount', 'charge.post_date', 'account.final_bill_date'], fact: 'acc',
    compute: (c) => s(c, 'lateAmt', 'dd'),
  },
  {
    id: 'missed_charge_rate', code: 'CC-05', name: 'Missed charge rate', area: 'Charge Capture', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Charges found missing by charge reconciliation, as a share of gross charges.',
    calculation: 'SUM(charge.amount WHERE source = RECONCILIATION) / SUM(gross_charges), by discharge date',
    formula: 'Charges found missing by reconciliation / gross charges',
    sourceFields: ['charge.amount', 'charge.source'], fact: 'acc',
    compute: (c) => div(s(c, 'missAmt', 'dd'), gross(c)),
  },
  {
    id: 'charges_posted', code: 'CC-06', name: 'Charges posted', area: 'Charge Capture', unit: 'usd', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Gross charges captured for accounts discharged in the period.',
    calculation: 'SUM(charge.amount) WHERE discharge_date IN period',
    formula: 'Total gross charges posted',
    sourceFields: ['charge.amount'], fact: 'acc',
    compute: (c) => gross(c),
  },
  // ================= Coding =================
  {
    id: 'coding_tat', code: 'CO-01', name: 'Coding turnaround', short: 'Coding TAT', area: 'Coding', unit: 'days', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Average days from discharge to coding complete, for accounts coded in the period.',
    calculation: 'AVG(coded_date − discharge_date) WHERE coded_date IN period',
    formula: 'Average days from discharge to coding complete',
    sourceFields: ['account.coded_date', 'account.discharge_date'], fact: 'acc',
    compute: (c) => div(s(c, 'codeL', 'codeD'), s(c, '__one', 'codeD')),
  },
  {
    id: 'coding_tat_ip', code: 'CO-02', name: 'Coding turnaround, inpatient', short: 'IP coding TAT', area: 'Coding', unit: 'days', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Average days from discharge to coding complete for inpatient accounts coded in the period.',
    calculation: 'AVG(coded_date − discharge_date) WHERE patient_type = Inpatient AND coded_date IN period',
    formula: 'Average days from discharge to coding complete (inpatient only)',
    sourceFields: ['account.coded_date', 'account.patient_type'], fact: 'acc',
    compute: (c) => div(s(c, 'codeL', 'codeD', { pred: 'inpatient' }), s(c, '__one', 'codeD', { pred: 'inpatient' })),
  },
  {
    id: 'final_coded_volume', code: 'CO-03', name: 'Final coded accounts', short: 'Final coded', area: 'Coding', unit: 'count', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Accounts final coded in the period. Split by type with the patient type filter.',
    calculation: 'COUNT(account) WHERE coded_date IN period',
    formula: 'Count of accounts final coded',
    sourceFields: ['account.coded_date'], fact: 'acc',
    compute: (c) => s(c, '__one', 'codeD'),
  },
  {
    id: 'coding_denial_rate', code: 'CO-04', name: 'Coding denial rate', area: 'Coding', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Denied dollars in the Coding category as a share of gross charges submitted.',
    calculation: 'SUM(denial.gross_amount WHERE category = Coding) / SUM(claim.gross_charges, submit date)',
    formula: 'Denied $ (coding category) / gross charges submitted',
    sourceFields: ['denial.gross_amount', 'denial.category'], fact: 'acc',
    compute: (c) => div(deniedIn(c, [3]), submittedGross(c)),
  },
  {
    id: 'dnfb_coding', code: 'CO-05', name: 'DNFB awaiting coding', area: 'Coding', unit: 'usd', direction: 'down', type: 'balance', page: 'midcycle', finest: 'week',
    definition: 'DNFB dollars on hold for coding at the period-end snapshot.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE hold_reason = Awaiting coding',
    formula: 'Total DNFB $ on hold for coding at period end',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.hold_reason'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0, { hold: [1] }),
  },
  // ================= Clinical documentation =================
  {
    id: 'cdi_query_rate', code: 'CD-01', name: 'CDI query rate', area: 'Clinical Documentation', unit: 'pct', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Share of inpatient discharges with at least one physician documentation query.',
    calculation: 'COUNT(inpatient account WHERE query_count > 0) / COUNT(inpatient account), by discharge date',
    formula: 'Inpatient discharges with a documentation query / inpatient discharges',
    sourceFields: ['cdi_query.account_id', 'account.patient_type'], fact: 'acc',
    compute: (c) => div(s(c, 'qry', 'dd', { pred: 'inpatient' }), s(c, '__one', 'dd', { pred: 'inpatient' })),
  },
  {
    id: 'documentation_denial_rate', code: 'CD-02', name: 'Documentation-related denial rate', short: 'Doc. denial rate', area: 'Clinical Documentation', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Denied dollars in Documentation and Medical necessity categories as a share of gross charges submitted.',
    calculation: 'SUM(denial.gross_amount WHERE category IN (Documentation, Medical necessity)) / SUM(claim.gross_charges, submit date)',
    formula: 'Denied $ (documentation, medical necessity) / gross charges submitted',
    sourceFields: ['denial.gross_amount', 'denial.category'], fact: 'acc',
    compute: (c) => div(deniedIn(c, [2, 4]), submittedGross(c)),
  },
  {
    id: 'dnfb_query', code: 'CD-03', name: 'DNFB on physician query', area: 'Clinical Documentation', unit: 'usd', direction: 'down', type: 'balance', page: 'midcycle', finest: 'week',
    definition: 'DNFB dollars on hold for a physician documentation query at the period-end snapshot.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE hold_reason = Physician query',
    formula: 'Total DNFB $ on hold for a physician query at period end',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.hold_reason'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0, { hold: [2] }),
  },
  // ================= Patient access =================
  feMetric('eligibility_rate', 'Eligibility verification rate', 'Eligibility rate', 'pct', 'up', 'Share of registrations with insurance eligibility verified electronically before or at service.', 'eligVerified', 'eligDue', { code: 'PA-03', formula: 'Registrations with eligibility verified / registrations that need verification' }),
  feMetric('auth_rate', 'Authorization rate', 'Auth rate', 'pct', 'up', 'Share of services that require authorization with an authorization on file.', 'authObtained', 'authRequired', { code: 'PA-04', formula: 'Services with an authorization on file / services that need authorization' }),
  feMetric('preservice_auth_rate', 'Pre-service authorization rate', 'Pre-service auth', 'pct', 'up', 'Share of services that require authorization with the authorization obtained before the date of service.', 'authPreService', 'authRequired', { code: 'PA-05', formula: 'Authorizations obtained before service / services that need authorization' }),
  {
    id: 'registration_accuracy', code: 'PA-06', name: 'Registration accuracy', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Share of submitted claims with no registration or demographic edit.',
    calculation: '1 − COUNT(claim WHERE edit_category = Registration) / COUNT(claim), by submit date',
    formula: '1 − (claims with a registration edit / claims submitted)',
    sourceFields: ['claim_edit.category', 'claim.submit_date'], fact: 'acc',
    compute: (c) => { const n = s(c, '__one', 'sbd'); return n > 0 ? 1 - s(c, 'regErr', 'sbd') / n : null; },
  },
  {
    id: 'registration_edits', code: 'PA-07', name: 'Registration edits', area: 'Patient Access', unit: 'count', direction: 'down', type: 'flow', page: 'access',
    definition: 'Claims that failed a registration or demographic edit, by submit date. Stand-in for RQA edit volume until the registration quality (RQA) feed is loaded.',
    calculation: 'COUNT(claim WHERE edit_category = Registration), by submit date',
    formula: 'Count of claims with a registration or demographic edit',
    sourceFields: ['claim_edit.category', 'claim.submit_date'], fact: 'acc',
    compute: (c) => s(c, 'regErr', 'sbd'),
  },
  feMetric('fin_clearance_rate', 'Financial clearance rate', 'Financial clearance', 'pct', 'up', 'Share of scheduled patients financially cleared (eligibility, benefits, estimate and authorization) before service.', 'finCleared', 'finClearDue', { code: 'PA-08', formula: 'Patients financially cleared before service / scheduled patients due for clearance' }),
  feMetric('prereg_rate', 'Pre-registration rate', 'Pre-registration', 'pct', 'up', 'Share of scheduled encounters pre-registered at least 24 hours before service.', 'preRegDone', 'preRegDue', { code: 'PA-09', formula: 'Encounters pre-registered 24+ hours before service / scheduled encounters due' }),
  feMetric('scheduled_rate', 'Order scheduling rate', 'Scheduled rate', 'pct', 'up', 'Share of received orders that are scheduled.', 'ordersScheduled', 'ordersReceived', { code: 'PA-10', formula: 'Orders scheduled / orders received' }),
  feCountMetric('scheduled_volume', 'Scheduled volume', 'Appointments scheduled from orders in the period.', 'ordersScheduled', { code: 'PA-11', formula: 'Count of orders scheduled' }),
  feCountMetric('orders_received', 'Orders received', 'Orders received for scheduled services.', 'ordersReceived', { code: 'PA-12', formula: 'Count of orders received' }),
  {
    id: 'scheduled_rate_final', code: 'PA-13', name: 'Order scheduling rate (final outcomes)', short: 'Scheduled rate (final)', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Orders scheduled, as a share of orders with a final outcome (scheduled, cancelled or leaked to another provider). Orders still in process, duplicates and orders already scheduled are left out.',
    calculation: 'SUM(orders_scheduled) / SUM(orders_scheduled + orders_cancelled + orders_leakage), by date',
    formula: 'Orders scheduled / (orders scheduled + cancelled + leaked)',
    sourceFields: ['scheduling_daily.orders_scheduled', 'scheduling_daily.orders_cancelled', 'scheduling_daily.orders_leakage'], multiDef: true, fact: 'fe',
    compute: (c) => (c.e.feHasCol('ordersCancelled', c.sel) ? div(fe(c, 'ordersScheduled'), fe(c, 'ordersScheduled') + fe(c, 'ordersCancelled') + fe(c, 'ordersLeakage')) : null),
  },
  {
    id: 'orders_closed_unscheduled', code: 'PA-14', name: 'Orders closed without scheduling', short: 'Closed unscheduled', area: 'Patient Access', unit: 'count', direction: 'none', type: 'flow', page: 'access',
    definition: 'Orders closed with no appointment: duplicate, already scheduled, leaked to another provider, or cancelled.',
    calculation: 'SUM(orders_duplicate + orders_already_scheduled + orders_leakage + orders_cancelled), by date',
    formula: 'Duplicate + already scheduled + leaked + cancelled orders',
    sourceFields: ['scheduling_daily.order_outcome'], fact: 'fe',
    compute: (c) => (c.e.feHasCol('ordersCancelled', c.sel) ? ORDER_OUTCOMES.reduce((t, o) => t + fe(c, o.col), 0) : null),
  },
  {
    id: 'open_orders_24h_pct', code: 'PA-15', name: 'Open orders in process > 24 hours', short: 'Open orders > 24h', area: 'Patient Access', unit: 'pct', direction: 'down', type: 'balance', page: 'access',
    definition: 'Share of open orders (to be scheduled) that have been in process for more than 24 hours, at period end.',
    calculation: 'open_orders_over_24h_eod / open_orders_eod on the last day of the period',
    formula: 'Open orders in process > 24 hours / open orders, at period end',
    sourceFields: ['scheduling_daily.open_orders_over_24h_eod', 'scheduling_daily.open_orders_eod'], fact: 'fe',
    compute: (c) => {
      if (!c.e.feHasCol('openOrders24hEod', c.sel)) return null;
      const d = Math.min(c.r.endDay, c.e.lastDay);
      return div(c.e.snapshot('fe', 'openOrders24hEod', d, c.sel), c.e.snapshot('fe', 'openOrdersEod', d, c.sel));
    },
  },
  {
    id: 'schedule_lead_time', code: 'PA-16', name: 'Average scheduling lead time', short: 'Lead time', area: 'Patient Access', unit: 'days', direction: 'none', type: 'flow', page: 'access',
    definition: 'Average days from scheduling to the appointment, for appointments scheduled in the period.',
    calculation: 'SUM(schedule_days) / SUM(orders_scheduled), by date',
    formula: 'Total days from scheduling to appointment / orders scheduled',
    sourceFields: ['scheduling_daily.schedule_days_sum', 'scheduling_daily.orders_scheduled'], fact: 'fe',
    compute: (c) => feRatio(c, 'scheduleDaysSum', 'ordersScheduled'),
  },
  feMetric('lead_time_3plus_pct', '% scheduled with lead time 3+ days', 'Lead time 3+ days', 'pct', 'up', 'Share of appointments scheduled 3 or more days before the date of service.', 'ordersScheduled3Plus', 'ordersScheduled', { code: 'PA-17', formula: 'Appointments scheduled 3+ days before service / appointments scheduled' }),
  feMetric('prereg_rate_72h', 'Pre-registration finalization rate (72 hours)', 'Pre-registration 72h', 'pct', 'up', 'Share of scheduled encounters with pre-registration finalized at least 72 hours before service.', 'preRegDone72', 'preRegDue', { code: 'PA-18', formula: 'Encounters pre-registered 72+ hours before service / scheduled encounters due' }),
  feMetric('scheduled_under_72h_pct', '% of accounts scheduled < 72 hours before service', 'Scheduled < 72h', 'pct', 'down', 'Share of scheduled encounters booked less than 72 hours before the date of service (too late for the 72-hour pre-registration and financial clearance windows).', 'scheduledUnder72h', 'preRegDue', { code: 'PA-19', formula: 'Encounters scheduled < 72 hours before service / scheduled encounters due' }),
  feMetric('fin_clearance_rate_72h', 'Financial clearance rate (72 hours)', 'Financial clearance 72h', 'pct', 'up', 'Share of scheduled patients financially cleared at least 72 hours before service.', 'finCleared72', 'finClearDue', { code: 'PA-20', formula: 'Patients financially cleared 72+ hours before service / scheduled patients due for clearance' }),
  {
    id: 'open_orders', code: 'PA-21', name: 'Open orders', area: 'Patient Access', unit: 'count', direction: 'down', type: 'balance', page: 'access',
    definition: 'Orders not yet scheduled at the end of the last day of the period.',
    calculation: 'open_orders_eod on the last day of the period',
    formula: 'Count of orders not yet scheduled at period end',
    sourceFields: ['scheduling_daily.open_orders_eod'], fact: 'fe',
    compute: (c) => (c.e.feHasCol('openOrdersEod', c.sel) ? c.e.snapshot('fe', 'openOrdersEod', Math.min(c.r.endDay, c.e.lastDay), c.sel) : null),
  },
  {
    id: 'pos_collections', code: 'PA-22', name: 'Point-of-service collections', short: 'POS collections', area: 'Patient Access', unit: 'usd', direction: 'up', type: 'flow', page: 'access',
    definition: 'Patient cash collected at or before the point of service.',
    calculation: 'SUM(transaction.amount) WHERE type = PAYMENT AND pos_flag AND post_date IN period',
    formula: 'Total patient cash collected at or before service',
    sourceFields: ['transaction.amount', 'transaction.pos_flag'], fact: 'acc',
    compute: (c) => s(c, 'pos', 'dd'),
  },
  {
    id: 'pos_rate', code: 'PA-23', name: 'POS collection rate', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Point-of-service cash as a share of expected self-pay patient liability for encounters in the period.',
    calculation: 'SUM(POS cash) / SUM(expected_net WHERE financial_class = Self Pay), by service date',
    formula: 'Point-of-service cash / expected self-pay patient liability',
    sourceFields: ['transaction.amount', 'account.expected_net', 'payer.financial_class'], fact: 'acc',
    compute: (c) => div(s(c, 'pos', 'dd'), s(c, 'net', 'dd', { pred: 'selfPay' })),
  },
  {
    id: 'pos_yield', code: 'PA-24', name: 'POS collection yield (vs estimate)', short: 'POS yield', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Point-of-service cash as a share of the estimated patient liability, on accounts with an estimate. Prototype: estimates exist for self-pay accounts only.',
    calculation: 'SUM(POS cash WHERE estimate exists) / SUM(estimated patient liability), by service date',
    formula: 'Point-of-service cash (accounts with an estimate) / estimated patient liability',
    sourceFields: ['transaction.amount', 'transaction.pos_flag', 'estimate.patient_liability'], fact: 'acc',
    compute: (c) => div(s(c, 'posEst', 'dd'), s(c, 'estLiab', 'dd')),
  },
  {
    id: 'pos_estimate_accuracy', code: 'PA-25', name: 'POS estimate accuracy', short: 'Estimate accuracy', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Share of patient liability estimates within 10% of the final patient liability.',
    calculation: 'COUNT(estimate WHERE ABS(estimate − final liability) ≤ 10% × final liability) / COUNT(estimate), by service date',
    formula: 'Estimates within 10% of the final liability / estimates',
    sourceFields: ['estimate.patient_liability', 'account.patient_liability'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'estOk', 'dd'), s(c, 'estCnt', 'dd')),
  },
  {
    id: 'pos_missed_residual_pct', code: 'PA-26', name: 'Missed POS opportunity (known residual)', short: 'Missed POS %', area: 'Patient Access', unit: 'pct', direction: 'down', type: 'flow', page: 'access',
    definition: 'Known patient liability (estimate) not collected at the point of service, as a share of the estimate.',
    calculation: 'SUM(MAX(0, estimate − POS cash)) / SUM(estimate), by service date',
    formula: 'Estimated liability not collected at service / estimated liability',
    sourceFields: ['estimate.patient_liability', 'transaction.amount', 'transaction.pos_flag'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'estResid', 'dd'), s(c, 'estLiab', 'dd')),
  },
  { ...feCountMetric('call_volume', 'Inbound calls (patient access)', 'Inbound calls offered to the patient access line.', 'callsOffered', { code: 'PA-27', formula: 'Count of inbound calls offered (patient access line)' }), short: 'Inbound calls' },
  { ...feCountMetric('calls_outbound', 'Outbound calls (patient access)', 'Outbound calls made by patient access staff.', 'callsOutbound', { code: 'PA-28', formula: 'Count of outbound calls (patient access)' }), short: 'Outbound calls' },
  {
    id: 'call_volume_total', code: 'PA-29', name: 'Total call volume (all lines, inbound + outbound)', short: 'Total calls', area: 'Patient Access', unit: 'count', direction: 'none', type: 'flow', page: 'access',
    definition: 'Inbound and outbound calls on all in-scope lines: patient access (front end) and the business office customer service line (back end).',
    calculation: 'SUM(calls_offered + calls_outbound + cbo_calls_offered), by date',
    formula: 'Inbound calls (all lines) + outbound calls',
    sourceFields: ['contact_center_daily.calls_offered', 'contact_center_daily.calls_outbound', 'contact_center_daily.line'], fact: 'fe',
    compute: (c) => fe(c, 'callsOffered') + fe(c, 'callsOutbound') + fe(c, 'cboCallsOffered'),
  },
  {
    id: 'call_abandon_rate_all', code: 'PA-30', name: 'Call abandonment rate (all lines)', short: 'Call abandonment (all lines)', area: 'Patient Access', unit: 'pct', direction: 'down', type: 'flow', page: 'access',
    definition: 'Share of inbound calls on all in-scope lines (front end and back end) that end before an answer.',
    calculation: 'SUM(calls_abandoned) / SUM(calls_offered), all lines, by date',
    formula: 'Calls abandoned / inbound calls offered (all lines)',
    sourceFields: ['contact_center_daily.calls_abandoned', 'contact_center_daily.calls_offered', 'contact_center_daily.line'], fact: 'fe',
    compute: (c) => div(fe(c, 'callsAbandoned') + fe(c, 'cboCallsAbandoned'), fe(c, 'callsOffered') + fe(c, 'cboCallsOffered')),
  },
  feMetric('cbo_call_abandon_rate', 'Call abandonment rate (business office line)', 'Abandonment (CBO)', 'pct', 'down', 'Share of calls to the business office customer service line (back end) that end before an answer.', 'cboCallsAbandoned', 'cboCallsOffered', { code: 'PA-31', formula: 'Calls abandoned / calls offered (business office line)' }),
  feMetric('call_abandon_rate', 'Call abandonment rate', 'Call abandonment', 'pct', 'down', 'Share of calls to the patient access line that end before an answer.', 'callsAbandoned', 'callsOffered', { code: 'PA-32', formula: 'Calls abandoned / calls offered (patient access line)' }),
  {
    id: 'asa', code: 'PA-33', name: 'Average speed to answer', short: 'Speed to answer', area: 'Patient Access', unit: 'sec', direction: 'down', type: 'flow', page: 'access',
    definition: 'Average wait in seconds before an agent answers.',
    calculation: 'SUM(answer_wait_seconds) / COUNT(calls answered)',
    formula: 'Total seconds waited before answer / calls answered',
    sourceFields: ['contact_center_daily.answer_wait_seconds', 'contact_center_daily.calls_answered'], fact: 'fe',
    compute: (c) => feRatio(c, 'answerWaitSecs', 'callsAnswered'),
  },
  { ...feCountMetric('medicaid_in_scope', 'Uninsured accounts in scope (Medicaid E&E)', 'Self-pay (uninsured) accounts in scope for Medicaid eligibility screening.', 'selfPayAccounts', { code: 'PA-34', formula: 'Count of self-pay (uninsured) accounts in scope' }), short: 'Uninsured in scope' },
  {
    id: 'medicaid_screening_rate', code: 'PA-35', name: 'Medicaid screening rate', short: 'Medicaid screening', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Share of in-scope uninsured accounts screened for Medicaid eligibility, excluding accounts where all contact efforts are exhausted.',
    calculation: 'SUM(screened) / (SUM(self_pay_accounts) − SUM(efforts_exhausted)), by date',
    formula: 'Accounts screened / (in-scope accounts − accounts with all efforts exhausted)',
    sourceFields: ['eligibility_screening.screened', 'eligibility_screening.self_pay_accounts', 'eligibility_screening.efforts_exhausted'], fact: 'fe',
    compute: (c) => div(fe(c, 'screened'), fe(c, 'selfPayAccounts') - fe(c, 'effortsExhausted')),
  },
  feMetric('medicaid_eligible_completion', 'Medicaid eligible completion rate', 'Medicaid eligible completion', 'pct', 'up', 'Share of patients likely eligible for Medicaid whose application was completed.', 'applicationsCompleted', 'medicaidEligible', { code: 'PA-36', formula: 'Applications completed / patients likely eligible' }),
  feMetric('coverage_found_rate', 'Coverage discovery rate', 'Coverage found', 'pct', 'none', 'Share of screened self-pay accounts where insurance or program coverage was found.', 'coverageFound', 'screened', { code: 'PA-37', formula: 'Accounts with coverage found / accounts screened' }),
];

function recoverableDollars(c: Ctx) {
  // Denied gross on recoverable root causes = SUM(denAmt * recov). Uses the recoverable root causes as a filter.
  const rcs = c.e.ds.dims.rootCauses.filter((r) => r.recoverable).map((r) => r.key);
  const cur = c.sel.rootCause;
  const use = cur?.length ? rcs.filter((k) => cur.includes(k)) : rcs;
  if (!use.length) return 0;
  return c.e.sum('acc', 'denAmt', 'denD', c.r.startDay, c.r.endDay, { ...c.sel, rootCause: use }, { detail: 'denial' });
}

type CodeAndFormula = Pick<MetricDef, 'code' | 'formula'>;

function feMetric(id: string, name: string, short: string, unit: Unit, direction: Direction, definition: string, num: string, den: string, cf: CodeAndFormula): MetricDef {
  return {
    ...cf, id, name, short, area: 'Patient Access', unit, direction, type: 'flow', page: 'access', definition,
    calculation: `SUM(${snake(num)}) / SUM(${snake(den)}), by service date`,
    sourceFields: [`access_daily.${snake(num)}`, `access_daily.${snake(den)}`], fact: 'fe',
    compute: (c) => feRatio(c, num, den),
  };
}

function feCountMetric(id: string, name: string, definition: string, col: string, cf: CodeAndFormula): MetricDef {
  return {
    ...cf, id, name, area: 'Patient Access', unit: 'count', direction: 'none', type: 'flow', page: 'access', definition,
    calculation: `SUM(${snake(col)}) WHERE date IN period`, sourceFields: [`access_daily.${snake(col)}`], fact: 'fe',
    compute: (c) => feCount(c, col),
  };
}

function snake(s: string) {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export function metric(id: string): MetricDef {
  const m = METRIC_BY_ID[id];
  if (!m) throw new Error(`Unknown metric ${id}`);
  return m;
}

export interface MetricResult {
  value: number | null;
  target: number | null;
  watch: number | null;
  /** Reason when value is null. */
  noData?: string;
}

export const GRAIN_LABEL: Record<'day' | 'week' | 'month', string> = { day: 'Day', week: 'Week', month: 'Month' };

/** True when the metric is calculated for periods of this length. */
export function validFor(m: MetricDef, grain: SubMonthGrain): boolean {
  return !m.finest || (m.finest === 'week' && grain === 'week');
}

const FINEST_REASON: Record<'week' | 'month', string> = {
  week: 'Calculated by week or longer (weekly DNFB snapshots). Select a week or a longer period.',
  month: 'Calculated by month or longer. Select a month or a longer period.',
};

/** Evaluate a metric, with a plain reason when the filter context gives no data. */
export function evaluate(m: MetricDef, e: Engine, r: Range, sel: Selections): MetricResult {
  const missing = missingFields(m.fact, sel);
  const staticT = staticTarget(m.id);
  if (missing.length) {
    const names = missing.map((f) => FIELD_LABEL[f].toLowerCase()).join(' or ');
    return { value: null, target: staticT, watch: watchFor(m.id, staticT), noData: `Not available by ${names}. Clear the ${names} filter to see this measure.` };
  }
  if (r.startDay > e.lastDay) return { value: null, target: staticT, watch: watchFor(m.id, staticT), noData: 'No data has been loaded for this period yet.' };
  if (r.grain && !validFor(m, r.grain)) return { value: null, target: staticT, watch: watchFor(m.id, staticT), noData: FINEST_REASON[m.finest!] };
  const ctx = { e, r, sel };
  const v = m.compute(ctx);
  const t = m.target ? m.target(ctx) : staticT;
  const res: MetricResult = { value: v !== null && Number.isFinite(v) ? v : null, target: t, watch: watchFor(m.id, t) };
  if (res.value === null) res.noData = 'No data for the current filters.';
  return res;
}
