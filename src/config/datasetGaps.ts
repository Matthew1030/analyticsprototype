// Data points the prototype shows that are NOT in the client's current dataset
// (2026_1019_QHC_RCM_Dashboard.xlsx, the data available today). The prototype still shows
// modeled values for them. Each one has an asterisk (*) on every view, and v3+ is its default
// release in the Prioritize tool (a facilitator can still rate it).
//
// Full audit: every catalog metric is either in WORKBOOK_SOURCE (the workbook column or formula
// that fills it) or in METRICS_NOT_IN_DATASET, never both. Checked against the Daily, Weekly and
// Monthly Data tabs. The very hidden dashboard tabs name more items (late charges, CDI queries,
// RQA, retractions, statements, lead time, charts coded), but those rows look up columns the data
// tabs do not have, so they are empty. docs/dataset-gap-check.md gives the reason for each item.

/** Name of the current dataset, for notes and tooltips. */
export const CURRENT_DATASET = 'QHC RCM Dashboard workbook (2026-10-19)';

/** Text of the asterisk legend and tooltip. */
export const GAP_NOTE = `Not in the current dataset (${CURRENT_DATASET}): planned for v3+. The value shown is modeled sample data.`;

/** Workbook column (or formula over workbook columns) for each metric the dataset can fill. */
export const WORKBOOK_SOURCE: Record<string, string> = {
  // Financial
  npsr: 'Net Revenue $',
  gross_charges: 'Gross Revenue $',
  contractual_adj_dollars: 'Contractual Adjustments',
  contractual_adj_pct: 'Contractual Adjustments / Gross Revenue $',
  bad_debt: 'Bad Debt Transfers $',
  bad_debt_pct: 'Bad Debt Transfers % NPSR',
  bad_debt_pct_gross: 'Bad Debt Transfers $ / Gross Revenue $',
  charity: 'Charity Adjustments',
  charity_pct: 'Charity Adjustments / Net Revenue $',
  net_to_gross: 'Net Revenue $ / Gross Revenue $',
  // Patient Access
  pos_pct_net: 'POS Collections (Posted $) / Net Revenue $',
  pos_collections: 'POS Collections (Posted $)',
  front_end_denial_rate: 'Initial Denials: Eligibility + Authorization + Coordination Of Benefits / SSI Payor Claims Sent - Gross Charges $',
  prereg_rate: 'DPA I - 24 hour out completion rate',
  fin_clearance_rate: 'DPA II - 24 hour out completion rate (All Teams)',
  scheduled_rate: 'Scheduled Rate [Scheduled / Ordered Volume]',
  scheduled_volume: 'Total Scheduled Volume',
  orders_received: 'Total Order Volume',
  open_orders: 'Total Orders Not Scheduled ("Open")',
  call_volume: 'Inbound Call Volume',
  calls_outbound: 'Outbound Call Volume',
  call_volume_total: 'Total Call Volume',
  call_abandon_rate: 'Call Abandonment Rate',
  asa: 'Average Speed to Answer',
  medicaid_in_scope: 'Total Self Pay Volume',
  medicaid_screening_rate: 'Total Screening Rate',
  medicaid_eligible_completion: 'Eligible Application Rate (confirm the match with the client)',
  // Cash
  cash: 'Cash Posted $',
  cash_goal: 'Cash goal % (setting) × NPSR with 2 Month Lag',
  cash_pct_npsr: 'Cash Posted % NPSR (2 month lag)',
  patient_cash: 'Cash Posted Self Pay',
  refunds: 'Refunds',
  // A/R
  credit_balance_dollars: 'Total Credit AR',
  credit_balance_days: 'Total Credit AR / (Net Revenue $ per day)',
  gross_ar: 'Total Gross AR $',
  gross_ar_days: 'Gross AR Days',
  net_ar: 'Debit Net AR',
  net_ar_days: 'Debit Net AR Days',
  ar_gt90_pct: 'Billed Ins > 90 % Total Billed Ins',
  ar_gt180_pct: '(181 - 360 + 361+ Days Ins AR and Self Pay AR) / Total Gross AR $',
  // Denials
  denial_dollars: 'Gross Initial Denials $',
  denial_dollar_rate: 'Initial Denials % Gross Revenue',
  denial_writeoffs: 'Denial Write off $',
  denial_wo_pct_npsr: 'Denial Write off $ % NPSR',
  coding_denial_rate: 'Initial Denials: Coding / SSI Payor Claims Sent - Gross Charges $',
  documentation_denial_rate: 'Initial Denials: Lacks Information/Med Records + Medical Necessity / SSI Payor Claims Sent - Gross Charges $',
  // Billing
  clean_claim_rate: 'Clean Claims Rate',
  rework_claims: 'Total Claim − Clean Claim',
  claims_submitted: 'Total Claim',
  claims_submitted_dollars: 'SSI Payor Claims Sent - Gross Charges $',
  dnfb_dollars: 'DNFB Gross Balance ($)',
  dnfb_days: 'DNFB Gross Days',
  dnfb_4plus_pct: 'DNFB % Gross 4+ Days from Discharge',
  dnsp_dollars: 'DNSP Gross Balance ($)',
  dnsp_days: 'DNSP Gross Days',
  // Workbook metrics added to the catalog
  schedule_tat: 'Schedule Turn Around Time',
  open_order_age: 'Average Age Open Orders',
  open_order_days: 'Open Order Days (with Avg # Scheduled/Day, last 2 week avg)',
  deferrals_fin_risk: 'Financial Risk - Deferral Volume',
  deferrals_auth: 'Authorization - Deferral Volume',
  deferrals_referral: 'Referral - Deferral Volume',
  deferrals_total: 'Financial Risk + Authorization + Referral - Deferral Volume',
  prereg_rate_48h: 'DPA I - 48 hour out completion rate',
  prereg_same_day: 'Pre Reg - Completion Rate - Same Day',
  prereg_1day: 'Pre Reg - Completion Rate - 1 Day Out',
  fin_clearance_rate_48h: 'DPA II - 48 hour out completion rate (All Teams)',
  htr_same_day: 'HTR - Completion Rate - Same Day',
  htr_1day: 'HTR - Completion Rate - 1 Day Out',
  sdc_same_day: 'SDC - Completion Rate - Same Day',
  sdc_1day: 'SDC - Completion Rate - 1 Day Out',
  ip_prior_day: 'Inpatient Completion Rate - Prior Day',
  prereg_rs_pct: 'Pre-Reg Closed Accounts in RS Status',
  prereg_wn_pct: 'Pre-Reg Accounts in WN or Blank Status',
  prereg_ob_pct: 'Pre-Reg Accounts in OB/CD Status',
  avg_call_time: 'Avg. Call Time',
  pos_pct_sp_cash: 'POS Collections % Total Self Pay Cash Posted',
  sp_not_screened: 'Not Screened Volume',
  eligible_conversion_rate: 'Eligible Conversion Rate',
  apps_approved: 'Application Approved',
  apps_denied: 'Application Denied',
  apps_pending: 'Application Pending',
  claim_import_dollars: 'Total Claim Import - Gross Charges $',
  claim_import_volume: 'Total Claim Import Volume',
  epars_total: 'ePars Total $ Billed + ePars Total $ Unbilled (DNSP)',
  epars_unbilled: 'ePars Total $ Unbilled (DNSP)',
  epars_7plus: 'ePars Total $ Assigned 7+ Days',
  epars_7plus_count: 'ePars Total # Assigned 7+ Days',
  epars_him: 'ePars Total $ Assigned HIM',
  dnfb_mid_cycle_4plus: 'DNFB Balance 4+ Days Mid Cycle',
  billed_ins_gt360_pct: 'Billed Ins > 360 % Total Billed Ins',
  adgr: 'Average Daily Gross Revenue',
  adnr: 'Net Revenue $ / days (the Average Daily Net Revenue column is empty)',
  admin_adj: 'Admin Adjustments',
  cash_lt90_pct: 'Cash Posted % < 90 Days',
};

