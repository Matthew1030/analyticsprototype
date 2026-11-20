// Release scope (prototype only). The version selector in the prototype bar shows one of two v1
// options, or the full concept with every planned page:
// - v1 (A): the first v1 proposal (six ELT KPIs, one Denials page).
// - v1 (B): the simple, lovable, complete (SLC) proposal: 16 critical metrics on the ELT Summary,
//   and three one-screen deep dives (Denials, Cash + A/R, Patient Access). This is the default.
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

/** The 16 critical metrics of v1 (B), in the order of the team's list. */
export const V1B_METRICS = [
  'npsr', // FN-01
  'cash', // CA-01
  'cash_pct_npsr', // CA-03
  'net_ar_days', // AR-05
  'ar_gt90_pct', // AR-07
  'clean_claim_rate', // BL-01
  'dnfb_days', // BL-08
  'denial_dollar_rate', // DN-04
  'denial_dollars', // DN-05
  'denial_wo_pct_npsr', // DN-16
  'documentation_denial_rate', // CD-02
  'coding_denial_rate', // CO-04
  'front_end_denial_rate', // PA-02
  'fin_clearance_rate', // PA-08
  'pos_collections', // PA-22
  'pos_pct_sp_cash', // PA-58
];

/** ELT Summary KPI cards: the outcome metrics, two rows of three. */
export const V1B_ELT_KPIS = ['npsr', 'cash', 'cash_pct_npsr', 'net_ar_days', 'ar_gt90_pct', 'denial_dollar_rate'];

/** Performance vs. Target: all 16 metrics, by RCM area. */
export const V1B_ELT_GROUPS: { name: string; metrics: string[] }[] = [
  { name: 'Financial', metrics: ['npsr'] },
  { name: 'Cash', metrics: ['cash', 'cash_pct_npsr'] },
  { name: 'A/R', metrics: ['net_ar_days', 'ar_gt90_pct'] },
  { name: 'Billing', metrics: ['clean_claim_rate', 'dnfb_days'] },
  { name: 'Denials', metrics: ['denial_dollar_rate', 'denial_dollars', 'denial_wo_pct_npsr'] },
  { name: 'Mid-cycle', metrics: ['documentation_denial_rate', 'coding_denial_rate'] },
  { name: 'Patient Access', metrics: ['front_end_denial_rate', 'fin_clearance_rate', 'pos_collections', 'pos_pct_sp_cash'] },
];

/** Performance vs. Target tabs (the 16 rows do not fit one screen): the group names in each tab. */
export const V1B_ELT_TABS: { id: string; label: string; groups: string[] }[] = [
  { id: 'cash-ar', label: 'Financial, Cash and A/R', groups: ['Financial', 'Cash', 'A/R'] },
  { id: 'billing-denials', label: 'Billing and Denials', groups: ['Billing', 'Denials'] },
  { id: 'mid-access', label: 'Mid-cycle and Patient Access', groups: ['Mid-cycle', 'Patient Access'] },
];

/** ELT KPI cards that open a deep dive. */
export const V1B_DRILL: Record<string, PageId> = {
  npsr: 'cash-ar', cash: 'cash-ar', cash_pct_npsr: 'cash-ar', net_ar_days: 'cash-ar', ar_gt90_pct: 'cash-ar', denial_dollar_rate: 'denials',
};

/** Deep dives: the critical (hero) KPIs at the top, then the other KPIs as small modules. */
export const V1B_VIEWS: Record<'denials' | 'cash-ar' | 'access', { label: string; hero: string[]; modules: string[] }> = {
  denials: { label: 'Denials', hero: ['denial_dollar_rate', 'denial_dollars'], modules: ['denial_wo_pct_npsr', 'front_end_denial_rate', 'coding_denial_rate', 'documentation_denial_rate'] },
  'cash-ar': { label: 'Cash + A/R', hero: ['cash', 'net_ar_days'], modules: ['npsr', 'cash_pct_npsr', 'ar_gt90_pct'] },
  access: { label: 'Patient Access', hero: ['front_end_denial_rate', 'fin_clearance_rate'], modules: ['pos_collections', 'pos_pct_sp_cash'] },
};

export const V1B_PAGES: PageId[] = ['executive', 'denials', 'cash-ar', 'access', 'dictionary'];

// ---------------------------------------------------------------- scope by version

export interface V1Scope {
  eltKpis: string[];
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
    eltKpis: V1B_ELT_KPIS, eltGroups: V1B_ELT_GROUPS, eltTabs: V1B_ELT_TABS, drill: V1B_DRILL, pages: V1B_PAGES, metrics: V1B_METRICS,
    views: (id) => ['ELT Summary', ...Object.values(V1B_VIEWS).filter((v) => [...v.hero, ...v.modules].includes(id)).map((v) => v.label)],
  },
};
