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
import { shiftMonths } from './periods';
import { CONFIG, staticTarget, watchFor } from './status';

export type Unit = 'pct' | 'days' | 'usd' | 'count' | 'sec' | 'ratio';
export type Direction = 'up' | 'down' | 'none';
/** Revenue cycle area, in lifecycle order (plus enterprise financials). */
export type RcmArea =
  | 'Patient Access' | 'Charge Capture' | 'Coding' | 'Clinical Documentation'
  | 'Billing' | 'A/R' | 'Denials' | 'Cash' | 'Financial';

export const RCM_AREAS: RcmArea[] = [
  'Patient Access', 'Charge Capture', 'Coding', 'Clinical Documentation', 'Billing', 'A/R', 'Denials', 'Cash', 'Financial',
];

/** A range of days. Periods and weeks both fit this shape. */
export interface Range {
  startDay: number;
  endDay: number;
  startMi: number;
  endMi: number;
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
  definition: string;
  calculation: string;
  sourceFields: string[];
  multiDef?: boolean;
  fact: FactName;
  page: AnalysisPage;
  /** Digits for display (default by unit). */
  digits?: number;
  /** Code in the client's ELT metric framework (e.g. P1), when the metric is part of it. */
  code?: string;
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
const creditAt = (c: Ctx, day: number) => {
  const a = c.e.ds.acc;
  return c.e.accountTotal(`credit|${day}`, c.sel, 'none', (i) => {
    if (a.fc[i] === 6 || a.payD[i] === -1) return 0;
    const id = a.id[i];
    if (hash01(id, 21) >= 0.05) return 0;
    const start = a.payD[i] + 3;
    const lag = 15 + Math.floor(hash01(id, 22) * 150);
    return start <= day && day < start + lag ? a.net[i] * (0.1 + 0.4 * hash01(id, 23)) : 0;
  });
};
/** Illustrative allowance rates for open self-pay balances by days from discharge (configuration). */
const RESERVE_RATE = (age: number) => (age <= 90 ? 0.15 : age <= 180 ? 0.45 : 0.8);
/** Allowance for uncollectible self-pay balances open on a day (unrealized bad debt). */
const reserveAt = (c: Ctx, day: number) => {
  const a = c.e.ds.acc;
  return c.e.accountTotal(`reserve|${day}`, c.sel, 'none', (i) => {
    if (a.fc[i] !== 6 || a.dd[i] > day || (a.closeD[i] !== -1 && a.closeD[i] <= day)) return 0;
    const paid = a.pos[i] + (a.payD[i] !== -1 && a.payD[i] <= day ? a.payAmt[i] : 0);
    return Math.max(0, a.net[i] - paid) * RESERVE_RATE(day - a.dd[i]);
  });
};
/** Expected net on open, unresolved denials more than 90 days past the denial date (unrealized write-offs). */
const staleDenialsAt = (c: Ctx, day: number) => {
  const a = c.e.ds.acc;
  return c.e.accountTotal(`stale-den|${day}`, c.sel, 'denial', (i) =>
    (a.denD[i] !== -1 && a.denD[i] <= day - 90 && (a.payD[i] === -1 || a.payD[i] > day) && (a.woD[i] === -1 || a.woD[i] > day) ? a.denNet[i] : 0));
};
const avoidableWo = (c: Ctx) => s(c, 'woAmt', 'woD', { detail: 'denial' });

export const METRICS: MetricDef[] = [
  // ================= Financial =================
  {
    id: 'npsr', name: 'Net patient service revenue', short: 'NPSR', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'executive',
    definition: 'Expected net revenue (gross charges less expected contractual allowances) for accounts discharged in the period.',
    calculation: 'SUM(account.expected_net) WHERE discharge_date IN period',
    sourceFields: ['account.expected_net', 'account.discharge_date'], multiDef: true, fact: 'acc',
    compute: (c) => net(c),
  },
  {
    id: 'gross_charges', name: 'Gross charges', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'executive',
    definition: 'Gross charges for accounts discharged in the period.',
    calculation: 'SUM(account.gross_charges) WHERE discharge_date IN period',
    sourceFields: ['account.gross_charges', 'account.discharge_date'], fact: 'acc',
    compute: (c) => gross(c),
  },
  {
    id: 'contractual_adj_pct', name: 'Contractual adjustment rate', short: 'Contractual adj. %', area: 'Financial', unit: 'pct', direction: 'none', type: 'flow', page: 'payers',
    definition: 'Expected contractual allowance as a share of gross charges.',
    calculation: '1 − SUM(expected_net) / SUM(gross_charges), by discharge date',
    sourceFields: ['account.gross_charges', 'account.expected_net'], fact: 'acc',
    compute: (c) => { const g = gross(c); return g > 0 ? 1 - net(c) / g : null; },
  },
  {
    id: 'bad_debt', name: 'Bad debt write-offs', area: 'Financial', unit: 'usd', direction: 'down', type: 'flow', page: 'executive',
    definition: 'Patient balances transferred to bad debt in the period.',
    calculation: 'SUM(transaction.amount) WHERE type = BAD_DEBT AND post_date IN period',
    sourceFields: ['transaction.amount', 'transaction.type', 'transaction.post_date'], fact: 'acc',
    compute: (c) => s(c, 'bdAmt', 'bdD'),
  },
  {
    id: 'bad_debt_pct', name: 'Bad debt % of NPSR', short: 'Bad debt % NPSR', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'executive', digits: 2,
    definition: 'Bad debt write-offs as a share of net patient service revenue in the same period.',
    calculation: 'Bad debt write-offs (post date) / NPSR (discharge date)',
    sourceFields: ['transaction.amount', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'bdAmt', 'bdD'), net(c)),
  },
  {
    id: 'charity', name: 'Charity care', area: 'Financial', unit: 'usd', direction: 'none', type: 'flow', page: 'executive',
    definition: 'Patient balances adjusted under the financial assistance policy in the period.',
    calculation: 'SUM(transaction.amount) WHERE type = CHARITY AND post_date IN period',
    sourceFields: ['transaction.amount', 'transaction.type'], fact: 'acc',
    compute: (c) => s(c, 'chAmt', 'chD'),
  },
  {
    id: 'charity_pct', name: 'Charity care % of NPSR', short: 'Charity % NPSR', area: 'Financial', unit: 'pct', direction: 'none', type: 'flow', page: 'executive', digits: 2,
    definition: 'Charity care adjustments as a share of NPSR. No target: the level follows community need and policy.',
    calculation: 'Charity adjustments (post date) / NPSR (discharge date)',
    sourceFields: ['transaction.amount', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(s(c, 'chAmt', 'chD'), net(c)),
  },
  {
    id: 'cost_to_collect', name: 'Cost to collect', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'executive', digits: 2,
    definition: 'Revenue cycle operating cost as a share of cash collected.',
    calculation: 'SUM(gl.rcm_operating_cost) / Cash collections, same period',
    sourceFields: ['gl.rcm_operating_cost', 'transaction.amount'], multiDef: true, fact: 'ops',
    compute: (c) => (missingFields('acc', c.sel).length ? null : div(c.e.sum('ops', 'rcmCost', 'day', c.r.startDay, c.r.endDay, c.sel), cash(c))),
  },
  // ================= ELT metric framework additions =================
  {
    id: 'net_to_gross', code: 'P2', name: 'Net to gross ratio', short: 'Net to gross', area: 'Financial', unit: 'pct', direction: 'up', type: 'flow', page: 'payers',
    definition: 'Net patient service revenue as a share of gross charges for accounts discharged in the period (reimbursement yield). Some organizations use net A/R / gross A/R instead.',
    calculation: 'SUM(account.expected_net) / SUM(account.gross_charges), by discharge date',
    sourceFields: ['account.expected_net', 'account.gross_charges'], multiDef: true, fact: 'acc',
    compute: (c) => div(net(c), gross(c)),
  },
  {
    id: 'credit_balance_days', code: 'P6', name: 'Credit balance days', short: 'Credit balance days', area: 'A/R', unit: 'days', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Open credit balances (overpayments awaiting refund) at period end divided by average daily net revenue over the last 90 days. Prototype: credit balances are modeled, because the synthetic data has no overpayments.',
    calculation: 'SUM(open credit balance, period end) / (SUM(expected_net, last 90 days) / 90)',
    sourceFields: ['account.credit_balance', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => { const d = endOf(c); return div(creditAt(c, d), adnr(c, d)); },
  },
  {
    id: 'pos_pct_net', code: 'P7', name: 'POS collections % of net revenue', short: 'POS % net rev', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access', digits: 2,
    definition: 'Point-of-service patient cash as a share of net patient service revenue, by service date.',
    calculation: 'SUM(POS cash) / NPSR, by discharge date',
    sourceFields: ['transaction.amount', 'transaction.pos_flag', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(s(c, 'pos', 'dd'), net(c)),
  },
  {
    id: 'bad_debt_pct_gross', code: 'P9', name: 'Bad debt % of gross revenue', short: 'Bad debt % gross', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'cash', digits: 2,
    definition: 'Bad debt write-offs posted in the period as a share of gross charges in the period.',
    calculation: 'Bad debt write-offs (post date) / gross charges (discharge date)',
    sourceFields: ['transaction.amount', 'transaction.type', 'account.gross_charges'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'bdAmt', 'bdD'), gross(c)),
  },
  {
    id: 'bad_debt_unrealized_pct', code: 'P11', name: 'Bad debt incl. unrealized, % of gross revenue', short: 'Bad debt incl. unrealized', area: 'Financial', unit: 'pct', direction: 'down', type: 'flow', page: 'cash', digits: 2,
    definition: 'Bad debt write-offs plus the change in the allowance for uncollectible open self-pay balances (unrealized bad debt), as a share of gross charges. Allowance rates by age are illustrative configuration (15% to 90 days, 45% to 180 days, 80% after).',
    calculation: '(Bad debt write-offs + allowance(period end) − allowance(prior period end)) / gross charges',
    sourceFields: ['transaction.amount', 'ar_snapshot.self_pay_balance', 'config.allowance_rates', 'account.gross_charges'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'bdAmt', 'bdD') + reserveAt(c, endOf(c)) - reserveAt(c, c.r.startDay - 1), gross(c)),
  },
  {
    id: 'avoidable_wo_pct_net', code: 'P12', name: 'Avoidable write-offs % of net revenue', short: 'Avoidable W/O % net', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials', digits: 2,
    definition: 'Administrative write-offs after a final denial (eligibility, authorization, timely filing, coding, documentation and similar), as a share of NPSR. Excludes contractual allowances, charity care and bad debt.',
    calculation: 'SUM(denial write-offs, post date) / NPSR (discharge date)',
    sourceFields: ['transaction.amount', 'transaction.type', 'denial.root_cause', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(avoidableWo(c), net(c)),
  },
  {
    id: 'avoidable_wo_unrealized_pct', code: 'P13', name: 'Avoidable write-offs incl. unrealized, % of net revenue', short: 'Avoidable W/O incl. unrealized', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials', digits: 2,
    definition: 'Avoidable write-offs plus the change in expected net on open denials more than 90 days old and not yet resolved (unrealized write-offs), as a share of NPSR.',
    calculation: '(Denial write-offs + stale open denials(period end) − stale open denials(prior period end)) / NPSR',
    sourceFields: ['transaction.amount', 'denial.denial_date', 'denial.status', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(avoidableWo(c) + staleDenialsAt(c, endOf(c)) - staleDenialsAt(c, c.r.startDay - 1), net(c)),
  },
  // ================= Cash =================
  {
    id: 'cash', name: 'Cash collections', short: 'Cash collected', area: 'Cash', unit: 'usd', direction: 'up', type: 'flow', page: 'cash',
    definition: 'Payer and patient payments posted in the period, including point-of-service cash. Target = cash goal (goal % × lagged NPSR).',
    calculation: 'SUM(transaction.amount) WHERE type = PAYMENT AND post_date IN period',
    sourceFields: ['transaction.amount', 'transaction.type', 'transaction.post_date'], fact: 'acc',
    compute: (c) => cash(c),
    target: (c) => cashGoal(c),
  },
  {
    id: 'cash_goal', name: 'Cash goal', area: 'Cash', unit: 'usd', direction: 'none', type: 'flow', page: 'cash',
    definition: 'Expected cash for the period: the cash-to-NPSR goal × lagged average daily NPSR (period shifted back 1, 2 and 3 months) × days in the period.',
    calculation: 'cash_goal_pct × lagged average daily NPSR × days in period',
    sourceFields: ['config.cash_goal_pct', 'account.expected_net'], fact: 'acc',
    compute: (c) => cashGoal(c),
  },
  {
    id: 'cash_pct_npsr', code: 'P8', name: 'Cash as % of NPSR', short: 'Cash % NPSR', area: 'Cash', unit: 'pct', direction: 'up', type: 'flow', page: 'cash',
    definition: 'Average daily cash collected in the period as a share of lagged average daily NPSR (the same-length period shifted back 1, 2 and 3 months).',
    calculation: '(Cash collections / days in period) / (SUM(NPSR over the 3 lagged windows) / days in those windows)',
    sourceFields: ['transaction.amount', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(cash(c), lagNet(c)),
  },
  {
    id: 'net_collection_rate', name: 'Net collection rate', short: 'Net collection rate', area: 'Cash', unit: 'pct', direction: 'up', type: 'flow', page: 'cash',
    definition: 'Payments received to date on accounts discharged 7–9 months before period end, as a share of their expected net revenue (mature cohort).',
    calculation: 'SUM(payments to date) / SUM(expected_net) WHERE discharge_date IN (period end −9 to −7 months)',
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
    id: 'payment_variance', name: 'Payment variance', area: 'Cash', unit: 'usd', direction: 'up', type: 'flow', page: 'payers',
    definition: 'Insurance payments posted minus expected reimbursement on the same accounts. Negative = underpaid.',
    calculation: 'SUM(payment.amount − account.expected_net) WHERE payer_type = INSURANCE AND post_date IN period',
    sourceFields: ['transaction.amount', 'account.expected_net', 'contract.expected_reimbursement'], fact: 'acc',
    compute: (c) => s(c, 'payAmt', 'payD', { pred: 'insured' }) - s(c, 'payExp', 'payD'),
  },
  {
    id: 'payment_variance_pct', name: 'Payment variance %', short: 'Pmt variance %', area: 'Cash', unit: 'pct', direction: 'up', type: 'flow', page: 'payers',
    definition: 'Payment variance as a share of expected reimbursement on paid insurance accounts. Below −2% signals underpayment.',
    calculation: '(SUM(payment) − SUM(expected)) / SUM(expected), insurance payments in period',
    sourceFields: ['transaction.amount', 'account.expected_net'], fact: 'acc',
    compute: (c) => { const e = s(c, 'payExp', 'payD'); return e > 0 ? (s(c, 'payAmt', 'payD', { pred: 'insured' }) - e) / e : null; },
  },
  // ================= A/R =================
  {
    id: 'gross_ar', name: 'Gross A/R', area: 'A/R', unit: 'usd', direction: 'none', type: 'balance', page: 'ar',
    definition: 'Open debit balances (gross charges less payments) at the period-end snapshot.',
    calculation: 'SUM(ar_snapshot.gross_balance) WHERE snapshot_date = period end',
    sourceFields: ['ar_snapshot.gross_balance', 'ar_snapshot.snapshot_date'], fact: 'ar',
    compute: (c) => ar(c, 'gross'),
  },
  {
    id: 'net_ar', name: 'Net A/R', area: 'A/R', unit: 'usd', direction: 'none', type: 'balance', page: 'ar',
    definition: 'Open debit balances net of expected contractual allowances at the period-end snapshot.',
    calculation: 'SUM(ar_snapshot.net_balance) WHERE snapshot_date = period end',
    sourceFields: ['ar_snapshot.net_balance'], fact: 'ar',
    compute: (c) => ar(c, 'net'),
  },
  {
    id: 'net_ar_days', name: 'Net A/R days', short: 'Net A/R days', area: 'A/R', unit: 'days', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Net A/R at period end divided by average daily net revenue over the last 90 days. Ignores aging-bucket and account-status filters.',
    calculation: 'Net A/R (period end) / (SUM(expected_net, last 90 days) / 90)',
    sourceFields: ['ar_snapshot.net_balance', 'account.expected_net'], multiDef: true, fact: 'ar',
    compute: (c0) => { const c = whole(c0); const v = ar(c, 'net'); return v === null ? null : div(v, adnr(c, arDay(c)!)); },
  },
  {
    id: 'gross_ar_days', code: 'P1', name: 'Gross A/R days', area: 'A/R', unit: 'days', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Gross A/R at period end divided by average daily gross charges over the last 90 days.',
    calculation: 'Gross A/R (period end) / (SUM(gross_charges, last 90 days) / 90)',
    sourceFields: ['ar_snapshot.gross_balance', 'account.gross_charges'], multiDef: true, fact: 'ar',
    compute: (c0) => { const c = whole(c0); const v = ar(c, 'gross'); return v === null ? null : div(v, adgr(c, arDay(c)!)); },
  },
  {
    id: 'ar_gt90_pct', code: 'P4', name: 'A/R > 90 days', short: 'A/R > 90 days', area: 'A/R', unit: 'pct', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Share of gross A/R more than 90 days from discharge.',
    calculation: 'Gross A/R aged 91+ days / gross A/R, period-end snapshot',
    sourceFields: ['ar_snapshot.gross_balance', 'ar_snapshot.aging_bucket'], multiDef: true, fact: 'ar',
    compute: (c0) => { const c = whole(c0); const a = ar(c, 'gross', { ageMin: 3 }); const b = ar(c, 'gross'); return a === null || b === null ? null : div(a, b); },
  },
  {
    id: 'ar_gt180_pct', name: 'A/R > 180 days', short: 'A/R > 180 days', area: 'A/R', unit: 'pct', direction: 'down', type: 'balance', page: 'ar',
    definition: 'Share of gross A/R more than 180 days from discharge.',
    calculation: 'Gross A/R aged 181+ days / gross A/R, period-end snapshot',
    sourceFields: ['ar_snapshot.gross_balance', 'ar_snapshot.aging_bucket'], fact: 'ar',
    compute: (c0) => { const c = whole(c0); const a = ar(c, 'gross', { ageMin: 5 }); const b = ar(c, 'gross'); return a === null || b === null ? null : div(a, b); },
  },
  // ================= Denials =================
  {
    id: 'denial_rate', code: 'P10', name: 'Initial denial rate', short: 'Denial rate', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Claims with an initial denial (by denial date) as a share of claims submitted (by submit date) in the period.',
    calculation: 'COUNT(denial.claim_id, denial date) / COUNT(claim.claim_id, submit date)',
    sourceFields: ['denial.claim_id', 'denial.denial_date', 'claim.claim_id', 'claim.submit_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(c.e.sum('acc', '__one', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' }), s(c, '__one', 'sbd')),
  },
  {
    id: 'denial_dollar_rate', name: 'Initial denial rate ($)', short: 'Denial rate ($)', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Gross charges on initially denied claims as a share of gross charges submitted in the period.',
    calculation: 'SUM(denial.gross_amount, denial date) / SUM(claim.gross_charges, submit date)',
    sourceFields: ['denial.gross_amount', 'denial.denial_date', 'claim.gross_charges', 'claim.submit_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(denied(c), submittedGross(c)),
  },
  {
    id: 'denial_dollars', name: 'Initial denials ($)', short: 'Denied $', area: 'Denials', unit: 'usd', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Gross charges on claims with an initial denial, by denial date.',
    calculation: 'SUM(denial.gross_amount) WHERE denial_date IN period',
    sourceFields: ['denial.gross_amount', 'denial.denial_date', 'denial.root_cause'], fact: 'acc',
    compute: (c) => denied(c),
  },
  {
    id: 'denied_claims', name: 'Denied claims', area: 'Denials', unit: 'count', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Number of claims with an initial denial, by denial date.',
    calculation: 'COUNT(denial.claim_id) WHERE denial_date IN period',
    sourceFields: ['denial.claim_id', 'denial.denial_date'], fact: 'acc',
    compute: (c) => c.e.sum('acc', '__one', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' }),
  },
  {
    id: 'denial_pct_npsr', name: 'Denials as % of NPSR', short: 'Denials % NPSR', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Expected net revenue on initially denied claims as a share of NPSR in the period.',
    calculation: 'SUM(denied account expected_net, denial date) / NPSR (discharge date)',
    sourceFields: ['denial.claim_id', 'account.expected_net'], fact: 'acc',
    compute: (c) => div(denied(c, 'denNet'), net(c)),
  },
  {
    id: 'recoverable_pct', name: 'Recoverable denials', short: 'Recoverable %', area: 'Denials', unit: 'pct', direction: 'none', type: 'flow', page: 'denials',
    definition: 'Share of denied dollars whose root cause is usually correctable or appealable.',
    calculation: 'SUM(denial.gross_amount WHERE root_cause.recoverable) / SUM(denial.gross_amount)',
    sourceFields: ['denial.gross_amount', 'root_cause.recoverable'], fact: 'acc',
    compute: (c) => div(recoverableDollars(c), denied(c)),
  },
  {
    id: 'appeal_rate', name: 'Appeal rate', area: 'Denials', unit: 'pct', direction: 'none', type: 'flow', page: 'denials',
    definition: 'Share of denied claims (by denial date) that were formally appealed. Corrected-and-rebilled claims are not appeals.',
    calculation: 'COUNT(denial WHERE appealed) / COUNT(denial), by denial date',
    sourceFields: ['denial.appeal_flag', 'denial.denial_date'], fact: 'acc',
    compute: (c) => div(s(c, 'apl', 'denD', { detail: 'denial' }), c.e.sum('acc', '__one', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' })),
  },
  {
    id: 'appeal_success', name: 'Appeal success rate', short: 'Appeal success', area: 'Denials', unit: 'pct', direction: 'up', type: 'flow', page: 'denials',
    definition: 'Share of appeals resolved in the period that were overturned (paid).',
    calculation: 'COUNT(appeal WHERE resolved AND overturned) / COUNT(appeal WHERE resolved), by resolution date',
    sourceFields: ['appeal.outcome', 'appeal.resolution_date'], fact: 'acc',
    compute: (c) => div(s(c, 'aplOvt', 'closeD', { detail: 'denial' }), c.e.sum('acc', 'apl', 'closeD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' })),
  },
  {
    id: 'denial_writeoffs', name: 'Denial write-offs', area: 'Denials', unit: 'usd', direction: 'down', type: 'flow', page: 'denials',
    definition: 'Expected net revenue written off after a final denial, by write-off date.',
    calculation: 'SUM(transaction.amount) WHERE type = DENIAL_WRITE_OFF AND post_date IN period',
    sourceFields: ['transaction.amount', 'transaction.type', 'denial.root_cause'], fact: 'acc',
    compute: (c) => s(c, 'woAmt', 'woD', { detail: 'denial' }),
  },
  {
    id: 'denial_wo_pct_npsr', name: 'Denial write-offs % of NPSR', short: 'Denial W/O % NPSR', area: 'Denials', unit: 'pct', direction: 'down', type: 'flow', page: 'denials', digits: 2,
    definition: 'Denial write-offs as a share of NPSR in the same period.',
    calculation: 'Denial write-offs (post date) / NPSR (discharge date)',
    sourceFields: ['transaction.amount', 'account.expected_net'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'woAmt', 'woD', { detail: 'denial' }), net(c)),
  },
  {
    id: 'front_end_denial_rate', name: 'Front-end denial rate', area: 'Patient Access', unit: 'pct', direction: 'down', type: 'flow', page: 'access', digits: 2,
    definition: 'Denied dollars in eligibility, authorization and coordination-of-benefits categories as a share of gross charges submitted.',
    calculation: 'SUM(denial.gross_amount WHERE category IN (Eligibility, Authorization, COB)) / SUM(claim.gross_charges, submit date)',
    sourceFields: ['denial.gross_amount', 'denial.category', 'claim.gross_charges'], fact: 'acc',
    compute: (c) => div(deniedIn(c, [0, 1, 5]), submittedGross(c)),
  },
  // ================= Billing =================
  {
    id: 'clean_claim_rate', name: 'Clean claim rate', area: 'Billing', unit: 'pct', direction: 'up', type: 'flow', page: 'billing',
    definition: 'Share of claims that pass all edits on first submission with no manual touch.',
    calculation: 'COUNT(claim WHERE first_pass_clean) / COUNT(claim), by submit date',
    sourceFields: ['claim.first_pass_clean', 'claim.submit_date'], multiDef: true, fact: 'acc',
    compute: (c) => div(s(c, 'clean', 'sbd'), s(c, '__one', 'sbd')),
  },
  {
    id: 'rework_claims', name: 'Claims failing edits', short: 'Edit failures', area: 'Billing', unit: 'count', direction: 'down', type: 'flow', page: 'billing',
    definition: 'Claims that failed at least one claim edit on first submission and needed manual rework.',
    calculation: 'COUNT(claim WHERE NOT first_pass_clean), by submit date (split by edit category)',
    sourceFields: ['claim_edit.category', 'claim.submit_date'], fact: 'acc',
    compute: (c) => s(c, '__one', 'sbd', { detail: 'edit' }) - s(c, 'clean', 'sbd', { detail: 'edit' }),
  },
  {
    id: 'claims_submitted', name: 'Claims submitted', area: 'Billing', unit: 'count', direction: 'none', type: 'flow', page: 'billing',
    definition: 'Claims sent to payers in the period.',
    calculation: 'COUNT(claim) WHERE submit_date IN period',
    sourceFields: ['claim.claim_id', 'claim.submit_date'], fact: 'acc',
    compute: (c) => s(c, '__one', 'sbd'),
  },
  {
    id: 'billing_lag', name: 'Billing lag (final bill to submit)', short: 'Billing lag', area: 'Billing', unit: 'days', direction: 'down', type: 'flow', page: 'billing',
    definition: 'Average days from final bill to claim submission, for claims submitted in the period.',
    calculation: 'AVG(submit_date − final_bill_date) WHERE submit_date IN period',
    sourceFields: ['claim.submit_date', 'account.final_bill_date'], fact: 'acc',
    compute: (c) => div(s(c, 'sbL', 'sbd'), s(c, '__one', 'sbd')),
  },
  {
    id: 'dnfb_dollars', name: 'DNFB', short: 'DNFB $', area: 'Billing', unit: 'usd', direction: 'down', type: 'balance', page: 'billing',
    definition: 'Gross charges of discharged accounts not yet final billed, at the period-end snapshot.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE stage = DNFB AND snapshot_date = period end',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.stage'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0),
  },
  {
    id: 'dnfb_days', code: 'P5', name: 'Days in DNFB', short: 'DNFB days', area: 'Billing', unit: 'days', direction: 'down', type: 'balance', page: 'billing',
    definition: 'DNFB dollars at period end divided by average daily gross charges over the last 90 days.',
    calculation: 'DNFB $ (period end) / (SUM(gross_charges, last 90 days) / 90)',
    sourceFields: ['dnfb_snapshot.gross_amount', 'account.gross_charges'], multiDef: true, fact: 'dnfb',
    compute: (c) => { const v = dnfb(c, 0); return v === null ? null : div(v, adgr(c, dnfbDay(c)!)); },
  },
  {
    id: 'dnsp_days', name: 'Billed not submitted days', short: 'DNSP days', area: 'Billing', unit: 'days', direction: 'down', type: 'balance', page: 'billing',
    definition: 'Final-billed charges held by claim edits (not yet sent to the payer) at period end, as days of average daily gross charges.',
    calculation: 'DNSP $ (period end) / (SUM(gross_charges, last 90 days) / 90)',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.stage'], fact: 'dnfb',
    compute: (c) => { const v = dnfb(c, 1); return v === null ? null : div(v, adgr(c, dnfbDay(c)!)); },
  },
  {
    id: 'unbilled_accounts', name: 'Unbilled accounts (DNFB)', short: 'Unbilled accounts', area: 'Billing', unit: 'count', direction: 'down', type: 'balance', page: 'billing',
    definition: 'Number of discharged accounts not final billed at the period-end snapshot.',
    calculation: 'COUNT(dnfb_snapshot.account) WHERE stage = DNFB AND snapshot_date = period end',
    sourceFields: ['dnfb_snapshot.account_count'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0, { col: 'count' }),
  },
  {
    id: 'dnfb_15plus_pct', name: 'DNFB aged 15+ days', short: 'DNFB 15+ days %', area: 'Billing', unit: 'pct', direction: 'down', type: 'balance', page: 'billing',
    definition: 'Share of DNFB dollars 15 or more days past discharge.',
    calculation: 'DNFB $ aged 15+ days / DNFB $, period-end snapshot',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.age_bucket'], fact: 'dnfb',
    compute: (c) => { const a = dnfb(c, 0, { ageMin: 3 }); const b = dnfb(c, 0); return a === null || b === null ? null : div(a, b); },
  },
  // ================= Charge capture =================
  {
    id: 'charge_lag', name: 'Charge lag', area: 'Charge Capture', unit: 'days', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Average days from date of service to charge posting, for accounts discharged in the period.',
    calculation: 'AVG(charge_post_date − service_date) WHERE discharge_date IN period',
    sourceFields: ['charge.post_date', 'charge.service_date'], fact: 'acc',
    compute: (c) => div(s(c, 'chgLag', 'dd'), s(c, '__one', 'dd')),
  },
  {
    id: 'late_charge_pct', name: 'Late charges', short: 'Late charge %', area: 'Charge Capture', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Charges posted after the final bill (requiring a late charge or corrected claim), as a share of gross charges.',
    calculation: 'SUM(charge.amount WHERE post_date > final_bill_date) / SUM(gross_charges), by discharge date',
    sourceFields: ['charge.amount', 'charge.post_date', 'account.final_bill_date'], fact: 'acc',
    compute: (c) => div(s(c, 'lateAmt', 'dd'), gross(c)),
  },
  {
    id: 'missing_charges', name: 'Missing charges recovered', area: 'Charge Capture', unit: 'usd', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Charges found by charge reconciliation and added before billing, for accounts discharged in the period.',
    calculation: 'SUM(charge.amount WHERE source = RECONCILIATION) WHERE discharge_date IN period',
    sourceFields: ['charge.amount', 'charge.source'], fact: 'acc',
    compute: (c) => s(c, 'missAmt', 'dd'),
  },
  {
    id: 'charges_posted', name: 'Charges posted', area: 'Charge Capture', unit: 'usd', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Gross charges captured for accounts discharged in the period.',
    calculation: 'SUM(charge.amount) WHERE discharge_date IN period',
    sourceFields: ['charge.amount'], fact: 'acc',
    compute: (c) => gross(c),
  },
  // ================= Coding =================
  {
    id: 'coding_tat', name: 'Coding turnaround', short: 'Coding TAT', area: 'Coding', unit: 'days', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Average days from discharge to coding complete, for accounts coded in the period.',
    calculation: 'AVG(coded_date − discharge_date) WHERE coded_date IN period',
    sourceFields: ['account.coded_date', 'account.discharge_date'], fact: 'acc',
    compute: (c) => div(s(c, 'codeL', 'codeD'), s(c, '__one', 'codeD')),
  },
  {
    id: 'coding_tat_ip', name: 'Coding turnaround, inpatient', short: 'IP coding TAT', area: 'Coding', unit: 'days', direction: 'down', type: 'flow', page: 'midcycle',
    definition: 'Average days from discharge to coding complete for inpatient accounts coded in the period.',
    calculation: 'AVG(coded_date − discharge_date) WHERE patient_type = Inpatient AND coded_date IN period',
    sourceFields: ['account.coded_date', 'account.patient_type'], fact: 'acc',
    compute: (c) => div(s(c, 'codeL', 'codeD', { pred: 'inpatient' }), s(c, '__one', 'codeD', { pred: 'inpatient' })),
  },
  {
    id: 'coding_denial_rate', name: 'Coding denial rate', area: 'Coding', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Denied dollars in the Coding category as a share of gross charges submitted.',
    calculation: 'SUM(denial.gross_amount WHERE category = Coding) / SUM(claim.gross_charges, submit date)',
    sourceFields: ['denial.gross_amount', 'denial.category'], fact: 'acc',
    compute: (c) => div(deniedIn(c, [3]), submittedGross(c)),
  },
  {
    id: 'dnfb_coding', name: 'DNFB awaiting coding', area: 'Coding', unit: 'usd', direction: 'down', type: 'balance', page: 'midcycle',
    definition: 'DNFB dollars on hold for coding at the period-end snapshot.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE hold_reason = Awaiting coding',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.hold_reason'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0, { hold: [1] }),
  },
  // ================= Clinical documentation =================
  {
    id: 'cdi_query_rate', name: 'CDI query rate', area: 'Clinical Documentation', unit: 'pct', direction: 'none', type: 'flow', page: 'midcycle',
    definition: 'Share of inpatient discharges with at least one physician documentation query.',
    calculation: 'COUNT(inpatient account WHERE query_count > 0) / COUNT(inpatient account), by discharge date',
    sourceFields: ['cdi_query.account_id', 'account.patient_type'], fact: 'acc',
    compute: (c) => div(s(c, 'qry', 'dd', { pred: 'inpatient' }), s(c, '__one', 'dd', { pred: 'inpatient' })),
  },
  {
    id: 'documentation_denial_rate', name: 'Documentation-related denial rate', short: 'Doc. denial rate', area: 'Clinical Documentation', unit: 'pct', direction: 'down', type: 'flow', page: 'midcycle', digits: 2,
    definition: 'Denied dollars in Documentation and Medical necessity categories as a share of gross charges submitted.',
    calculation: 'SUM(denial.gross_amount WHERE category IN (Documentation, Medical necessity)) / SUM(claim.gross_charges, submit date)',
    sourceFields: ['denial.gross_amount', 'denial.category'], fact: 'acc',
    compute: (c) => div(deniedIn(c, [2, 4]), submittedGross(c)),
  },
  {
    id: 'dnfb_query', name: 'DNFB on physician query', area: 'Clinical Documentation', unit: 'usd', direction: 'down', type: 'balance', page: 'midcycle',
    definition: 'DNFB dollars on hold for a physician documentation query at the period-end snapshot.',
    calculation: 'SUM(dnfb_snapshot.gross_amount) WHERE hold_reason = Physician query',
    sourceFields: ['dnfb_snapshot.gross_amount', 'dnfb_snapshot.hold_reason'], fact: 'dnfb',
    compute: (c) => dnfb(c, 0, { hold: [2] }),
  },
  // ================= Patient access =================
  feMetric('eligibility_rate', 'Eligibility verification rate', 'Eligibility rate', 'pct', 'up', 'Share of registrations with insurance eligibility verified electronically before or at service.', 'eligVerified', 'eligDue'),
  feMetric('auth_rate', 'Authorization rate', 'Auth rate', 'pct', 'up', 'Share of services that require authorization with an authorization on file.', 'authObtained', 'authRequired'),
  feMetric('preservice_auth_rate', 'Pre-service authorization rate', 'Pre-service auth', 'pct', 'up', 'Share of services that require authorization with the authorization obtained before the date of service.', 'authPreService', 'authRequired'),
  {
    id: 'registration_accuracy', name: 'Registration accuracy', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Share of submitted claims with no registration or demographic edit.',
    calculation: '1 − COUNT(claim WHERE edit_category = Registration) / COUNT(claim), by submit date',
    sourceFields: ['claim_edit.category', 'claim.submit_date'], fact: 'acc',
    compute: (c) => { const n = s(c, '__one', 'sbd'); return n > 0 ? 1 - s(c, 'regErr', 'sbd') / n : null; },
  },
  feMetric('fin_clearance_rate', 'Financial clearance rate', 'Financial clearance', 'pct', 'up', 'Share of scheduled patients financially cleared (eligibility, benefits, estimate and authorization) before service.', 'finCleared', 'finClearDue'),
  feMetric('prereg_rate', 'Pre-registration rate', 'Pre-registration', 'pct', 'up', 'Share of scheduled encounters pre-registered at least 24 hours before service.', 'preRegDone', 'preRegDue'),
  feMetric('scheduled_rate', 'Order scheduling rate', 'Scheduled rate', 'pct', 'up', 'Share of received orders that are scheduled.', 'ordersScheduled', 'ordersReceived'),
  feCountMetric('scheduled_volume', 'Scheduled volume', 'Appointments scheduled from orders in the period.', 'ordersScheduled'),
  feCountMetric('orders_received', 'Orders received', 'Orders received for scheduled services.', 'ordersReceived'),
  {
    id: 'open_orders', name: 'Open orders', area: 'Patient Access', unit: 'count', direction: 'down', type: 'balance', page: 'access',
    definition: 'Orders not yet scheduled at the end of the last day of the period.',
    calculation: 'open_orders_eod on the last day of the period',
    sourceFields: ['scheduling_daily.open_orders_eod'], fact: 'fe',
    compute: (c) => (c.e.feHasCol('openOrdersEod', c.sel) ? c.e.snapshot('fe', 'openOrdersEod', Math.min(c.r.endDay, c.e.lastDay), c.sel) : null),
  },
  {
    id: 'pos_collections', name: 'Point-of-service collections', short: 'POS collections', area: 'Patient Access', unit: 'usd', direction: 'up', type: 'flow', page: 'access',
    definition: 'Patient cash collected at or before the point of service.',
    calculation: 'SUM(transaction.amount) WHERE type = PAYMENT AND pos_flag AND post_date IN period',
    sourceFields: ['transaction.amount', 'transaction.pos_flag'], fact: 'acc',
    compute: (c) => s(c, 'pos', 'dd'),
  },
  {
    id: 'pos_rate', name: 'POS collection rate', area: 'Patient Access', unit: 'pct', direction: 'up', type: 'flow', page: 'access',
    definition: 'Point-of-service cash as a share of expected self-pay patient liability for encounters in the period.',
    calculation: 'SUM(POS cash) / SUM(expected_net WHERE financial_class = Self Pay), by service date',
    sourceFields: ['transaction.amount', 'account.expected_net', 'payer.financial_class'], fact: 'acc',
    compute: (c) => div(s(c, 'pos', 'dd'), s(c, 'net', 'dd', { pred: 'selfPay' })),
  },
  feMetric('call_abandon_rate', 'Call abandonment rate', 'Call abandonment', 'pct', 'down', 'Share of calls to the patient access line that end before an answer.', 'callsAbandoned', 'callsOffered'),
  {
    id: 'asa', name: 'Average speed to answer', short: 'Speed to answer', area: 'Patient Access', unit: 'sec', direction: 'down', type: 'flow', page: 'access',
    definition: 'Average wait in seconds before an agent answers.',
    calculation: 'SUM(answer_wait_seconds) / COUNT(calls answered)',
    sourceFields: ['contact_center_daily.answer_wait_seconds', 'contact_center_daily.calls_answered'], fact: 'fe',
    compute: (c) => feRatio(c, 'answerWaitSecs', 'callsAnswered'),
  },
  feMetric('coverage_found_rate', 'Coverage discovery rate', 'Coverage found', 'pct', 'none', 'Share of screened self-pay accounts where insurance or program coverage was found.', 'coverageFound', 'screened'),
];

function recoverableDollars(c: Ctx) {
  // Denied gross on recoverable root causes = SUM(denAmt * recov). Uses the recoverable root causes as a filter.
  const rcs = c.e.ds.dims.rootCauses.filter((r) => r.recoverable).map((r) => r.key);
  const cur = c.sel.rootCause;
  const use = cur?.length ? rcs.filter((k) => cur.includes(k)) : rcs;
  if (!use.length) return 0;
  return c.e.sum('acc', 'denAmt', 'denD', c.r.startDay, c.r.endDay, { ...c.sel, rootCause: use }, { detail: 'denial' });
}

function feMetric(id: string, name: string, short: string, unit: Unit, direction: Direction, definition: string, num: string, den: string): MetricDef {
  return {
    id, name, short, area: 'Patient Access', unit, direction, type: 'flow', page: 'access', definition,
    calculation: `SUM(${snake(num)}) / SUM(${snake(den)}), by service date`,
    sourceFields: [`access_daily.${snake(num)}`, `access_daily.${snake(den)}`], fact: 'fe',
    compute: (c) => feRatio(c, num, den),
  };
}

function feCountMetric(id: string, name: string, definition: string, col: string): MetricDef {
  return {
    id, name, area: 'Patient Access', unit: 'count', direction: 'none', type: 'flow', page: 'access', definition,
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

/** Evaluate a metric, with a plain reason when the filter context gives no data. */
export function evaluate(m: MetricDef, e: Engine, r: Range, sel: Selections): MetricResult {
  const missing = missingFields(m.fact, sel);
  const staticT = staticTarget(m.id);
  if (missing.length) {
    const names = missing.map((f) => FIELD_LABEL[f].toLowerCase()).join(' or ');
    return { value: null, target: staticT, watch: watchFor(m.id, staticT), noData: `Not available by ${names}. Clear the ${names} filter to see this measure.` };
  }
  if (r.startDay > e.lastDay) return { value: null, target: staticT, watch: watchFor(m.id, staticT), noData: 'No data has been loaded for this period yet.' };
  const ctx = { e, r, sel };
  const v = m.compute(ctx);
  const t = m.target ? m.target(ctx) : staticT;
  const res: MetricResult = { value: v !== null && Number.isFinite(v) ? v : null, target: t, watch: watchFor(m.id, t) };
  if (res.value === null) res.noData = 'No data for the current filters.';
  return res;
}
