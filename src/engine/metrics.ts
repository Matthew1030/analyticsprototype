// Metric library. One definition and one formula per metric (same for every client).
// All definitions are DRAFT. Verify against a primary source before client use.
// Qlik expressions are draft text for the Qlik build map. They assume one concatenated
// Fact table with a FactType field. Verify each one in Qlik.

import { monthEndDay } from '../data/dates';
import type { Engine, FactName, Selections } from './engine';
import { FIELD_LABEL, missingFields } from './engine';
import { shiftMonths } from './periods';

export type Unit = 'pct' | 'days' | 'usd' | 'count' | 'sec' | 'score';
export type Direction = 'up' | 'down' | 'none';
export type MetricGroup = 'Balance Sheet' | 'Income Statement' | 'Front End' | 'Detail';

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

export interface MetricDef {
  id: string;
  name: string;
  short?: string;
  group: MetricGroup;
  unit: Unit;
  direction: Direction;
  definition: string;
  formula: string;
  qlik: string;
  fields: string[];
  multiDef: boolean;
  fact: FactName;
  detailPage?: 'dnfb' | 'claims' | 'ar';
  compute: (c: Ctx) => number | null;
}

const div = (n: number, d: number) => (d > 0 ? n / d : null);

// ---------- shared building blocks ----------
const gross = (c: Ctx, s = c.r.startDay, e = c.r.endDay) => c.e.sum('claims', 'gross', 'dd', s, e, c.sel);
const net = (c: Ctx, s = c.r.startDay, e = c.r.endDay) => c.e.sum('claims', 'net', 'dd', s, e, c.sel);
const adgr = (c: Ctx, day: number) => gross(c, day - 89, day) / 90;
const adnr = (c: Ctx, day: number) => net(c, day - 89, day) / 90;
const cash = (c: Ctx, s = c.r.startDay, e = c.r.endDay) =>
  c.e.sum('claims', 'payAmt', 'payD', s, e, c.sel) + c.e.sum('claims', 'pos', 'dd', s, e, c.sel);
const arDay = (c: Ctx) => c.e.snapshotDayOnOrBefore('ar', c.r.endDay);
const dnfbDay = (c: Ctx) => c.e.snapshotDayOnOrBefore('dnfb', c.r.endDay);
const ar = (c: Ctx, col: 'gross' | 'net', f: { billed?: number[]; ageMin?: number } = {}) => {
  const d = arDay(c);
  return d === null ? null : c.e.snapshot('ar', col, d, c.sel, f);
};
const dnfb = (c: Ctx, stage: number, ageMin?: number) => {
  const d = dnfbDay(c);
  return d === null ? null : c.e.snapshot('dnfb', 'amount', d, c.sel, { stage, ageMin });
};
const fe = (c: Ctx, col: string) => c.e.sum('fe', col, 'day', c.r.startDay, c.r.endDay, c.sel);
const feRatio = (c: Ctx, n: string, d: string) => (c.e.feHasCol(d, c.sel) ? div(fe(c, n), fe(c, d)) : null);
const feCount = (c: Ctx, col: string) => (c.e.feHasCol(col, c.sel) ? fe(c, col) : null);
const lagNet = (c: Ctx) => {
  const s = shiftMonths(c.r, -2);
  return net(c, s.startDay, s.endDay);
};
const submitted = (c: Ctx) => c.e.sum('claims', '__one', 'sbd', c.r.startDay, c.r.endDay, c.sel);
const cleanCount = (c: Ctx) => c.e.sum('claims', 'clean', 'sbd', c.r.startDay, c.r.endDay, c.sel);
const denied = (c: Ctx) => c.e.sum('claims', 'denAmt', 'denD', c.r.startDay, c.r.endDay, c.sel, { detail: 'denial' });

const QDNFB = "Sum({<FactType={'DNFBSnapshot'}, Stage={'DNFB'}, SnapshotDate={\"$(=Max(SnapshotDate))\"}>} UnbilledAmount)";
const QADGR = "(Sum({<FactType={'Charge'}, Date={\">=$(=Max(Date)-89)<=$(=Max(Date))\"}>} GrossCharges) / 90)";
const QADNR = "(Sum({<FactType={'Charge'}, Date={\">=$(=Max(Date)-89)<=$(=Max(Date))\"}>} ExpectedNet) / 90)";
const QAR = (extra = '') => `Sum({<FactType={'ARSnapshot'}, SnapshotDate={"$(=Max(SnapshotDate))"}${extra}>} DebitBalanceGross)`;

