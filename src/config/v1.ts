// Release scope (prototype only). The version selector in the prototype bar shows either v1, the
// first release that the development team builds, or the full concept with every planned page.
// This file is the one place that says what v1 holds.

import type { PageId } from '../state/AppState';

export type Version = 'v1' | 'full';

export const VERSION_LABEL: Record<Version, string> = { v1: 'v1', full: 'Full concept' };

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
