// Client KPI inventory (Client_RCM_KPI_Inventory_Normalized.xlsx): every row of the client's sheet,
// in sheet order, mapped to the catalog metrics or the view that answers it. KPIs that need data the
// product does not load yet name the source the client must supply. Shown on Definitions.

export type Coverage = 'Metric' | 'Via filter or view' | 'Proxy' | 'Source needed' | 'KPI not named';

export interface KpiCoverage {
  kpi: string;
  /** Dashboard name on the client's sheet. */
  dashboard: string;
  stage: 'Front End' | 'Mid Cycle' | 'Back End';
  coverage: Coverage;
  /** Catalog metric ids (first = main). */
  metrics: string[];
  /** Where and how a user pulls it. */
  how: string;
  /** Data the client must supply (Proxy and Source needed). */
  source?: string;
}

const FE = 'Front End' as const;
const MC = 'Mid Cycle' as const;
const BE = 'Back End' as const;

export const KPI_COVERAGE: KpiCoverage[] = [
  { kpi: 'Abandonment Rate (all in scope service, inbound calls)', dashboard: 'Call Center', stage: FE, coverage: 'Metric', metrics: ['call_abandon_rate_all', 'call_abandon_rate', 'cbo_call_abandon_rate'], how: 'Patient Access › Contact center. Switch between all lines, patient access line and business office line.', source: 'By team and user: agent-level call statistics from the contact center platform.' },
  { kpi: 'Total Call Volume (inbound + outbound)', dashboard: 'Call Center', stage: FE, coverage: 'Metric', metrics: ['call_volume_total', 'call_volume', 'calls_outbound'], how: 'Patient Access › Contact center.' },
  { kpi: 'In Process % of Open Inventory >24 hrs', dashboard: 'Scheduling', stage: FE, coverage: 'Metric', metrics: ['open_orders_24h_pct'], how: 'Patient Access › Scheduling.' },
  { kpi: 'Scheduled Rate', dashboard: 'Scheduling', stage: FE, coverage: 'Metric', metrics: ['scheduled_rate_final', 'scheduled_rate'], how: 'Patient Access › Scheduling. The final-outcome rate leaves out orders in process, duplicates and orders already scheduled; "Orders closed without scheduling" shows each outcome.' },
  { kpi: 'Open Inventory to be Scheduled Volume', dashboard: 'Scheduling', stage: FE, coverage: 'Metric', metrics: ['open_orders'], how: 'Patient Access › Scheduling.' },
  { kpi: '% Scheduled Lead Time 3+ Days', dashboard: 'Scheduling', stage: FE, coverage: 'Metric', metrics: ['lead_time_3plus_pct', 'schedule_lead_time'], how: 'Patient Access › Scheduling (switch % and average days).' },
  { kpi: 'Pre Registration Finalization Rate - 72 hours out', dashboard: 'PAC Pre Registration', stage: FE, coverage: 'Metric', metrics: ['prereg_rate_72h', 'prereg_rate'], how: 'Patient Access › Pre-registration and financial clearance.' },
  { kpi: '% of accounts scheduled less than 72 hours of service date', dashboard: 'PAC Pre Registration', stage: FE, coverage: 'Metric', metrics: ['scheduled_under_72h_pct'], how: 'Patient Access › Pre-registration and financial clearance.' },
  { kpi: 'Pre Service Collection Yield', dashboard: 'PAC Collections', stage: FE, coverage: 'Source needed', metrics: ['pos_yield'], how: 'Nearest today: POS yield vs estimate (Patient Access › Point-of-service collections).', source: 'Pre-service payments and the estimated / called opportunity per account (estimating tool, patient accounting).' },
  { kpi: 'Financial Clearance Rate - 72 hours out', dashboard: 'PAC Financial Clearance', stage: FE, coverage: 'Metric', metrics: ['fin_clearance_rate_72h', 'fin_clearance_rate'], how: 'Patient Access › Pre-registration and financial clearance.' },
  { kpi: '% of accounts scheduled less than 72 hours of service date', dashboard: 'PAC Financial Clearance', stage: FE, coverage: 'Metric', metrics: ['scheduled_under_72h_pct'], how: 'Same metric as for pre-registration.' },
  { kpi: 'Deferrals - Auth, Fin Risk', dashboard: 'PAC to Facility Notifications', stage: FE, coverage: 'Source needed', metrics: [], how: 'Marked as a worklist KPI on the sheet: candidate for the v2 worklists.', source: 'PAC-to-facility notification log: deferral type (authorization, financial risk), reason, date, facility.' },
  { kpi: 'RQA Edit Volume', dashboard: 'Registration Quality Tools', stage: FE, coverage: 'Proxy', metrics: ['registration_edits', 'registration_accuracy'], how: 'Patient Access › Registration quality. Claim registration edits stand in for RQA edits.', source: 'Registration quality (RQA) edit log.' },
  { kpi: 'RQA Edit 48-Hour Correction Rate', dashboard: 'Registration Quality Tools', stage: FE, coverage: 'Source needed', metrics: [], how: '', source: 'RQA edit log with created and corrected timestamps and an automated / manual flag.' },
  { kpi: 'POS Collections $', dashboard: 'POS Collections', stage: FE, coverage: 'Metric', metrics: ['pos_collections'], how: 'Patient Access › Point-of-service collections.' },
  { kpi: 'POS Collections Yield', dashboard: 'POS Collections', stage: FE, coverage: 'Metric', metrics: ['pos_yield', 'pos_rate'], how: 'Patient Access › Point-of-service collections.' },
  { kpi: 'POS Estimate Accuracy %', dashboard: 'POS Collections', stage: FE, coverage: 'Metric', metrics: ['pos_estimate_accuracy'], how: 'Patient Access › Point-of-service collections. Draft rule: estimate within 10% of the final liability.' },
  { kpi: 'Missed Opportunity - Known POS Residual %', dashboard: 'POS Collections', stage: FE, coverage: 'Metric', metrics: ['pos_missed_residual_pct'], how: 'Patient Access › Point-of-service collections (switch on "POS yield by hospital").' },
  { kpi: 'Total In Scope Volume', dashboard: 'Medicaid Eligibility and Enrollment', stage: FE, coverage: 'Metric', metrics: ['medicaid_in_scope'], how: 'Patient Access › Eligibility and enrollment. Confirm "in scope" = emergent uninsured.' },
  { kpi: 'Screening Rate (excluding efforts exhausted)', dashboard: 'Medicaid Eligibility and Enrollment', stage: FE, coverage: 'Metric', metrics: ['medicaid_screening_rate'], how: 'Patient Access › Eligibility and enrollment.' },
  { kpi: 'Eligible Completion Rate', dashboard: 'Medicaid Eligibility and Enrollment', stage: FE, coverage: 'Metric', metrics: ['medicaid_eligible_completion'], how: 'Patient Access › Eligibility and enrollment.' },
  { kpi: 'Average Turnaround Time to Code (from Discharge)', dashboard: 'Final Coded Stats', stage: MC, coverage: 'Metric', metrics: ['coding_tat', 'coding_tat_ip'], how: 'Mid-Cycle › "Coding turnaround by type", or the patient type filter.' },
  { kpi: 'Final Coded Account Volume', dashboard: 'Final Coded Stats', stage: MC, coverage: 'Metric', metrics: ['final_coded_volume'], how: 'Mid-Cycle › "Final coded accounts" (by type, hospital or service line).', source: 'Coding productivity by coder: coder-level coding activity.' },
  { kpi: 'Discharged Unbilled (Gross $ and Days) - ELT KPI', dashboard: 'Discharged Unbilled (EHR)', stage: MC, coverage: 'Metric', metrics: ['dnfb_dollars', 'dnfb_days'], how: 'Billing / DNFB. Scrubber edit share: hold reason "Billing edit hold" and the billed-not-exported view.' },
  { kpi: 'Coding Accuracy Rate', dashboard: 'Coding QA', stage: MC, coverage: 'Source needed', metrics: ['coding_denial_rate'], how: 'Nearest today: coding denial rate.', source: 'Coding QA audit results (accounts audited, accounts with a coding change).' },
  { kpi: 'Late Charges % of Total Charges', dashboard: 'Revenue and Usage', stage: MC, coverage: 'Metric', metrics: ['late_charge_pct'], how: 'Mid-Cycle.' },
  { kpi: 'Late Charges', dashboard: 'Revenue and Usage', stage: MC, coverage: 'Metric', metrics: ['late_charges_dollars'], how: 'Mid-Cycle › switch $ / % on late charge visuals.' },
  { kpi: 'Charge Accuracy', dashboard: 'Revenue and Usage', stage: MC, coverage: 'Source needed', metrics: [], how: '', source: 'Charge audit results (charges reviewed, charges in error).' },
  { kpi: 'Charge Correction', dashboard: 'Revenue and Usage', stage: MC, coverage: 'Source needed', metrics: [], how: '', source: 'Charge correction transactions (credits and rebills, CDM mapping corrections).' },
  { kpi: 'Missed Charge Rate', dashboard: 'Revenue and Usage', stage: MC, coverage: 'Metric', metrics: ['missed_charge_rate', 'missing_charges'], how: 'Mid-Cycle › "Missed charge rate by hospital" (switch % / $).' },
  { kpi: 'Scrubber to Payor Exports (# and Gross $)', dashboard: 'Claim Volume', stage: BE, coverage: 'Metric', metrics: ['claims_submitted_dollars', 'claims_submitted'], how: 'Billing / DNFB › "Submitted $ by hospital" (switch $ / #).' },
  { kpi: 'Billed Claims with No Exports / Open Edits', dashboard: 'Claim Volume', stage: BE, coverage: 'Metric', metrics: ['dnsp_accounts', 'dnsp_dollars'], how: 'Billing / DNFB › "DNSP $ by hospital".' },
  { kpi: 'Clean Claim Rate', dashboard: 'Clean Claim Rate', stage: BE, coverage: 'Metric', metrics: ['clean_claim_rate'], how: 'Billing / DNFB.' },
  { kpi: 'Discharged Unbilled (Gross $ and Days) - includes scrubber edits', dashboard: 'Unbilled Scrubber Edits', stage: BE, coverage: 'Metric', metrics: ['dnfb_dollars', 'dnfb_days', 'dnsp_dollars'], how: 'Billing / DNFB.' },
  { kpi: '% of claims accepted, processed, and paid on first submission', dashboard: 'First Pass Yield', stage: BE, coverage: 'Proxy', metrics: ['first_pass_yield'], how: 'Billing / DNFB › "First pass yield". "No scrubber edit" stands in for "no 277 rejection".', source: 'Clearinghouse 277 claim status (rejections).' },
  { kpi: 'AR Aging >90%', dashboard: 'Open ATB', stage: BE, coverage: 'Metric', metrics: ['ar_gt90_pct'], how: 'A/R.' },
  { kpi: 'Debit / Credit Balance $', dashboard: 'Open ATB', stage: BE, coverage: 'Metric', metrics: ['credit_balance_dollars', 'gross_ar'], how: 'A/R › "Credit balances $ by payer" (switch $ / days). Debit balances = gross A/R.' },
  { kpi: 'Total Balance $', dashboard: 'Open ATB', stage: BE, coverage: 'Metric', metrics: ['gross_ar', 'net_ar'], how: 'A/R.' },
  { kpi: 'Self Pay vs. Insurance', dashboard: 'Open ATB', stage: BE, coverage: 'Via filter or view', metrics: ['gross_ar', 'net_ar'], how: 'A/R › "A/R by financial class", or the financial class filter.' },
  { kpi: 'Unapplied PT Holding Accounts', dashboard: 'Open ATB', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'Unapplied cash and holding-account balances from patient accounting.' },
  { kpi: 'BD Transfers $', dashboard: 'Non Charge Txns', stage: BE, coverage: 'Metric', metrics: ['bad_debt'], how: 'Cash › "Non-charge transactions".' },
  { kpi: 'Denial Write-offs $', dashboard: 'Non Charge Txns', stage: BE, coverage: 'Metric', metrics: ['denial_writeoffs'], how: 'Cash › "Non-charge transactions"; Denials.' },
  { kpi: 'Refunds $', dashboard: 'Non Charge Txns', stage: BE, coverage: 'Metric', metrics: ['refunds'], how: 'Cash. Prototype models refunds from credit balances; production reads refund transactions.' },
  { kpi: 'Charity $', dashboard: 'Non Charge Txns', stage: BE, coverage: 'Metric', metrics: ['charity'], how: 'Cash › "Non-charge transactions".' },
  { kpi: 'All Other Contractual $', dashboard: 'Non Charge Txns', stage: BE, coverage: 'Metric', metrics: ['contractual_adj_dollars', 'contractual_adj_pct'], how: 'Cash › "Contractual adj. $ by financial class" (switch $ / %).' },
  { kpi: 'Cash Posted $', dashboard: 'Total Cash Posted', stage: BE, coverage: 'Metric', metrics: ['cash'], how: 'Cash.' },
  { kpi: 'Insurance Retractions $', dashboard: 'Total Cash Posted', stage: BE, coverage: 'Metric', metrics: ['retractions'], how: 'Cash › "Insurance retractions by payer".' },
  { kpi: 'Insurance Retractions % of Total Cash', dashboard: 'Total Cash Posted', stage: BE, coverage: 'Metric', metrics: ['retraction_pct_cash'], how: 'Cash › "Insurance retractions by payer" (switch to %).' },
  { kpi: 'LTD Payments / (Charges - Adjustments) for one month of service dates', dashboard: 'Net Revenue', stage: BE, coverage: 'Metric', metrics: ['service_month_yield', 'net_collection_rate'], how: 'Cash › "Life-to-date yield by service month". Select a single month as the period.' },
  { kpi: 'PRN (CBO tasks)', dashboard: 'CBO Tasks', stage: BE, coverage: 'KPI not named', metrics: [], how: 'Task view: the Worklists (Denials, A/R follow-up, DNFB). Ask the client which KPI they want.' },
  { kpi: 'Underpayments Success Rate ($)', dashboard: 'Variance Reporting', stage: BE, coverage: 'Source needed', metrics: ['payment_variance'], how: 'Nearest today: payment variance (identifies underpayments) on Payers.', source: 'Variance follow-up records: underpayment identified, disputed and recovered.' },
  { kpi: 'Underpayments Success Rate (Volume)', dashboard: 'Variance Reporting', stage: BE, coverage: 'Source needed', metrics: ['payment_variance_pct'], how: 'Nearest today: payment variance % on Payers.', source: 'Variance follow-up records: underpayment identified, disputed and recovered.' },
  { kpi: 'Insurance No Touch Rate', dashboard: 'AR Work Queues Reporting', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'A/R work queue activity log (touches per account, assignment, past-due status).' },
  { kpi: 'n/a (Collector Productivity)', dashboard: 'Collector Productivity', stage: BE, coverage: 'KPI not named', metrics: [], how: 'Ask the client which KPI they want.', source: 'Collector activity data.' },
  { kpi: 'Collector QA Scores', dashboard: 'Collector QA Scores', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'Collector QA audit results.' },
  { kpi: 'Primary Denial Volume and Rate on Remits Processed', dashboard: 'Initial Denials', stage: BE, coverage: 'Proxy', metrics: ['denied_claims', 'denial_rate'], how: 'Denials. Claim-level today; the sheet counts $0 payments at charge level.', source: '835 remittance lines at charge level.' },
  { kpi: 'Initial Denial $ and Rate', dashboard: 'Initial Denials', stage: BE, coverage: 'Metric', metrics: ['denial_dollars', 'denial_dollar_rate'], how: 'Denials.' },
  { kpi: 'Primary Denial Rates (including subsequent)', dashboard: 'Initial Denials', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: '835 remittance history with the denial sequence (initial and subsequent).' },
  { kpi: 'Denial Write-off $', dashboard: 'Denial Write-offs', stage: BE, coverage: 'Metric', metrics: ['denial_writeoffs'], how: 'Denials. By reason and age: root cause and category filters.' },
  { kpi: 'Denial Write-off % NPSR', dashboard: 'Denial Write-offs', stage: BE, coverage: 'Metric', metrics: ['denial_wo_pct_npsr'], how: 'Denials.' },
  { kpi: 'PRN (Pending write-offs, insurance)', dashboard: 'Pending Write-offs (Insurance)', stage: BE, coverage: 'Via filter or view', metrics: ['gross_ar'], how: 'A/R › "A/R by account status" (Denied, rework; Pended). Ask the client which KPI they want.' },
  { kpi: 'Statement Volume', dashboard: 'Pending Write-offs (Self Pay)', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'Patient statement file (statements sent per account).' },
  { kpi: 'LTD Self Pay Placement Yield', dashboard: 'Pending Write-offs (Self Pay)', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'Collection agency placements and recoveries.' },
  { kpi: 'PRN (Bad debt transfer reporting)', dashboard: 'Bad Debt Transfer Reporting', stage: BE, coverage: 'Via filter or view', metrics: ['bad_debt'], how: 'Cash › "Non-charge transactions". Ask the client which KPI they want.' },
  { kpi: 'Total Deposits', dashboard: 'Deposit Reporting', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'Bank deposit / lockbox file.' },
  { kpi: 'NPC $', dashboard: 'Deposit Reporting', stage: BE, coverage: 'Source needed', metrics: [], how: 'Ask the client what NPC stands for.', source: 'Bank deposit / lockbox file.' },
  { kpi: 'PT Cash $', dashboard: 'Deposit Reporting', stage: BE, coverage: 'Proxy', metrics: ['patient_cash'], how: 'Cash. Self-pay and POS cash today.', source: 'Payment source on each payment, to add patient payments on insured accounts.' },
  { kpi: '% of Cash Posted within 48 Hours', dashboard: 'Speed to Post Deposits', stage: BE, coverage: 'Source needed', metrics: [], how: '', source: 'Deposit date per payment (bank file) next to the posting date.' },
  { kpi: 'Total Volume (New + Closed + Open)', dashboard: 'Clinical Appeals', stage: BE, coverage: 'Metric', metrics: ['appeals_filed', 'appeals_resolved', 'appeals_open'], how: 'Denials › appeals. Clinical: filter denial category to Medical necessity and Documentation.' },
  { kpi: 'Appeal Rate', dashboard: 'Clinical Appeals', stage: BE, coverage: 'Metric', metrics: ['appeal_rate'], how: 'Denials (clinical: denial category filter).' },
  { kpi: 'Adjudicated Overturn Rate', dashboard: 'Clinical Appeals', stage: BE, coverage: 'Metric', metrics: ['appeal_success'], how: 'Denials › "Appeal outcome by denial category".' },
  { kpi: 'Upheld Rate', dashboard: 'Clinical Appeals', stage: BE, coverage: 'Metric', metrics: ['appeal_upheld_rate'], how: 'Denials › "Appeal outcome by denial category".' },
  { kpi: 'Status (to be reviewed / reviewed to be appealed / 1st appeal / etc.)', dashboard: 'Clinical Appeals', stage: BE, coverage: 'Via filter or view', metrics: ['appeals_open'], how: 'Denials › "Denial and appeal status".' },
];
