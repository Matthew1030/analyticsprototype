// Data points the prototype shows that are NOT in the client's current dataset
// (2026_1019_QHC_RCM_Dashboard.xlsx, the data available today). The prototype still shows
// modeled values for them. Each one is marked with an asterisk (*) on every view.
// Source of the list: the client's comparison of the prototype against that workbook, checked
// column by column against its Daily, Weekly and Monthly Data tabs. The very hidden dashboard tabs
// also name some of these items (late charges, CDI queries, RQA, retractions, statements, lead
// time, charts coded); those rows look up columns the data tabs do not have, so they are empty.
// Not marked, because the data tabs can calculate them: POS cash % net revenue, front-end, coding
// and documentation denial rates (denials by reason / claims sent gross $), net to gross, bad debt
// % gross revenue, cash goal (from net revenue), A/R > 180 days and the self-pay vs insurance split
// (insurance and self-pay A/R aging buckets), and claims failing edits (total claims − clean claims).

/** Name of the current dataset, for notes and tooltips. */
export const CURRENT_DATASET = 'QHC RCM Dashboard workbook (2026-10-19)';

/** Text of the asterisk legend and tooltip. */
export const GAP_NOTE = `Not in the current dataset (${CURRENT_DATASET}). The value shown is modeled sample data.`;

/** Catalog metric ids that are not in the current dataset. */
export const METRICS_NOT_IN_DATASET = new Set<string>([
  // Patient Access
  'pos_rate', 'pos_yield', 'pos_estimate_accuracy', 'pos_missed_residual_pct',
  'open_orders_24h_pct', 'schedule_lead_time', 'lead_time_3plus_pct', 'scheduled_under_72h_pct',
  'registration_accuracy', 'registration_edits', 'eligibility_rate', 'auth_rate',
  'orders_closed_unscheduled', 'coverage_found_rate',
  // Mid-cycle: coding, CDI, charge capture
  'coding_tat', 'coding_tat_ip', 'final_coded_volume', 'dnfb_coding',
  'cdi_query_rate', 'dnfb_query',
  'late_charges_dollars', 'late_charge_pct', 'charge_lag', 'missed_charge_rate', 'missing_charges',
  // Billing
  'first_pass_yield', 'billing_lag',
  // Denials and appeals
  'appeals_filed', 'appeals_resolved', 'appeals_open', 'appeal_rate', 'appeal_success', 'appeal_upheld_rate',
  'denial_pct_npsr', 'recoverable_pct', 'avoidable_wo_pct_net', 'avoidable_wo_unrealized_pct',
  // Cash
  'net_collection_rate', 'service_month_yield', 'retractions', 'retraction_pct_cash',
  'payment_variance', 'payment_variance_pct',
  // Financial
  'cost_to_collect', 'bad_debt_unrealized_pct',
]);

export const notInDataset = (metricId?: string | null) => !!metricId && METRICS_NOT_IN_DATASET.has(metricId);

/** " *" after a metric label when the metric is not in the current dataset (for plain-text labels). */
export const gapStar = (metricId?: string | null) => (notInDataset(metricId) ? ' *' : '');

/**
 * Data points that are not single catalog metrics: a breakdown or a view the current dataset
 * cannot fill. The key is the visual title; the value is the data point that is missing.
 */
export const VIEWS_NOT_IN_DATASET: Record<string, string> = {
  'DNFB $ by hold reason': 'DNFB by hold reason (coding / physician query)',
  'DNFB held by mid-cycle reasons': 'DNFB by hold reason (coding / physician query)',
};

/**
 * Client KPI inventory rows (kpiCoverage.ts, by "dashboard|kpi") that are not in the current
 * dataset. Includes KPIs that have no catalog metric yet (coding accuracy, collector QA, deposits).
 */
export const KPIS_NOT_IN_DATASET = new Set<string>([
  'Scheduling|In Process % of Open Inventory >24 hrs',
  'Scheduling|% Scheduled Lead Time 3+ Days',
  'PAC Pre Registration|% of accounts scheduled less than 72 hours of service date',
  'PAC Collections|Pre Service Collection Yield',
  'PAC Financial Clearance|% of accounts scheduled less than 72 hours of service date',
  'Registration Quality Tools|RQA Edit Volume',
  'Registration Quality Tools|RQA Edit 48-Hour Correction Rate',
  'POS Collections|POS Collections Yield',
  'POS Collections|POS Estimate Accuracy %',
  'POS Collections|Missed Opportunity - Known POS Residual %',
  'Final Coded Stats|Average Turnaround Time to Code (from Discharge)',
  'Final Coded Stats|Final Coded Account Volume',
  'Coding QA|Coding Accuracy Rate',
  'Revenue and Usage|Late Charges % of Total Charges',
  'Revenue and Usage|Late Charges',
  'Revenue and Usage|Charge Accuracy',
  'Revenue and Usage|Charge Correction',
  'Revenue and Usage|Missed Charge Rate',
  'First Pass Yield|% of claims accepted, processed, and paid on first submission',
  'Open ATB|Unapplied PT Holding Accounts',
  'Total Cash Posted|Insurance Retractions $',
  'Total Cash Posted|Insurance Retractions % of Total Cash',
  'Net Revenue|LTD Payments / (Charges - Adjustments) for one month of service dates',
  'CBO Tasks|PRN (CBO tasks)',
  'Variance Reporting|Underpayments Success Rate ($)',
  'Variance Reporting|Underpayments Success Rate (Volume)',
  'AR Work Queues Reporting|Insurance No Touch Rate',
  'Collector Productivity|n/a (Collector Productivity)',
  'Collector QA Scores|Collector QA Scores',
  'Pending Write-offs (Insurance)|PRN (Pending write-offs, insurance)',
  'Pending Write-offs (Self Pay)|Statement Volume',
  'Pending Write-offs (Self Pay)|LTD Self Pay Placement Yield',
  'Bad Debt Transfer Reporting|PRN (Bad debt transfer reporting)',
  'Deposit Reporting|Total Deposits',
  'Deposit Reporting|NPC $',
  'Speed to Post Deposits|% of Cash Posted within 48 Hours',
  'Clinical Appeals|Total Volume (New + Closed + Open)',
  'Clinical Appeals|Appeal Rate',
  'Clinical Appeals|Adjudicated Overturn Rate',
  'Clinical Appeals|Upheld Rate',
  'Clinical Appeals|Status (to be reviewed / reviewed to be appealed / 1st appeal / etc.)',
]);

export const kpiNotInDataset = (dashboard: string, kpi: string) => KPIS_NOT_IN_DATASET.has(`${dashboard}|${kpi}`);