/** Catalog metric ids that are not in the current dataset (v3+). */
export const METRICS_NOT_IN_DATASET = new Set<string>([
  // Patient Access
  'eligibility_rate', 'auth_rate', 'preservice_auth_rate', 'registration_accuracy', 'registration_edits',
  'scheduled_rate_final', 'orders_closed_unscheduled', 'open_orders_24h_pct', 'schedule_lead_time', 'lead_time_3plus_pct',
  'prereg_rate_72h', 'fin_clearance_rate_72h', 'scheduled_under_72h_pct', 'coverage_found_rate',
  'pos_rate', 'pos_yield', 'pos_estimate_accuracy', 'pos_missed_residual_pct',
  'call_abandon_rate_all', 'cbo_call_abandon_rate',
  // Mid-cycle: charge capture, coding, CDI
  'charge_lag', 'late_charge_pct', 'late_charges_dollars', 'missing_charges', 'missed_charge_rate', 'charges_posted',
  'coding_tat', 'coding_tat_ip', 'final_coded_volume', 'dnfb_coding', 'cdi_query_rate', 'dnfb_query',
  // Billing
  'first_pass_yield', 'billing_lag', 'dnsp_accounts', 'unbilled_accounts',
  // Denials and appeals
  'denial_rate', 'denied_claims', 'denial_pct_npsr', 'recoverable_pct',
  'appeal_rate', 'appeal_success', 'appeal_upheld_rate', 'appeals_filed', 'appeals_resolved', 'appeals_open',
  'avoidable_wo_pct_net', 'avoidable_wo_unrealized_pct',
  // Cash
  'net_collection_rate', 'service_month_yield', 'payment_variance', 'payment_variance_pct', 'retractions', 'retraction_pct_cash',
  // Financial
  'cost_to_collect', 'bad_debt_unrealized_pct',
]);

