# RCM Analytics: high-fidelity prototype

A working prototype of an enterprise revenue cycle management (RCM) analytics product for health
systems and hospitals. It is the visual and functional reference for the production build: the
screens, the metrics, the filters, the drill paths, the tables and the states that the real product
must support.

The prototype is **analytics-platform agnostic**. It does not assume any BI tool. It represents the
product, not the implementation platform.

**All data is synthetic.** The organization, hospitals and figures are fictional. Payer names are used
for realism only; no figure describes any real payer.

## Run

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run data` | Regenerates the synthetic data in `public/data` (fixed seed: same output every run). |
| `npm test` | Data and metric tests: every metric computes, totals reconcile, planted patterns hold. |
| `npm run build` | Typecheck and production build (`dist`). |

GitHub Pages: `.github/workflows/pages.yml` tests, builds and deploys `dist` on pushes to the branches it lists.

## What the product does

The product has three connected experiences, each with its own level of information density:

| Experience | User question | Design | Density |
|---|---|---|---|
| **1. ELT Summary** (See) | How are we doing? | Simple, visual, prioritized | Low density, high signal |
| **2. Analytics** (Understand) | What is happening, where, and why? | Dense, interactive, exploratory | Medium-high density |
| **3. Worklists** (Act) | What specifically needs to be worked? | Operational, table-first, actionable | High density, high actionability |

They form one journey: **See → Understand → Act**. For example: Denial rate is off target on the
ELT Summary → click it (or its most affected hospital) → Denials Analytics, filtered to that hospital
→ pick the denial category → **Work these claims in the Denials worklist** → the specific open claims,
already filtered to that hospital and category. Breadcrumbs and Back keep the path in both directions.

The three sections are the top-level navigation in the header. The full filter pane appears only in
Analytics; the ELT Summary has a compact period and scope bar, and worklists have operational filters.

### 1. ELT Summary

The executive view, built only from standard BI components (KPI cards, trend charts, a metric table
with conditional formatting, ranked variance tables, slicers, tooltips, drill-through) and no
explanatory prose. Slicers: period type, period and hospital (or region).

| Section | Content |
|---|---|
| Key Performance Indicators | P1, P8, P10, P5, P4: actual, target, variance, 3-month change, 12-month sparkline |
| Performance Trends | P1, P8, P10 monthly for 12 months, with target line and off-target range |
| Performance vs. Target | All 12 framework metrics, grouped as Balance Sheet and Income Statement: actual, target, variance, status, 3-month change, 12-month trend, benchmark |
| Areas of Focus | Up to 5 off-target metrics with the largest unfavorable variance (relative to target), with the key driver hospital |
| Performance Highlights | Up to 3 on-target metrics with the largest favorable variance, with the leading hospital |

Variance and change colors follow each metric's direction (higher Gross AR Days is unfavorable;
higher Cash as % of Net Revenue is favorable). Every metric row and card drills into its analytical
page (P1, P4, P6 → A/R; P5 → Billing / DNFB; P8 → Cash; P10, P12, P13 → Denials; others → Metric
Analysis). A hospital link applies that hospital as a filter first.

#### ELT metric framework

Client definitions, codes (no P3), benchmarks and targets. `src/engine/framework.ts` maps each code to
the catalog metric; targets are in `config/targets.config.json`. Watch thresholds (the line between
Watch and Off target) are prototype choices, not client values.

| Group | Code | Metric | Calculation | Target | Watch |
|---|---|---|---|---|---|
| Balance Sheet | P1 | Gross AR Days | Ending gross AR ÷ (trailing 90-day gross revenue ÷ 90) | 45 | 50 |
| Balance Sheet | P4 | % of AR Over 90 Days | Billed gross AR in 91+ buckets ÷ total billed gross AR | 20% | 25% |
| Balance Sheet | P6 | Credit Balance Days | \|Month-end credit balance AR\| ÷ (trailing 90-day net revenue ÷ 90) ¹ | 1.0 | 1.5 |
| Balance Sheet | P7 | POS Collections % Net Rev | Patient POS payments ÷ net revenue | 2% | 1% |
| Income Statement | P2 | Net to Gross Ratio | Net revenue ÷ gross revenue | none (mix dependent) | – |
| Income Statement | P5 | DNFB / Unbilled Days | Month-end DNFB gross $ ÷ (trailing 90-day gross revenue ÷ 90) | bill hold + 1.5 ² | 5.5 |
| Income Statement | P8 | Cash as % of Net Revenue | Cash ÷ average monthly net revenue, most recent 3 months ³ | 100% | 95% |
| Income Statement | P9 | Bad Debt % Gross Rev | Bad debt provision ÷ gross revenue ⁴ | 2% | 5% |
| Income Statement | P10 | Initial Denial Rate (claim $) | Gross charges denied ÷ gross charges submitted ⁵ | 5% | 6% |
| Income Statement | P11 | Bad Debt incl. Unrealized | (Provision + unrealized bad debt) ÷ gross revenue ⁶ | 3% | 3.5% |
| Income Statement | P12 | Avoidable Write-Offs % Net | Net avoidable write-offs ÷ average monthly net revenue ⁷ | 0.5% | 0.75% |
| Income Statement | P13 | Avoidable W/O incl. Unreal. | (Avoidable write-offs + unrealized) ÷ average monthly net revenue ⁸ | 1% | 1.5% |

Prototype assumptions (confirm with the client):
¹ Credit balances are modeled; the synthetic data has no overpayments.
² `framework.billHoldDays` = 3 (illustrative), so the P5 target is 4.5 days.
³ The 3 months include the reporting month; quarters and YTD use the monthly average × months.
⁴ The provision is the bad debt transfers posted in the period.
⁵ Denials by denial date over claims by submit date in the same period, an approximation of the
submission cohort (a true cohort is incomplete for recent months).
⁶ Unrealized = open self-pay balances older than `framework.badDebtCriteriaDays` (120) after discharge.
⁷ Avoidable write-offs = write-offs after a final denial.
⁸ Unrealized = expected net on open denials older than `framework.unrealizedDenialDays` (90).

The synthetic data was generated before these benchmarks, so several metrics (notably P7, P12, P13)
sit far from target.

### 2. Analytics

| Page | Question it answers |
|---|---|
| Revenue Cycle Overview | Full enterprise scorecard (P1–P13 first, with codes), ranked hospital exceptions ("where to look first"), lifecycle stages (Patient Access → Charge Capture → Coding → CDI → Billing → A/R → Denials → Cash), hospital performance matrix |
| A/R | Where is A/R accumulating, and why? (aging trend, hospital, payer, financial class, status, concentration, aging matrix, accounts) |
| Denials | Which payers, hospitals, categories and root causes drive denials? (decomposition tree, drivers, payer × category) |
| Cash | Are we on track for the cash goal? (month pace, YTD by hospital, payer collections) |
| Patient Access | Eligibility, authorization, registration, financial clearance, scheduling, POS |
| Mid-Cycle | Charge lag, late and missing charges, coding turnaround, CDI, documentation denials |
| Billing / DNFB | DNFB $ and days, hold reasons, aging, clean claims, edits, billing lag |
| Payers | Mix, A/R days, denial rate, net collection, contractual adjustment, payment variance, underpayment flags |
| Facilities | Sortable hospital comparison with status, trend and drill-through |
| Definitions | Metric catalog, data sources and freshness, dimensions, demo scenarios, states, data contract |
| *Metric Analysis* (drill-through) | Trend with target/PY/rolling-3, breakdowns, contribution to change, peer comparison, small multiples |
| *Hospital Profile* (drill-through) | One hospital vs target, peers and system, by stage |
| *Account Detail* (drill-through) | The accounts behind an aggregate (synthetic IDs, no patient data) |

The A/R and Denials investigation paths, Billing / DNFB and Account Detail end in an **Act** step that
opens the matching worklist with the current filters.

### 3. Worklists

| Worklist | Items | Main columns |
|---|---|---|
| Denials | Open denied claims (not paid, not written off) | Claim, hospital, payer, denial category and reason, denied $, age, appeal due, priority, status, assigned to, next action |
| A/R follow-up | Open insurance balances in process or pended (denied claims stay on the denials list) | Account, hospital, payer, balance, age, aging bucket, last activity, expected payment, priority, status, assigned to, next action |
| DNFB | Discharged accounts not final billed | Account, hospital, DNFB $, days in DNFB, DNFB reason, department, owner, priority, status, next action |

Each worklist has queues (All open, My queue, Unassigned, High priority, an urgency queue, Resolved),
search, facet filters, sorting, paging, multi-select with bulk assign and status change, CSV export,
and a row panel with the next action, the reason for the priority, the account activity and work notes.
The analytics context (hospital, payer, category, aging bucket, hold reason ...) shows as chips that
can be removed.

Priority rules are explicit and shown in the product (`PRIORITY_RULES` in `src/services/worklists.ts`).
Assignee, work status, next action and appeal deadlines are **simulated** with fixed rules and a
deterministic hash; appeal limits by financial class are illustrative only. In production these come
from the work-queue or task system and the payer contract setup. Status, assignment and notes made in
the prototype are kept in the browser only.

### Interaction model

- **Global filter pane** (Analytics): date (month, quarter, YTD, rolling 12), comparison (prior period / prior year),
  region, facility type, hospital, financial class, payer, patient type, service line, RCM area, plus
  page-level fields (aging bucket, account status, denial category, root cause, DNFB hold, edit category).
  Multi-select, search, select all, clear, applied-filter chips, Clear all. Filters persist in the browser.
- **Click-to-filter / cross-filtering**: clicking a bar, segment, row or point filters every visual.
  Unselected members fade.
- **Drill-through**: ELT measure → analytical page; KPI → Metric Analysis; hospital → Hospital Profile;
  aggregate → Account Detail; investigation path → worklist.
  Breadcrumbs and Back keep the path. Bar charts have a Filter / Drill click mode.
- **Investigation path** (A/R, Denials): shows the analyst's drill steps as they click.
- **Every visual**: definition popover, show as table, focus (full screen), CSV export.
- **States**: loading, no data for filters, measure not available by a filter, source unavailable,
  error with retry, stale data, preliminary period. Switch them on with **Prototype** in the header.
  The same menu turns on build annotations (visual type, measures, dimensions, interaction) on each visual.

### Demo scenarios (planted in the data, documented under Definitions → Demo scenarios)

1. **Why is net A/R increasing?** Net A/R days rise from about 53 to 60 (target 50). Williamson
   Regional rises most; the growth is in 91–180 days; Humana Medicare Advantage dominates; accounts
   are "Pended, records requested".
2. **Why are denials up?** Valley Regional is highest, driven by Medicare Advantage coordination-of-benefits
   denials; registration errors feed eligibility and COB denials (worst at Pine Ridge).
3. **Underpayment**: one commercial payer pays about 8% below expected reimbursement.
4. **DNFB**: coding backlog at Riverbend; unassigned holds and late charges at Lakeside General.
5. **Cash**: cash runs below goal as A/R builds; YTD by hospital shows who is behind.

## Code structure

```
scripts/            Synthetic data generator (accounts -> A/R + DNFB snapshots, access, cost)
config/             data.config.json (seed, months, sample weight)
                    targets.config.json (target + watch threshold per metric, governance)
