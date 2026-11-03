# Dataset gap check

Every catalog metric, checked against the workbook `2026_1019_QHC_RCM_Dashboard.xlsx` (the data
available today). The check covers the column headers and filled cells of the Daily Data,
Weekly Data and Monthly Data tabs, the Metric Listing tab and the Notes tab.

- **Yes**: the workbook holds the metric, or the metric can be calculated from workbook columns.
  The "Workbook source" column names them.
- **No \***: the workbook does not hold it. The prototype shows modeled sample data, marks it with
  an asterisk, and gives it **v3+** as its default release in the Prioritize tool. A facilitator
  can still rate it.

The list is in `src/config/datasetGaps.ts`. `tests/datasetGaps.test.ts` checks that every catalog
metric is in exactly one of the two lists.

## Notes on the workbook

- **Grain:** facility × day / week / month. There are no named payers, service lines, patient types,
  root causes, edit categories or account statuses, and no account-level data, so breakdowns and
  worklists that need them are also marked.
- **Splits the workbook has:** payor group (denials, A/R, revenue, cash), initial denial reason,
  denial write-off reason, aging buckets (DNFB, DNSP, A/R, cash, write-offs, bad debt), DNFB owner,
  POS service type and ePars owner. It has no reason × payor or aging × payor combinations.
- **Empty columns:** Net AR Days, Avg. Hold Time, PAC Handle Ratio, PAC Dequeued Ratio and Average
  Daily Net Revenue have no values. The prototype uses Debit Net AR Days and Net Revenue $ instead.
- **Very hidden tabs** (Full Dashboard, Quorum with Notes, Weekly Cash Metrics): they name late
  charges, CDI queries, RQA, retractions, statements, lead time, charts coded, coder holds,
  utilization review and task reporting. Those rows look up columns the data tabs do not have, so
  they are empty. Weekly Cash Metrics shows only `#REF!` errors.

## Metrics changed to the workbook definition

| Metric | Now means (workbook) |
|---|---|
| Pre-registration rate | DPA I - 24 hour out completion rate |
| Financial clearance rate | DPA II - 24 hour out completion rate (All Teams) |
| Total call volume | Total Call Volume (patient access line only) |
| Net A/R, Net A/R days | Debit Net AR, Debit Net AR Days |
| A/R > 90 days | Billed Ins > 90 % Total Billed Ins (insurance only) |
| Initial denials % of gross revenue (was "Initial denial rate (claim dollars)") | Initial Denials % Gross Revenue |
| Cash as % of net revenue, Cash goal | Cash Posted % NPSR (2 month lag) |
| Uninsured accounts in scope | Total Self Pay Volume |
| Medicaid eligible completion rate | Eligible Application Rate. **Confirm this match with the client.** |

## Proxies that need a decision (kept as v3+)

| Metric | Nearest workbook column | Gap |
|---|---|---|
| Avoidable write-offs % of net revenue | Denial Write off $ % NPSR | Only denial write-offs; no recoveries |
| Denials as % of NPSR | Gross Initial Denials $ and Net Revenue $ | Gross denied $, not expected net on denied claims |
| Average scheduling lead time | Schedule Turn Around Time | Probably order-to-scheduled time, not scheduled-to-service time |
| Coverage discovery rate | Screened - Eligible, Total Screening Rate | Medicaid eligibility only |
| Authorization rate | Authorization - Deferral Volume / Outcome | Deferrals only |
| Eligibility verification rate | Accounts Booked with Invalid Insurance | A count, not a rate |
| POS collection rate | POS Collections % Total Self Pay Cash Posted | Denominator is self-pay cash, not expected liability |
| Open orders > 24 hours | Average Age Open Orders, Open Order Days | Average age, not a share over 24 hours |
| DNFB by hold reason | DNFB Balance by owner (Front End, Mid Cycle, Back End, Other) | By owner, not by hold reason |
| CBO tasks | ePars ("R1 Assigned Tasks") | Confirm if ePars are the CBO tasks |

## Every catalog metric

Metrics PA-38 to PA-63, BL-14 to BL-21, AR-09, FN-13 to FN-15 and CA-12 are workbook metrics added to the catalog.