export const notInDataset = (metricId?: string | null) => !!metricId && METRICS_NOT_IN_DATASET.has(metricId);

/** " *" after a metric label when the metric is not in the current dataset (for plain-text labels). */
export const gapStar = (metricId?: string | null) => (notInDataset(metricId) ? ' *' : '');

/** Release for the Metric Dictionary: v3+ when the dataset cannot fill the metric. */
export const datasetRelease = (metricId: string) => (notInDataset(metricId) ? 'v3+' : '');

// ---------------------------------------------------------------- dimensions

/**
 * Dimensions the workbook splits metrics by. The workbook is facility-level, so the facility and
 * the groups made from it (region, facility type) work for every metric it holds. Other splits
 * exist only for some metrics; the workbook has no named payers, service lines, root causes, edit
 * categories or account statuses, and no reason × payor or aging × payor combinations.
 */
const FACILITY_DIMS = new Set(['facility', 'region', 'facilityType']);
export const DIMENSION_METRICS: Record<string, string[]> = {
  // Payor group (Medicare, Medicare Managed, Medicaid, Medicaid Managed, Blue Cross, Self Pay, All Other).
  financialClass: ['gross_charges', 'cash', 'patient_cash', 'gross_ar', 'gross_ar_days', 'denial_dollars', 'denial_dollar_rate'],
  // Initial denial reason.
  denialCategory: ['denial_dollars', 'denial_dollar_rate'],
  // Workbook aging buckets.
  arAge: ['gross_ar'],
  dnfbAge: ['dnfb_dollars'],
};

/** Labels of dimensions the workbook never has (for visuals that name their dimensions in the spec). */
export const DIMENSION_LABELS_NOT_IN_DATASET = new Set(['Payer', 'Service line', 'Root cause', 'Edit category', 'Account status', 'Patient type', 'DNFB hold reason']);

/** True when the workbook can split this metric by this dimension. */
export function dimensionInDataset(dim: string, metricId: string): boolean {
  if (notInDataset(metricId)) return false;
  if (FACILITY_DIMS.has(dim)) return true;
  return DIMENSION_METRICS[dim]?.includes(metricId) ?? false;
}

/**
 * Data points that are not single catalog metrics: a breakdown or a view the current dataset
 * cannot fill. The key is the visual title; the value is the data point that is missing.
 */
export const VIEWS_NOT_IN_DATASET: Record<string, string> = {
  'Largest open accounts': 'Account-level data (the workbook is facility-level)',
  'DNFB $ by hold reason': 'DNFB by hold reason (coding / physician query)',
};

/**
 * Client KPI inventory rows (kpiCoverage.ts, by "dashboard|kpi") that are not in the current
 * dataset. Includes KPIs that have no catalog metric yet (coding accuracy, collector QA, deposits).
 */
export const KPIS_NOT_IN_DATASET = new Set<string>([
  'Call Center|Abandonment Rate (all in scope service, inbound calls)',
  'Scheduling|In Process % of Open Inventory >24 hrs',
  'Scheduling|% Scheduled Lead Time 3+ Days',
  'PAC Pre Registration|% of accounts scheduled less than 72 hours of service date',
  'PAC Pre Registration|Pre Registration Finalization Rate - 72 hours out',
  'PAC Collections|Pre Service Collection Yield',
  'PAC Financial Clearance|Financial Clearance Rate - 72 hours out',
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
  'Initial Denials|Primary Denial Volume and Rate on Remits Processed',
  'Initial Denials|Primary Denial Rates (including subsequent)',
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