public/data/        Generated data files (columnar JSON)
src/data/           Loader: expands compact files into typed in-memory facts
src/engine/         engine.ts   aggregation for any filter context (sums, snapshots)
                    metrics.ts  metric catalog: definition, calculation, source fields, compute
                    periods.ts  month / quarter / YTD / R12 and comparisons
                    status.ts   On target / Watch / Off target
src/services/       contracts.ts  response shapes the UI expects from a data service
                    analytics.ts  the only data API pages use (metricValue, trend, breakdown, accounts)
                    worklists.ts  worklist items, priority rules, simulated work fields
src/ui/             Shell, Visual container, Grid (analytical table), charts, widgets
                    (KPI card, scorecard, trend, breakdown, decomposition tree), investigation path
src/pages/          One file per screen (EltSummary, analytics pages, Worklist)
tests/              Data, reconciliation, planted-pattern and contract tests
```

### Notes for the production build

- Replace `src/services/analytics.ts` with API calls that return the shapes in `src/services/contracts.ts`.
  Example endpoints are documented at the top of that file and under Definitions → Data contract.
- Ratios are always `sum(numerator) / sum(denominator)` for the filter context, never averages of ratios.
  Balance metrics use the period-end snapshot; flow metrics sum the period.
- Detail fields (aging bucket, denial category, hold reason, edit category) apply only to the measures
  that carry them. A/R day and aging-share ratios ignore aging-bucket and status filters.
- Metric definitions are **drafts**. Several have more than one common industry definition (flagged
  in the catalog); confirm each with the client's finance team. Targets are illustrative configuration.
- The prototype stores a 1-in-10 sample of accounts and scales account measures by 10, so totals match
  a mid-size health system. Account Detail therefore lists sampled accounts.
- Authentication is out of scope (the product would use the organization's single sign-on). Account-level
  views need role-based access and audit logging; hospital entitlements should filter data in the service.