| Code | Metric | In dataset | Release | Workbook source |
|---|---|---|---|---|
| AR-01 | Net days in credit balance | Yes |  | Total Credit AR / (Net Revenue $ per day) |
| AR-02 | Credit balances ($) | Yes |  | Total Credit AR |
| AR-03 | Gross A/R | Yes |  | Total Gross AR $ |
| AR-04 | Net A/R | Yes |  | Debit Net AR |
| AR-05 | Net A/R days | Yes |  | Debit Net AR Days |
| AR-06 | Gross A/R days | Yes |  | Gross AR Days |
| AR-07 | A/R > 90 days | Yes |  | Billed Ins > 90 % Total Billed Ins |
| AR-08 | A/R > 180 days | Yes |  | (181 - 360 + 361+ Days Ins AR and Self Pay AR) / Total Gross AR $ |
| AR-09 | Billed insurance A/R > 360 days | Yes |  | Billed Ins > 360 % Total Billed Ins |
| BL-01 | Clean claim rate | Yes |  | Clean Claims Rate |
| BL-02 | Claims failing edits | Yes |  | Total Claim − Clean Claim |
| BL-03 | Claims submitted | Yes |  | Total Claim |
| BL-04 | Claims submitted ($) | Yes |  | SSI Payor Claims Sent - Gross Charges $ |
| BL-05 | First pass yield | No * | v3+ |  |
| BL-06 | Billing lag (final bill to submit) | No * | v3+ |  |
| BL-07 | DNFB | Yes |  | DNFB Gross Balance ($) |
| BL-08 | Days in DNFB | Yes |  | DNFB Gross Days |
| BL-09 | Billed not submitted days | Yes |  | DNSP Gross Days |
| BL-10 | Billed not submitted ($) | Yes |  | DNSP Gross Balance ($) |
| BL-11 | Billed claims not submitted | No * | v3+ |  |
| BL-12 | Unbilled accounts (DNFB) | No * | v3+ |  |
| BL-13 | DNFB % gross 4+ days from discharge | Yes |  | DNFB % Gross 4+ Days from Discharge |
| BL-14 | Claims imported to the scrubber ($) | Yes |  | Total Claim Import - Gross Charges $ |
| BL-15 | Claims imported to the scrubber | Yes |  | Total Claim Import Volume |
| BL-16 | ePars open task dollars | Yes |  | ePars Total $ Billed + ePars Total $ Unbilled (DNSP) |
| BL-17 | ePars dollars unbilled (DNSP) | Yes |  | ePars Total $ Unbilled (DNSP) |
| BL-18 | ePars dollars assigned 7+ days | Yes |  | ePars Total $ Assigned 7+ Days |
| BL-19 | ePars tasks assigned 7+ days | Yes |  | ePars Total # Assigned 7+ Days |
| BL-20 | ePars dollars assigned to HIM | Yes |  | ePars Total $ Assigned HIM |
| BL-21 | DNFB 4+ days, Mid Cycle owner | Yes |  | DNFB Balance 4+ Days Mid Cycle |
| CA-01 | Cash collections | Yes |  | Cash Posted $ |
| CA-02 | Cash goal | Yes |  | Cash goal % (setting) × NPSR with 2 Month Lag |
| CA-03 | Cash as % of net revenue | Yes |  | Cash Posted % NPSR (2 month lag) |
| CA-04 | Net collection rate | No * | v3+ |  |
| CA-05 | Payment variance | No * | v3+ |  |
| CA-06 | Payment variance % | No * | v3+ |  |
| CA-07 | Patient cash (self-pay) | Yes |  | Cash Posted Self Pay |
| CA-08 | Refunds | Yes |  | Refunds |
| CA-09 | Insurance retractions | No * | v3+ |  |
| CA-10 | Insurance retractions % of total cash | No * | v3+ |  |
| CA-11 | Life-to-date yield by service month | No * | v3+ |  |
| CA-12 | Cash posted % < 90 days from discharge | Yes |  | Cash Posted % < 90 Days |
| CC-01 | Charge lag | No * | v3+ |  |
| CC-02 | Late charges | No * | v3+ |  |
| CC-03 | Missing charges recovered | No * | v3+ |  |
| CC-04 | Late charges ($) | No * | v3+ |  |
| CC-05 | Missed charge rate | No * | v3+ |  |
| CC-06 | Charges posted | No * | v3+ |  |
| CD-01 | CDI query rate | No * | v3+ |  |
| CD-02 | Documentation-related denial rate | Yes |  | Initial Denials: Lacks Information/Med Records + Medical Necessity / SSI Payor Claims Sent - Gross Charges $ |
| CD-03 | DNFB on physician query | No * | v3+ |  |
| CO-01 | Coding turnaround | No * | v3+ |  |
| CO-02 | Coding turnaround, inpatient | No * | v3+ |  |
| CO-03 | Final coded accounts | No * | v3+ |  |
| CO-04 | Coding denial rate | Yes |  | Initial Denials: Coding / SSI Payor Claims Sent - Gross Charges $ |
| CO-05 | DNFB awaiting coding | No * | v3+ |  |
| DN-01 | Avoidable write-offs as % of net revenue | No * | v3+ |  |
| DN-02 | Avoidable write-offs incl. unrealized as % of net revenue | No * | v3+ |  |
| DN-03 | Initial denial rate | No * | v3+ |  |
| DN-04 | Initial denials % of gross revenue | Yes |  | Initial Denials % Gross Revenue |
| DN-05 | Initial denials ($) | Yes |  | Gross Initial Denials $ |
| DN-06 | Denied claims | No * | v3+ |  |
| DN-07 | Denials as % of NPSR | No * | v3+ |  |
| DN-08 | Recoverable denials | No * | v3+ |  |
| DN-09 | Appeal rate | No * | v3+ |  |
| DN-10 | Appeal success rate | No * | v3+ |  |
| DN-11 | Appeal upheld rate | No * | v3+ |  |
| DN-12 | Appeals filed | No * | v3+ |  |
| DN-13 | Appeals resolved | No * | v3+ |  |
| DN-14 | Open appeals | No * | v3+ |  |
| DN-15 | Denial write-offs | Yes |  | Denial Write off $ |
| DN-16 | Denial write-offs % of NPSR | Yes |  | Denial Write off $ % NPSR |
| FN-01 | Net patient service revenue | Yes |  | Net Revenue $ |
| FN-02 | Gross charges | Yes |  | Gross Revenue $ |
| FN-03 | Contractual adjustment rate | Yes |  | Contractual Adjustments / Gross Revenue $ |
| FN-04 | Contractual adjustments ($) | Yes |  | Contractual Adjustments |
| FN-05 | Bad debt write-offs | Yes |  | Bad Debt Transfers $ |
| FN-06 | Bad debt % of NPSR | Yes |  | Bad Debt Transfers % NPSR |
| FN-07 | Charity care | Yes |  | Charity Adjustments |
| FN-08 | Charity care % of NPSR | Yes |  | Charity Adjustments / Net Revenue $ |
| FN-09 | Cost to collect | No * | v3+ |  |
| FN-10 | Net to gross ratio | Yes |  | Net Revenue $ / Gross Revenue $ |
| FN-11 | Bad debt as % of gross revenue | Yes |  | Bad Debt Transfers $ / Gross Revenue $ |
| FN-12 | Bad debt incl. unrealized as % of gross revenue | No * | v3+ |  |
| FN-13 | Average daily gross revenue | Yes |  | Average Daily Gross Revenue |
| FN-14 | Average daily net revenue | Yes |  | Net Revenue $ / days (the Average Daily Net Revenue column is empty) |
| FN-15 | Admin adjustments | Yes |  | Admin Adjustments |
| PA-01 | Point-of-service cash % of net revenue | Yes |  | POS Collections (Posted $) / Net Revenue $ |
| PA-02 | Front-end denial rate | Yes |  | Initial Denials: Eligibility + Authorization + Coordination Of Benefits / SSI Payor Claims Sent - Gross Charges $ |
| PA-03 | Eligibility verification rate | No * | v3+ |  |
| PA-04 | Authorization rate | No * | v3+ |  |
| PA-05 | Pre-service authorization rate | No * | v3+ |  |
| PA-06 | Registration accuracy | No * | v3+ |  |
| PA-07 | Registration edits | No * | v3+ |  |
| PA-08 | Financial clearance rate | Yes |  | DPA II - 24 hour out completion rate (All Teams) |
| PA-09 | Pre-registration rate | Yes |  | DPA I - 24 hour out completion rate |
| PA-10 | Order scheduling rate | Yes |  | Scheduled Rate [Scheduled / Ordered Volume] |
| PA-11 | Scheduled volume | Yes |  | Total Scheduled Volume |
| PA-12 | Orders received | Yes |  | Total Order Volume |
| PA-13 | Order scheduling rate (final outcomes) | No * | v3+ |  |
| PA-14 | Orders closed without scheduling | No * | v3+ |  |
| PA-15 | Open orders in process > 24 hours | No * | v3+ |  |
| PA-16 | Average scheduling lead time | No * | v3+ |  |
| PA-17 | % scheduled with lead time 3+ days | No * | v3+ |  |
| PA-18 | Pre-registration finalization rate (72 hours) | No * | v3+ |  |
| PA-19 | % of accounts scheduled < 72 hours before service | No * | v3+ |  |
| PA-20 | Financial clearance rate (72 hours) | No * | v3+ |  |
| PA-21 | Open orders | Yes |  | Total Orders Not Scheduled ("Open") |
| PA-22 | Point-of-service collections | Yes |  | POS Collections (Posted $) |
| PA-23 | POS collection rate | No * | v3+ |  |
| PA-24 | POS collection yield (vs estimate) | No * | v3+ |  |
| PA-25 | POS estimate accuracy | No * | v3+ |  |
| PA-26 | Missed POS opportunity (known residual) | No * | v3+ |  |
| PA-27 | Inbound calls (patient access) | Yes |  | Inbound Call Volume |
| PA-28 | Outbound calls (patient access) | Yes |  | Outbound Call Volume |
| PA-29 | Total call volume (patient access, inbound + outbound) | Yes |  | Total Call Volume |
| PA-30 | Call abandonment rate (all lines) | No * | v3+ |  |
| PA-31 | Call abandonment rate (business office line) | No * | v3+ |  |
| PA-32 | Call abandonment rate | Yes |  | Call Abandonment Rate |
| PA-33 | Average speed to answer | Yes |  | Average Speed to Answer |
| PA-34 | Uninsured accounts in scope (Medicaid E&E) | Yes |  | Total Self Pay Volume |
| PA-35 | Medicaid screening rate | Yes |  | Total Screening Rate |
| PA-36 | Medicaid eligible completion rate | Yes |  | Eligible Application Rate (confirm the match with the client) |
| PA-37 | Coverage discovery rate | No * | v3+ |  |
| PA-38 | Schedule turnaround time | Yes |  | Schedule Turn Around Time |
| PA-39 | Average age of open orders | Yes |  | Average Age Open Orders |
| PA-40 | Open order days | Yes |  | Open Order Days (with Avg # Scheduled/Day, last 2 week avg) |
| PA-41 | Financial risk deferrals | Yes |  | Financial Risk - Deferral Volume |
| PA-42 | Authorization deferrals | Yes |  | Authorization - Deferral Volume |
| PA-43 | Referral deferrals | Yes |  | Referral - Deferral Volume |
| PA-44 | PAC deferrals | Yes |  | Financial Risk + Authorization + Referral - Deferral Volume |
| PA-45 | Pre-registration completion rate (48 hours) | Yes |  | DPA I - 48 hour out completion rate |
| PA-46 | Pre-registration completion rate, same day | Yes |  | Pre Reg - Completion Rate - Same Day |
| PA-47 | Pre-registration completion rate, 1 day out | Yes |  | Pre Reg - Completion Rate - 1 Day Out |
| PA-48 | Financial clearance rate (48 hours) | Yes |  | DPA II - 48 hour out completion rate (All Teams) |
| PA-49 | HTR completion rate, same day | Yes |  | HTR - Completion Rate - Same Day |
| PA-50 | HTR completion rate, 1 day out | Yes |  | HTR - Completion Rate - 1 Day Out |
| PA-51 | SDC completion rate, same day | Yes |  | SDC - Completion Rate - Same Day |
| PA-52 | SDC completion rate, 1 day out | Yes |  | SDC - Completion Rate - 1 Day Out |
| PA-53 | Inpatient completion rate, prior day | Yes |  | Inpatient Completion Rate - Prior Day |
| PA-54 | Pre-reg closed in Ready for Service (RS) | Yes |  | Pre-Reg Closed Accounts in RS Status |
| PA-55 | Pre-reg in Workup Needed (WN) or blank | Yes |  | Pre-Reg Accounts in WN or Blank Status |
| PA-56 | Pre-reg in Open Balance (OB/CD) | Yes |  | Pre-Reg Accounts in OB/CD Status |
| PA-57 | Average call time | Yes |  | Avg. Call Time |
| PA-58 | POS collections % of total self-pay cash | Yes |  | POS Collections % Total Self Pay Cash Posted |
| PA-59 | Self-pay accounts not screened | Yes |  | Not Screened Volume |
| PA-60 | Eligible conversion rate | Yes |  | Eligible Conversion Rate |
| PA-61 | Applications approved | Yes |  | Application Approved |
| PA-62 | Applications denied | Yes |  | Application Denied |
| PA-63 | Applications pending | Yes |  | Application Pending |