export const METRICS: MetricDef[] = [
  {
    id: 'M01', name: 'DNFB gross days', short: 'DNFB days', group: 'Balance Sheet', unit: 'days', direction: 'down',
    definition: 'Discharged-not-final-billed charges at period end, shown as days of average daily gross revenue.',
    formula: 'DNFB $ at the period-end snapshot / (gross charges in the last 90 days / 90)',
    qlik: `${QDNFB} / ${QADGR}`,
    fields: ['FactDnfb.UnbilledAmount', 'FactDnfb.Stage', 'FactCharge.GrossCharges'], multiDef: true, fact: 'dnfb', detailPage: 'dnfb',
    compute: (c) => { const v = dnfb(c, 0); return v === null ? null : div(v, adgr(c, dnfbDay(c)!)); },
  },
  {
    id: 'M02', name: 'DNFB balance', group: 'Detail', unit: 'usd', direction: 'down',
    definition: 'Gross charges of discharged accounts that are not final billed, at the period-end snapshot.',
    formula: 'Sum of UnbilledAmount where Stage = DNFB',
    qlik: QDNFB, fields: ['FactDnfb.UnbilledAmount', 'FactDnfb.Stage'], multiDef: false, fact: 'dnfb', detailPage: 'dnfb',
    compute: (c) => dnfb(c, 0),
  },
  {
    id: 'M03', name: 'DNFB 11+ day share', group: 'Detail', unit: 'pct', direction: 'down',
    definition: 'Share of DNFB dollars that are 11 or more days past discharge.',
    formula: 'DNFB $ aged 11+ days / DNFB $',
    qlik: "Sum({<FactType={'DNFBSnapshot'}, Stage={'DNFB'}, DnfbAge={'11+ days'}, SnapshotDate={\"$(=Max(SnapshotDate))\"}>} UnbilledAmount) / " + QDNFB,
    fields: ['FactDnfb.UnbilledAmount', 'FactDnfb.DnfbAgeKey'], multiDef: false, fact: 'dnfb', detailPage: 'dnfb',
    compute: (c) => { const a = dnfb(c, 0, 3); const b = dnfb(c, 0); return a === null || b === null ? null : div(a, b); },
  },
  {
    id: 'M04', name: 'DNSP gross days', short: 'DNSP days', group: 'Balance Sheet', unit: 'days', direction: 'down',
    definition: 'Final-billed charges not yet sent to the payer at period end, shown as days of average daily gross revenue.',
    formula: 'DNSP $ at the period-end snapshot / (gross charges in the last 90 days / 90)',
    qlik: QDNFB.replace("'DNFB'", "'DNSP'") + ` / ${QADGR}`,
    fields: ['FactDnfb.UnbilledAmount', 'FactDnfb.Stage', 'FactCharge.GrossCharges'], multiDef: true, fact: 'dnfb', detailPage: 'dnfb',
    compute: (c) => { const v = dnfb(c, 1); return v === null ? null : div(v, adgr(c, dnfbDay(c)!)); },
  },
  {
    id: 'M05', name: 'Clean claim rate', short: 'Clean claim rate', group: 'Income Statement', unit: 'pct', direction: 'up',
    definition: 'Share of claims that pass all edits on first submission with no manual touch.',
    formula: 'Clean claims / claims submitted (by submission date)',
    qlik: "Sum({<FactType={'Submission'}>} CleanFlag) / Count({<FactType={'Submission'}>} ClaimId)",
    fields: ['FactClaimSubmission.CleanFlag', 'FactClaimSubmission.ClaimId'], multiDef: true, fact: 'claims', detailPage: 'claims',
    compute: (c) => div(cleanCount(c), submitted(c)),
  },
  {
    id: 'M06', name: 'Rework claims', group: 'Detail', unit: 'count', direction: 'down',
    definition: 'Claims that failed an edit on first submission.',
    formula: 'Claims submitted - clean claims',
    qlik: "Count({<FactType={'Submission'}, CleanFlag={0}>} ClaimId)",
    fields: ['FactClaimSubmission.CleanFlag', 'FactClaimSubmission.EditCategoryKey'], multiDef: false, fact: 'claims', detailPage: 'claims',
    compute: (c) => c.e.sum('claims', '__one', 'sbd', c.r.startDay, c.r.endDay, c.sel, { detail: 'edit' })
      - c.e.sum('claims', 'clean', 'sbd', c.r.startDay, c.r.endDay, c.sel, { detail: 'edit' }),
  },
  {
    id: 'M07', name: 'Initial denial rate (% gross revenue)', short: 'Initial denial %', group: 'Income Statement', unit: 'pct', direction: 'down',
    definition: 'Charges on initially denied claims as a share of gross charges in the same period.',
    formula: 'Initial denied $ (by denial date) / gross charges (by discharge date)',
    qlik: "Sum({<FactType={'Denial'}>} DeniedAmount) / Sum({<FactType={'Charge'}>} GrossCharges)",
    fields: ['FactDenial.DeniedAmount', 'FactCharge.GrossCharges'], multiDef: true, fact: 'claims', detailPage: 'claims',
    compute: (c) => div(denied(c), gross(c)),
  },
  {
    id: 'M08', name: 'Initial denials', group: 'Detail', unit: 'usd', direction: 'down',
    definition: 'Charges on claims with an initial denial, by denial date.',
    formula: 'Sum of DeniedAmount',
    qlik: "Sum({<FactType={'Denial'}>} DeniedAmount)",
    fields: ['FactDenial.DeniedAmount', 'FactDenial.DenialReasonKey'], multiDef: false, fact: 'claims', detailPage: 'claims',
    compute: (c) => denied(c),
  },
  {
    id: 'M09', name: 'Denial share by category', group: 'Detail', unit: 'pct', direction: 'none',
    definition: 'Denied dollars of the selected denial categories as a share of all denied dollars.',
    formula: 'Denied $ (selected category) / denied $ (all categories)',
    qlik: "Sum({<FactType={'Denial'}>} DeniedAmount) / Sum({<FactType={'Denial'}, DenialCategory=>} DeniedAmount)",
    fields: ['FactDenial.DeniedAmount', 'DimDenialReason.DenialCategory'], multiDef: false, fact: 'claims', detailPage: 'claims',
    compute: (c) => div(denied(c), c.e.sum('claims', 'denAmt', 'denD', c.r.startDay, c.r.endDay, c.sel)),
  },
  {
    id: 'M10', name: 'Gross A/R days', short: 'Gross A/R days', group: 'Balance Sheet', unit: 'days', direction: 'down',
    definition: 'Gross debit A/R at month end, shown as days of average daily gross revenue.',
    formula: 'Gross debit A/R / (gross charges in the last 90 days / 90)',
    qlik: `${QAR()} / ${QADGR}`,
    fields: ['FactAr.DebitBalanceGross', 'FactCharge.GrossCharges'], multiDef: true, fact: 'ar', detailPage: 'ar',
    compute: (c) => { const v = ar(c, 'gross'); return v === null ? null : div(v, adgr(c, arDay(c)!)); },
  },
  {
    id: 'M11', name: 'Debit net A/R days', short: 'Net A/R days', group: 'Balance Sheet', unit: 'days', direction: 'down',
    definition: 'Debit A/R net of expected allowances at month end, shown as days of average daily net revenue.',
    formula: 'Net debit A/R / (expected net revenue in the last 90 days / 90)',
    qlik: `${QAR().replace('DebitBalanceGross', 'DebitBalanceNet')} / ${QADNR}`,
    fields: ['FactAr.DebitBalanceNet', 'FactCharge.ExpectedNet'], multiDef: true, fact: 'ar', detailPage: 'ar',
    compute: (c) => { const v = ar(c, 'net'); return v === null ? null : div(v, adnr(c, arDay(c)!)); },
  },
  {
    id: 'M12', name: 'Gross A/R', group: 'Balance Sheet', unit: 'usd', direction: 'none',
    definition: 'Gross debit A/R at the month-end snapshot.',
    formula: 'Sum of DebitBalanceGross',
    qlik: QAR(), fields: ['FactAr.DebitBalanceGross'], multiDef: false, fact: 'ar', detailPage: 'ar',
    compute: (c) => ar(c, 'gross'),
  },
  {
    id: 'M13', name: 'Billed insurance > 90 days', short: 'Billed ins > 90', group: 'Balance Sheet', unit: 'pct', direction: 'down',
    definition: 'Share of billed insurance A/R that is more than 90 days from discharge.',
    formula: 'Billed insurance A/R aged 91+ days / billed insurance A/R',
    qlik: `${QAR(", BilledStatus={'Billed Insurance'}, ArAge={'91-180','181-360','361+'}")} / ${QAR(", BilledStatus={'Billed Insurance'}")}`,
    fields: ['FactAr.DebitBalanceGross', 'FactAr.BilledStatus', 'FactAr.ArAgeKey'], multiDef: true, fact: 'ar', detailPage: 'ar',
    compute: (c) => { const a = ar(c, 'gross', { billed: [1], ageMin: 3 }); const b = ar(c, 'gross', { billed: [1] }); return a === null || b === null ? null : div(a, b); },
  },
  {
    id: 'M14', name: 'Billed insurance > 360 days', short: 'Billed ins > 360', group: 'Balance Sheet', unit: 'pct', direction: 'down',
    definition: 'Share of billed insurance A/R that is more than 360 days from discharge.',
    formula: 'Billed insurance A/R aged 361+ days / billed insurance A/R',
    qlik: `${QAR(", BilledStatus={'Billed Insurance'}, ArAge={'361+'}")} / ${QAR(", BilledStatus={'Billed Insurance'}")}`,
    fields: ['FactAr.DebitBalanceGross', 'FactAr.BilledStatus', 'FactAr.ArAgeKey'], multiDef: true, fact: 'ar', detailPage: 'ar',
    compute: (c) => { const a = ar(c, 'gross', { billed: [1], ageMin: 5 }); const b = ar(c, 'gross', { billed: [1] }); return a === null || b === null ? null : div(a, b); },
  },
  {
    id: 'M15', name: 'Gap to > 90 day target', group: 'Detail', unit: 'usd', direction: 'down',
    definition: 'Billed insurance A/R above the share that the > 90 day target allows.',
    formula: 'Max(0, billed insurance A/R aged 91+ - target x billed insurance A/R)',
    qlik: `RangeMax(0, ${QAR(", BilledStatus={'Billed Insurance'}, ArAge={'91-180','181-360','361+'}")} - vTargetM13 * ${QAR(", BilledStatus={'Billed Insurance'}")})`,
    fields: ['FactAr.DebitBalanceGross', 'CfgTarget.Target'], multiDef: false, fact: 'ar', detailPage: 'ar',
    compute: (c) => { const a = ar(c, 'gross', { billed: [1], ageMin: 3 }); const b = ar(c, 'gross', { billed: [1] }); return a === null || b === null ? null : Math.max(0, a - 0.22 * b); },
  },
  {
    id: 'M16', name: 'Days to collect', group: 'Detail', unit: 'days', direction: 'down',
    definition: 'Gross A/R shown as days of gross revenue, for the selected payers.',
    formula: 'Gross debit A/R / (gross charges in the last 90 days / 90), by payer',
    qlik: `${QAR()} / ${QADGR}`,
    fields: ['FactAr.DebitBalanceGross', 'FactCharge.GrossCharges', 'DimPayer.PayerName'], multiDef: true, fact: 'ar', detailPage: 'ar',
    compute: (c) => { const v = ar(c, 'gross'); return v === null ? null : div(v, adgr(c, arDay(c)!)); },
  },
  {
    id: 'M17', name: 'Gross revenue share', group: 'Detail', unit: 'pct', direction: 'none',
    definition: 'Gross charges of the selected facilities as a share of all facilities.',
    formula: 'Gross charges (selection) / gross charges (all facilities)',
    qlik: "Sum({<FactType={'Charge'}>} GrossCharges) / Sum({<FactType={'Charge'}, FacilityName=>} GrossCharges)",
    fields: ['FactCharge.GrossCharges', 'DimFacility.FacilityName'], multiDef: false, fact: 'claims',
    compute: (c) => div(gross(c), c.e.sum('claims', 'gross', 'dd', c.r.startDay, c.r.endDay, { ...c.sel, facility: [] })),
  },
  {
    id: 'M18', name: 'Bad debt transfers % NPSR', short: 'Bad debt % NPSR', group: 'Income Statement', unit: 'pct', direction: 'down',
    definition: 'Dollars moved to bad debt as a share of net patient service revenue in the same period.',
    formula: 'Bad debt transfers $ (by posting date) / expected net revenue (by discharge date)',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'BadDebt'}>} Amount) / Sum({<FactType={'Charge'}>} ExpectedNet)",
    fields: ['FactTxn.Amount', 'FactTxn.TxnType', 'FactCharge.ExpectedNet'], multiDef: true, fact: 'claims', detailPage: 'ar',
    compute: (c) => div(c.e.sum('claims', 'bdAmt', 'bdD', c.r.startDay, c.r.endDay, c.sel), net(c)),
  },
  {
    id: 'M19', name: 'Denial write-offs % NPSR', short: 'Denial W/O % NPSR', group: 'Income Statement', unit: 'pct', direction: 'down',
    definition: 'Denial write-off dollars as a share of net patient service revenue in the same period.',
    formula: 'Denial write-offs $ (by posting date) / expected net revenue (by discharge date)',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'DenialWO'}>} Amount) / Sum({<FactType={'Charge'}>} ExpectedNet)",
    fields: ['FactTxn.Amount', 'FactTxn.TxnType', 'FactCharge.ExpectedNet'], multiDef: true, fact: 'claims', detailPage: 'claims',
    compute: (c) => div(c.e.sum('claims', 'woAmt', 'woD', c.r.startDay, c.r.endDay, c.sel, { detail: 'writeoff' }), net(c)),
  },
  {
    id: 'M20', name: 'Denial write-offs', group: 'Detail', unit: 'usd', direction: 'down',
    definition: 'Denial write-off dollars by write-off reason, by posting date.',
    formula: 'Sum of Amount where TxnType = DenialWO',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'DenialWO'}>} Amount)",
    fields: ['FactTxn.Amount', 'FactTxn.WriteOffReasonKey'], multiDef: false, fact: 'claims', detailPage: 'claims',
    compute: (c) => c.e.sum('claims', 'woAmt', 'woD', c.r.startDay, c.r.endDay, c.sel, { detail: 'writeoff' }),
  },
  {
    id: 'M21', name: 'Cash posted', group: 'Detail', unit: 'usd', direction: 'up',
    definition: 'Payer and patient cash posted in the period, including point-of-service cash.',
    formula: 'Sum of Amount where TxnType = Payment (by posting date)',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'Payment'}>} Amount)",
    fields: ['FactTxn.Amount', 'FactTxn.TxnType'], multiDef: false, fact: 'claims', detailPage: 'ar',
    compute: (c) => cash(c),
  },
  {
    id: 'M22', name: 'Cash posted % NPSR (2-month lag)', short: 'Cash % NPSR', group: 'Income Statement', unit: 'pct', direction: 'up',
    definition: 'Cash posted in the period as a share of net revenue from the same period two months earlier.',
    formula: 'Cash posted (period) / expected net revenue (period shifted back 2 months)',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'Payment'}>} Amount) / Sum({<FactType={'Charge'}, MonthIndex={\">=$(=Min(MonthIndex)-2)<=$(=Max(MonthIndex)-2)\"}, Month=, Quarter=>} ExpectedNet)",
    fields: ['FactTxn.Amount', 'FactCharge.ExpectedNet', 'DimDate.MonthIndex'], multiDef: true, fact: 'claims', detailPage: 'ar',
    compute: (c) => div(cash(c), lagNet(c)),
  },
  {
    id: 'M23', name: 'Cash shortfall vs. NPSR', group: 'Detail', unit: 'usd', direction: 'down',
    definition: 'Lagged net revenue minus cash posted. A negative value means cash is above lagged NPSR.',
    formula: 'Expected net revenue (shifted back 2 months) - cash posted',
    qlik: "Sum({<FactType={'Charge'}, MonthIndex={\">=$(=Min(MonthIndex)-2)<=$(=Max(MonthIndex)-2)\"}, Month=, Quarter=>} ExpectedNet) - Sum({<FactType={'Txn'}, TxnType={'Payment'}>} Amount)",
    fields: ['FactTxn.Amount', 'FactCharge.ExpectedNet'], multiDef: false, fact: 'claims', detailPage: 'ar',
    compute: (c) => lagNet(c) - cash(c),
  },
  {
    id: 'M24', name: 'Cash posted % under 90 days', group: 'Detail', unit: 'pct', direction: 'up',
    definition: 'Share of cash posted within 90 days of discharge.',
    formula: 'Cash posted where posting date - discharge date <= 90 / cash posted',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'Payment'}, CashAge={'0-30','31-60','61-90'}>} Amount) / Sum({<FactType={'Txn'}, TxnType={'Payment'}>} Amount)",
    fields: ['FactTxn.Amount', 'FactTxn.CashAgeKey'], multiDef: false, fact: 'claims', detailPage: 'ar',
    compute: (c) => { const b = c.e.cashByAge(c.r.startDay, c.r.endDay, c.sel); const t = b.reduce((x, y) => x + y, 0); return div(b[0] + b[1] + b[2], t); },
  },
  {
    id: 'M25', name: 'Cash posted by payer', group: 'Detail', unit: 'usd', direction: 'up',
    definition: 'Cash posted, shown by payer or financial class.',
    formula: 'Sum of Amount where TxnType = Payment, by payer',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'Payment'}>} Amount)",
    fields: ['FactTxn.Amount', 'DimPayer.PayerName'], multiDef: false, fact: 'claims', detailPage: 'ar',
    compute: (c) => cash(c),
  },
  {
    id: 'M26', name: 'Gross revenue', group: 'Income Statement', unit: 'usd', direction: 'none',
    definition: 'Gross charges by discharge date.',
    formula: 'Sum of GrossCharges',
    qlik: "Sum({<FactType={'Charge'}>} GrossCharges)",
    fields: ['FactCharge.GrossCharges'], multiDef: false, fact: 'claims',
    compute: (c) => gross(c),
  },
  {
    id: 'M27', name: 'Net revenue (NPSR)', group: 'Income Statement', unit: 'usd', direction: 'none',
    definition: 'Expected net patient service revenue by discharge date.',
    formula: 'Sum of ExpectedNet',
    qlik: "Sum({<FactType={'Charge'}>} ExpectedNet)",
    fields: ['FactCharge.ExpectedNet'], multiDef: true, fact: 'claims',
    compute: (c) => net(c),
  },
  {
    id: 'M28', name: 'Composite facility score', group: 'Detail', unit: 'score', direction: 'up',
    definition: 'Score from 0 to 100 from the average rank of a facility on five metrics, among the facilities in view (1 = best).',
    formula: '100 x (N - average rank) / (N - 1). Ranks on DNFB days, clean claim rate, gross A/R days, initial denial %, cash % NPSR.',
    qlik: 'Aggr(100 * (Count(DISTINCT TOTAL FacilityName) - RangeAvg(Rank(-[DNFB days]), Rank([Clean claim rate]), Rank(-[Gross A/R days]), Rank(-[Denial %]), Rank([Cash % NPSR]))) / (Count(DISTINCT TOTAL FacilityName) - 1), FacilityName)',
    fields: ['Inputs of M01, M05, M10, M07, M22', 'DimFacility.FacilityName'], multiDef: false, fact: 'claims',
    compute: () => null,
  },
  {
    id: 'M29', name: 'Facility rank', group: 'Detail', unit: 'count', direction: 'down',
    definition: 'Rank of a facility on one metric among the facilities in view. 1 = best.',
    formula: 'Rank over facilities, ordered by the metric direction',
    qlik: 'Rank(TOTAL [Metric]) inside Aggr(..., FacilityName)',
    fields: ['Metric inputs', 'DimFacility.FacilityName'], multiDef: false, fact: 'claims',
    compute: () => null,
  },
  // ---------- front end ----------
  feMetric('M30', 'Total order volume', 'count', 'none', 'Orders received for scheduled services.', 'Sum of OrdersReceived', ['ordersReceived'], (c) => feCount(c, 'ordersReceived')),
  feMetric('M31', 'Total scheduled volume', 'count', 'none', 'Orders that were scheduled.', 'Sum of OrdersScheduled', ['ordersScheduled'], (c) => feCount(c, 'ordersScheduled')),
  feMetric('M32', 'Scheduled rate', 'pct', 'up', 'Share of received orders that are scheduled.', 'Orders scheduled / orders received', ['ordersScheduled', 'ordersReceived'], (c) => feRatio(c, 'ordersScheduled', 'ordersReceived'), true),
  feMetric('M33', 'Open orders', 'count', 'down', 'Orders not scheduled at the end of the last day of the period (point in time).', 'OpenOrdersEod on the last day of the period', ['openOrdersEod'],
    (c) => (c.e.feHasCol('openOrdersEod', c.sel) ? c.e.snapshot('fe', 'openOrdersEod', Math.min(c.r.endDay, c.e.lastDay), c.sel) : null)),
  feMetric('M34', 'Schedule turnaround time', 'days', 'down', 'Average days from order to scheduled.', 'Sum of schedule days / orders scheduled', ['scheduleDaysSum', 'ordersScheduled'], (c) => feRatio(c, 'scheduleDaysSum', 'ordersScheduled')),
  feMetric('M35', 'DPA I 24-hour completion', 'pct', 'up', 'Share of scheduled encounters with pre-registration complete 1 or more days before service.', 'Pre-reg complete 1+ day out / pre-reg due', ['preReg1Day', 'preRegDue'], (c) => feRatio(c, 'preReg1Day', 'preRegDue'), true),
  feMetric('M36', 'Pre-reg completion, same day', 'pct', 'up', 'Share of scheduled encounters with pre-registration complete by the day of service.', 'Pre-reg complete same day / pre-reg due', ['preRegSameDay', 'preRegDue'], (c) => feRatio(c, 'preRegSameDay', 'preRegDue')),
  feMetric('M37', 'Pre-reg completion, 2 days out', 'pct', 'up', 'Share of scheduled encounters with pre-registration complete 2 or more days before service.', 'Pre-reg complete 2+ days out / pre-reg due', ['preReg2Day', 'preRegDue'], (c) => feRatio(c, 'preReg2Day', 'preRegDue')),
  feMetric('M38', 'DPA II 24-hour completion (all teams)', 'pct', 'up', 'Same as DPA I, for all registration teams. Low confidence: the meaning is not confirmed.', 'DPA II complete / DPA II due', ['dpa2Done', 'dpa2Due'], (c) => feRatio(c, 'dpa2Done', 'dpa2Due'), true),
  feMetric('M39', 'Total call volume', 'count', 'none', 'Calls offered to the patient access line.', 'Sum of CallsOffered', ['callsOffered'], (c) => feCount(c, 'callsOffered')),
  feMetric('M40', 'Average speed to answer', 'sec', 'down', 'Average wait in seconds before a person answers.', 'Sum of answer wait seconds / calls answered', ['answerWaitSecs', 'callsAnswered'], (c) => feRatio(c, 'answerWaitSecs', 'callsAnswered')),
  feMetric('M41', 'Call abandonment rate', 'pct', 'down', 'Share of offered calls that the caller ends before an answer.', 'Calls abandoned / calls offered', ['callsAbandoned', 'callsOffered'], (c) => feRatio(c, 'callsAbandoned', 'callsOffered'), true),
  feMetric('M42', 'Calls abandoned', 'count', 'down', 'Calls ended before an answer.', 'Sum of CallsAbandoned', ['callsAbandoned'], (c) => feCount(c, 'callsAbandoned')),
  {
    id: 'M43', name: 'POS collections', group: 'Front End', unit: 'usd', direction: 'up',
    definition: 'Self-pay cash collected at or before the point of service.',
    formula: 'Sum of Amount where TxnType = Payment and PosFlag = 1',
    qlik: "Sum({<FactType={'Txn'}, TxnType={'Payment'}, PosFlag={1}>} Amount)",
    fields: ['FactTxn.Amount', 'FactTxn.PosFlag'], multiDef: false, fact: 'claims',
    compute: (c) => c.e.sum('claims', 'pos', 'dd', c.r.startDay, c.r.endDay, c.sel),
  },
  {
    id: 'M44', name: 'POS collections % self-pay cash', group: 'Front End', unit: 'pct', direction: 'up',
    definition: 'Point-of-service cash as a share of all self-pay cash.',
    formula: 'POS cash / (POS cash + other self-pay cash)',
    qlik: "Sum({<FactType={'Txn'}, PosFlag={1}>} Amount) / Sum({<FactType={'Txn'}, TxnType={'Payment'}, FinancialClass={'Self Pay'}>} Amount)",
    fields: ['FactTxn.Amount', 'FactTxn.PosFlag', 'DimPayer.FinancialClass'], multiDef: false, fact: 'claims',
    compute: (c) => {
      const pos = c.e.sum('claims', 'pos', 'dd', c.r.startDay, c.r.endDay, c.sel);
      const sp = c.e.sum('claims', 'payAmt', 'payD', c.r.startDay, c.r.endDay, c.sel, { pred: 'selfPay' });
      return div(pos, pos + sp);
    },
  },
  feMetric('M45', 'Eligibility screening rate', 'pct', 'up', 'Share of self-pay accounts screened for coverage.', 'Accounts screened / self-pay accounts', ['screened', 'selfPayAccounts'], (c) => feRatio(c, 'screened', 'selfPayAccounts'), true),
  feMetric('M46', 'Initiated applications', 'count', 'up', 'Coverage applications started.', 'Sum of AppsInitiated', ['appsInitiated'], (c) => feCount(c, 'appsInitiated')),
  feMetric('M47', 'Eligible conversion rate', 'pct', 'up', 'Share of likely-eligible screened patients who get coverage.', 'Converted / eligible screened', ['converted', 'eligibleScreened'], (c) => feRatio(c, 'converted', 'eligibleScreened'), true),
  feMetric('M49', 'Inpatient prior-day completion', 'pct', 'up', 'Share of inpatient admissions with registration complete by the end of the prior day. Low confidence: the meaning is not confirmed.', 'IP prior-day complete / IP admissions', ['ipPriorDayDone', 'ipAdmissions'], (c) => feRatio(c, 'ipPriorDayDone', 'ipAdmissions'), true),
];

