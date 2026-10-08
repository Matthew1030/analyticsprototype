// Response contracts between the UI and the analytics data service.
//
// The prototype fills these shapes in the browser from synthetic data (src/services/analytics.ts).
// The production build should return the same shapes from an API, for example:
//   GET /api/metrics/{metric_id}?period=2026-09&period_type=month&compare=prior&facility=0,2
//   GET /api/metrics/{metric_id}/trend?months=18&...
//   GET /api/metrics/{metric_id}/breakdown?dimension=payer&...
//   GET /api/accounts?snapshot=2026-09-30&aging_bucket=4&payer=1&sort=-balance&limit=50
// Field names below use snake_case so they map 1:1 to a JSON payload.

import type { RcmArea, Unit, Direction } from '../engine/metrics';
import type { Status, Change } from '../engine/status';

/** The filter context sent with every request. Keys are dimension member ids. */
export interface FilterContext {
  period_type: 'month' | 'quarter' | 'ytd' | 'r12';
  period_end: string; // 'YYYY-MM'
  compare: 'prior' | 'py';
  filters: Partial<Record<DimensionId, number[]>>;
}

export type DimensionId =
  | 'facility' | 'region' | 'facilityType' | 'payer' | 'financialClass' | 'serviceLine' | 'patientType'
  | 'denialCategory' | 'rootCause' | 'editCategory' | 'dnfbHold' | 'arAge' | 'accountStatus';

/** One metric value in a filter context: the KPI card / scorecard row payload. */
export interface MetricValue {
  metric: string;
  name: string;
  rcm_area: RcmArea;
  unit: Unit;
  direction: Direction;
  period: string; // label, e.g. 'Sep 2026'
  value: number | null;
  compare_period: string;
  compare_value: number | null;
  change: number | null; // value − compare_value (rate metrics: in rate units, not %)
  change_kind: Change;
  prior_year_value: number | null;
  target: number | null;
  watch_threshold: number | null;
  variance_to_target: number | null; // value − target
  status: Status;
  trend: TrendPoint[];
  no_data_reason?: string;
}

export interface TrendPoint {
  period: string; // 'YYYY-MM'
  label: string; // 'Sep 26'
  value: number | null;
  target: number | null;
  prior_year: number | null;
  rolling_3: number | null;
}

/** One member of a breakdown (by hospital, payer, aging bucket, ...). */
export interface BreakdownRow {
  key: number;
  label: string;
  value: number | null;
  compare_value: number | null;
  change: number | null;
  target: number | null;
  status: Status;
  /** Share of the total (additive metrics only). */
  share: number | null;
  /** Contribution of this member to the total change (additive metrics only). */
  contribution: number | null;
}

/** An open or historical account: the account drill-through row. No patient identifiers. */
export interface AccountRow {
  account_id: string;
  facility: string;
  payer: string;
  financial_class: string;
  service_line: string;
  discharge_date: string;
  days_since_discharge: number;
  gross_charges: number;
  balance: number;
  status: string;
  denial_root_cause: string | null;
  last_activity: string;
}

/** Data freshness for the header and the definitions page. */
export interface DataFreshness {
  last_refreshed_utc: string;
  data_through: string;
  reporting_period: string;
  period_status: 'Closed' | 'Preliminary';
  sources: { name: string; feeds: string; cadence: string; status: 'Current' | 'Delayed' | 'Failed'; last_load: string }[];
}
