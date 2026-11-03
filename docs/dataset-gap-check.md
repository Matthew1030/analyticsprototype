# Dataset gap check

Each prototype data point on the client's "not in the dataset" list, checked against the
workbook `2026_1019_QHC_RCM_Dashboard.xlsx`. The check covers the column headers of the
Daily Data, Weekly Data and Monthly Data tabs (the Daily and Weekly tabs have the same metric
columns as Monthly, plus "Approved Application" on Daily), the Metric Listing tab and the Notes tab.

The three very hidden tabs (Full Dashboard, Quorum with Notes, Weekly Cash Metrics) name more
metrics: late charges, CDI queries, RQA, retractions, statements, lead time, charts coded,
coder holds, utilization review and task reporting. Those rows look up columns that the data tabs
do not have, so they hold no values. Weekly Cash Metrics shows only `#REF!` errors.

Result key:

- **Calculable**: the data tabs hold the inputs. The asterisk is removed.
- **Proxy only**: a related column exists, but it does not match the prototype definition. The
  asterisk stays until someone decides.
- **Not in workbook**: no column holds it. The asterisk stays.

## Calculable (asterisk removed)

| Data point | Workbook columns |
|---|---|
| A/R self-pay vs insurance split | Insurance AR and Self Pay AR sections; Gross Debit AR Self Pay. "A/R by financial class": Gross Debit AR by payer group (Medicare, Medicare Managed, Medicaid, Medicaid Managed, Blue Cross, Self Pay, All Other) |
| A/R > 180 days (%) | 181 - 360 and 361+ Days Ins AR and Self Pay AR, over Total Gross AR $. The workbook does not say if the aging counts from discharge or from billing |
| Point-of-service cash % of net revenue (P7) | POS Collections (Posted $) / Net Revenue $ |
| Front-end denial rate | Initial Denials: Eligibility + Authorization + Coordination Of Benefits / SSI Payor Claims Sent - Gross Charges $ |
| Coding denial rate | Initial Denials: Coding / SSI Payor Claims Sent - Gross Charges $ |
| Documentation-related denial rate | Initial Denials: Lacks Information/Med Records + Medical Necessity / SSI Payor Claims Sent - Gross Charges $ |
| Claims failing edits / rework claims | Total Claim − Clean Claim |
| Net to gross ratio | Net Revenue $ / Gross Revenue $ |
| Bad debt % of gross revenue | Bad Debt Transfers $ / Gross Revenue $ |
| Cash goal | Net Revenue $ (monthly), or NPSR with 2 Month Lag, times the goal %. The goal % is a setting, not data |

## Proxy only (asterisk kept, decision needed)

| Data point | Nearest workbook column | Gap |
|---|---|---|
| Avoidable write-offs % of net revenue (P12) | Denial Write off $ % NPSR | Only denial write-offs; no recoveries |
| Denials as % of NPSR | Gross Initial Denials $ and Net Revenue $ | Gross denied $, not expected net on denied claims |
| Scheduling lead time (average days) | Schedule Turn Around Time | Probably order-to-scheduled time, not scheduled-to-service time. Confirm what it measures |
| Coverage discovery rate | Screened - Eligible, Total Screening Rate | Medicaid eligibility, not all coverage found |
| Authorization obtainment rate | Authorization - Deferral Volume / Outcome | Deferrals only, no count of services that need authorization |
| Eligibility verification rate | Accounts Booked with Invalid Insurance | A count, not a verification rate |
| POS collection rate | POS Collections % Total Self Pay Cash Posted | Denominator is self-pay cash, not expected patient liability |
| Open orders > 24 hours (%) | Average Age Open Orders, Open Order Days | Average age, not a share over 24 hours |
| DNFB by hold reason (coding / physician query) | DNFB Balance by owner (Front End, Mid Cycle, Back End, Other) | By owner, not by hold reason |
| CBO tasks (KPI PRN) | ePars (Metric Listing: "R1 Assigned Tasks"): $ billed, $ unbilled, assigned 7+ days, by owner | Confirm if ePars are the CBO tasks |

## Not in workbook (asterisk kept)

POS yield vs estimate, pre-service collection yield, POS estimate accuracy, missed POS
opportunity, coding accuracy, A/R follow-up touch / no-touch rate, cash posted within 48 hours,
% scheduled 3+ days lead time, % scheduled < 72 hours before service, registration accuracy, RQA
edit volume, RQA 48-hour correction rate, coding turnaround, final coded account volume, CDI query
rate, late charges ($ and %; Notes tab: "Charge Capture | Allen | Late Charges"), charge lag,
charge accuracy, charge correction, missed / missing charges, first pass yield, billing lag,
appeal volume, status, rate, overturn and upheld rates, recoverable denials, avoidable write-offs
incl. unrealized, unapplied patient holding accounts, collector productivity, collector QA scores,
pending insurance write-offs, pending bad debt transfers (only posted transfers), self-pay
statement volume, LTD self-pay placement yield, net collection rate and LTD yield by service month,
insurance retractions ($ and % of cash), payment variance, underpayment success rate, total
deposits, NPC $, orders closed without scheduling, cost to collect, bad debt incl. unrealized.