function feMetric(id: string, name: string, unit: Unit, direction: Direction, definition: string, formula: string,
  cols: string[], compute: (c: Ctx) => number | null, multiDef = false): MetricDef {
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const qlik = cols.length === 2
    ? `Sum({<FactType={'FrontEnd'}>} ${cap(cols[0])}) / Sum({<FactType={'FrontEnd'}>} ${cap(cols[1])})`
    : `Sum({<FactType={'FrontEnd'}>} ${cap(cols[0])})`;
  return {
    id, name, group: 'Front End', unit, direction, definition, formula, qlik,
    fields: cols.map((x) => `FactFrontEnd.${cap(x)}`), multiDef, fact: 'fe', compute,
  };
}

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export interface MetricResult {
  value: number | null;
  /** Reason when value is null. */
  noData?: string;
}

/** Evaluate a metric, with a plain reason when the selection gives no data. */
export function evaluate(m: MetricDef, e: Engine, r: Range, sel: Selections): MetricResult {
  const missing = missingFields(m.fact, sel);
  if (missing.length) {
    const names = missing.map((f) => FIELD_LABEL[f].toLowerCase()).join(' or ');
    return { value: null, noData: `This data has no ${names} field. Clear the ${names} selection to see it.` };
  }
  if (r.startDay > e.lastDay) return { value: null, noData: 'No data is available for this period.' };
  const v = m.compute({ e, r, sel });
  if (v === null || !Number.isFinite(v)) return { value: null, noData: 'No data is available for this selection.' };
  return { value: v };
}

/** Range for a single month (used by cash lag helpers and tests). */
export function monthRange(mi: number): Range {
  return { startDay: monthEndDay(mi - 1) + 1, endDay: monthEndDay(mi), startMi: mi, endMi: mi };
}
