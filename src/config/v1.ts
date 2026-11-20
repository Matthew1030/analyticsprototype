// Release scope (prototype only). The version selector in the prototype bar shows one of two v1
// options, or the full concept with every planned page:
// - v1 (A): the first v1 proposal (six ELT KPIs, one Denials page).
// - v1 (B): the simple, lovable, complete (SLC) proposal: the ELT Summary only, with Daily,
//   Weekly and Monthly tabs of six headline KPIs each, and Performance vs. Target in four tabs
//   (Financial / Cash / AR, Denials, Billing / Mid-Cycle, Patient Access). No analytics views.
//   This is the default.
// This file is the one place that says what each v1 option holds.

import type { PageId } from '../state/AppState';

export type Version = 'v1' | 'v1b' | 'full';
export type V1Version = Exclude<Version, 'full'>;

export const VERSION_LABEL: Record<Version, string> = { v1: 'v1 (A)', v1b: 'v1 (B)', full: 'Full concept' };
/** Value of the "?v=" URL query for each version (v1 (B) is the default, so it has none). */
export const VERSION_QUERY: Record<Version, string | null> = { v1: 'a', v1b: null, full: 'full' };

/** True for both v1 options. */
export const isV1 = (v: Version): v is V1Version => v !== 'full';

// ---------------------------------------------------------------- v1 (A)

/** ELT Summary KPI cards, in revenue-cycle order (front end to back end), two rows of three. */
export const V1_ELT_KPIS = [
  'pos_collections', // PA-22
  'front_end_denial_rate', // PA-02
  'coding_denial_rate', // CO-04
  'clean_claim_rate', // BL-01
  'dnfb_days', // BL-08
  'denial_dollar_rate', // DN-04
];

/** Performance vs. Target rows in v1, grouped by revenue-cycle stage. */
export const V1_ELT_GROUPS: { name: string; metrics: string[] }[] = [
  { name: 'Patient Access', metrics: ['pos_collections', 'front_end_denial_rate'] },
  { name: 'Coding', metrics: ['coding_denial_rate'] },
  { name: 'Billing', metrics: ['clean_claim_rate', 'dnfb_days'] },
  { name: 'Denials', metrics: ['denial_dollar_rate'] },
];

/** The only ELT KPI that opens an analytics page in v1 (the Denials page). */
export const V1_DRILL: Record<string, PageId> = { denial_dollar_rate: 'denials' };

/** Denials page KPI strip. */
export const V1_DENIAL_KPIS = [
  'denial_dollars', // DN-05
  'denial_dollar_rate', // DN-04
  'front_end_denial_rate', // PA-02
  'coding_denial_rate', // CO-04
  'documentation_denial_rate', // CD-02
  'denial_writeoffs', // DN-15
  'denial_wo_pct_npsr', // DN-16
];

/** Pages that exist in v1. Any other page opens the ELT Summary. */
export const V1_PAGES: PageId[] = ['executive', 'denials', 'dictionary'];

/** Every metric that v1 shows (the Metric Dictionary lists only these in v1). */
export const V1_METRICS = [...new Set([...V1_ELT_KPIS, ...V1_DENIAL_KPIS])];

// ---------------------------------------------------------------- v1 (B)

/**
 * One ELT KPI card. A string is one metric. 'pair' shows a second metric under the first (e.g.
 * A/R days with A/R $). 'dnfb-split' shows DNFB in the EHR (not final billed) and in the
 * scrubber (billed, not submitted), in $ and days. 'denial-worklist' shows the open denials
 * worklist ($ and count). 'placeholder' is a card kept for a metric not yet chosen.
 */
export type KpiSpec =
  | string
  | { kind: 'pair'; id: string; secondary: string }
  | { kind: 'dnfb-split' }
  | { kind: 'denial-worklist' }
  | { kind: 'placeholder' };

export type Cadence = 'day' | 'week' | 'month';

/** ELT Summary tabs (Daily, Weekly, Monthly), each with six headline KPI cards, two rows of three. */
export const V1B_ELT_CADENCES: Record<Cadence, { label: string; kpis: KpiSpec[] }> = {
  day: {
    label: 'Daily',
    kpis: [
      { kind: 'dnfb-split' }, // BL-07 / BL-08 (EHR), BL-10 / BL-09 (scrubber)
      'cash', // CA-01
      { kind: 'denial-worklist' },
      { kind: 'placeholder' },
      { kind: 'placeholder' },
      'denial_dollar_rate', // DN-04
    ],
  },
  week: {
    label: 'Weekly',
    kpis: [
      { kind: 'pair', id: 'dnfb_days', secondary: 'dnfb_dollars' }, // BL-08 / BL-07 (days first: it has the target)
      'cash', // CA-01
      { kind: 'pair', id: 'net_ar_days', secondary: 'net_ar' }, // AR-05 / AR-04
      'ar_gt90_pct', // AR-07
      'denial_dollar_rate', // DN-04
      'clean_claim_rate', // BL-01
    ],
  },
  month: {
    label: 'Monthly',
    kpis: ['npsr', 'cash', 'cash_pct_npsr', 'net_ar_days', 'ar_gt90_pct', 'denial_dollar_rate'],
  },
};
export const CADENCES: Cadence[] = ['day', 'week', 'month'];

/** DNFB split card: the EHR stage (not final billed) and the scrubber stage (billed, not submitted). */
export const DNFB_SPLIT = [
  { label: 'EHR', dollars: 'dnfb_dollars', days: 'dnfb_days' }, // BL-07, BL-08
  { label: 'Scrubber', dollars: 'dnsp_dollars', days: 'dnsp_days' }, // BL-10, BL-09
];

/** The catalog metrics that a KPI card shows. */
export function kpiMetrics(k: KpiSpec): string[] {
  if (typeof k === 'string') return [k];
  if (k.kind === 'pair') return [k.id, k.secondary];
  if (k.kind === 'dnfb-split') return DNFB_SPLIT.flatMap((s) => [s.dollars, s.days]);
  return [];
}

/** Performance vs. Target: the v1 (B) metrics by RCM area. */
export const V1B_ELT_GROUPS: { name: string; metrics: string[] }[] = [
  { name: 'Financial', metrics: ['npsr'] },
  { name: 'Cash', metrics: ['cash', 'cash_pct_npsr'] },
  { name: 'A/R', metrics: ['net_ar_days', 'net_ar', 'ar_gt90_pct'] },
  { name: 'Denials', metrics: ['denial_dollar_rate', 'denial_dollars', 'denial_wo_pct_npsr'] },
  { name: 'Billing', metrics: ['clean_claim_rate', 'dnfb_dollars', 'dnfb_days', 'dnsp_dollars', 'dnsp_days'] },
  { name: 'Mid-cycle', metrics: ['documentation_denial_rate', 'coding_denial_rate'] },
  { name: 'Patient Access', metrics: ['front_end_denial_rate', 'fin_clearance_rate', 'pos_collections', 'pos_pct_sp_cash'] },
];

/** Performance vs. Target tabs: the group names in each tab. Denials has a tab of its own. */
export const V1B_ELT_TABS: { id: string; label: string; groups: string[] }[] = [
  { id: 'cash-ar', label: 'Financial / Cash / AR', groups: ['Financial', 'Cash', 'A/R'] },
  { id: 'denials', label: 'Denials', groups: ['Denials'] },
  { id: 'billing-mid', label: 'Billing / Mid-Cycle', groups: ['Billing', 'Mid-cycle'] },
  { id: 'access', label: 'Patient Access', groups: ['Patient Access'] },
];

/** Every metric that v1 (B) shows: the Performance vs. Target metrics (the KPI cards use a subset). */
export const V1B_METRICS = V1B_ELT_GROUPS.flatMap((g) => g.metrics);

/** v1 (B) has the ELT Summary only (and the prototype Metric Dictionary). No analytics views. */
export const V1B_PAGES: PageId[] = ['executive', 'dictionary'];

// ---------------------------------------------------------------- scope by version

export interface V1Scope {
  /** KPI cards. v1 (B) has one set per cadence tab instead (cadences). */
  eltKpis: string[];
  cadences?: Record<Cadence, { label: string; kpis: KpiSpec[] }>;
  eltGroups: { name: string; metrics: string[] }[];
  /** Performance vs. Target tabs, when the table does not fit one screen. */
  eltTabs?: { id: string; label: string; groups: string[] }[];
  drill: Record<string, PageId>;
  pages: PageId[];
  metrics: string[];
  /** Views (by name) that show each metric, for the Metric Dictionary. */
  views: (id: string) => string[];
}

export const V1_SCOPE: Record<V1Version, V1Scope> = {
  v1: {
    eltKpis: V1_ELT_KPIS, eltGroups: V1_ELT_GROUPS, drill: V1_DRILL, pages: V1_PAGES, metrics: V1_METRICS,
    views: (id) => [V1_ELT_KPIS.includes(id) && 'ELT Summary', V1_DENIAL_KPIS.includes(id) && 'Denials'].filter((x): x is string => !!x),
  },
  v1b: {
    eltKpis: V1B_ELT_CADENCES.month.kpis.flatMap(kpiMetrics), cadences: V1B_ELT_CADENCES, eltGroups: V1B_ELT_GROUPS, eltTabs: V1B_ELT_TABS,
    drill: {}, pages: V1B_PAGES, metrics: V1B_METRICS,
    views: () => ['ELT Summary'],
  },
};
