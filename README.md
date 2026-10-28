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

The three sections are separate dashboards. You select them under **Select dashboard** in the
prototype controls bar at the top of the screen. This bar (striped, amber) is for the prototype only
and is not part of the design. It also has a **User type** switch (Internal / External; both show the
same view for now) and the **Prototype** state menu. The design starts below it, with a header that
shows the title, scope, reporting period, data through date, last refresh and the user badge.
Worklists are greyed out in the selector and marked **(v2)**. **Metric Dictionary** (prototype only,
after Worklists) is a reference tool for the team, not a dashboard of the product. The full filter pane appears only in
Analytics; the ELT Summary has a compact period and scope bar, and worklists have operational filters.

### 1. ELT Summary

The executive view, built only from standard BI components (KPI cards, trend charts, a metric table
with conditional formatting, a period-by-period table, a multi-metric trend, slicers, tooltips,
drill-through) and no explanatory prose. Slicers: period type (day, week, month, quarter, year to
date, rolling 12 months), period and hospital (or region).

| Section | Content |
|---|---|
| Key Performance Indicators | AR-06, CA-03, DN-04, BL-08, AR-07: actual, target, variance, 3-month change, 12-month sparkline |
| Performance Trends | AR-06, CA-03, DN-04 monthly for 12 months, with target line and off-target range |
| Performance vs. Target | All 12 framework metrics, grouped as Balance Sheet and Income Statement. **Summary** view: actual, target, variance to target, status, 3-month change, 12-month trend, benchmark. **Table** view: one metric per row, one column per period of the chosen time scale (Daily 14 days, Weekly 13 weeks, Monthly 12 months, Quarterly 8 quarters, Yearly every year in the window), actual values only; **Export** downloads it as a CSV for Excel, with the scope and time scale |
| Selected Metric Trends | One line per metric checked in Performance vs. Target (default: AR-06), on the same time scale, with dashed target lines (switch off with *Targets*). A metric keeps its color while it is checked. Two units at most: the first unit on the left axis, the second on the right axis; a metric in a third unit cannot be checked until one unit is cleared |

The time scale starts from the period type (day → Daily, week → Weekly, quarter → Quarterly,
others → Monthly) and the user can change it. Columns end with the selected period: a quarter or year
that is not complete runs to the selected month and is marked QTD or YTD.

Variance and change colors follow each metric's direction (higher Gross A/R days is unfavorable;
higher Cash as % of net revenue is favorable). Every metric row and card drills into its analytical
page (AR-06, AR-07, AR-01 → A/R; BL-08 → Billing / DNFB; CA-03 → Cash; DN-04, DN-01, DN-02 → Denials; others → Metric
Analysis). A hospital link applies that hospital as a filter first.

#### ELT metric framework

Client definitions, benchmarks and targets. `src/engine/framework.ts` maps each framework metric to
the catalog metric; the code and the name are the catalog code and name (see Metric codes below), so
the ELT Summary uses the same names as every other view; targets are in `config/targets.config.json`. Watch thresholds (the line between
Watch and Off target) are prototype choices, not client values.

| Group | Code | Metric | Calculation | Target | Watch |
|---|---|---|---|---|---|
| Balance Sheet | AR-06 | Gross A/R days | Ending gross AR ÷ (trailing 90-day gross revenue ÷ 90) | 45 | 50 |
| Balance Sheet | AR-07 | A/R > 90 days | Billed gross AR in 91+ buckets ÷ total billed gross AR | 20% | 25% |
| Balance Sheet | AR-01 | Net days in credit balance | \|Month-end credit balance AR\| ÷ (trailing 90-day net revenue ÷ 90) ¹ | 1.0 | 1.5 |
| Balance Sheet | PA-01 | Point-of-service cash % of net revenue | Patient POS payments ÷ net revenue | 2% | 1% |
| Income Statement | FN-10 | Net to gross ratio | Net revenue ÷ gross revenue | none (mix dependent) | – |
| Income Statement | BL-08 | Days in DNFB | Month-end DNFB gross $ ÷ (trailing 90-day gross revenue ÷ 90) | bill hold + 1.5 ² | 5.5 |
| Income Statement | CA-03 | Cash as % of net revenue | Cash ÷ average monthly net revenue, most recent 3 months ³ | 100% | 95% |
| Income Statement | FN-11 | Bad debt as % of gross revenue | Bad debt provision ÷ gross revenue ⁴ | 2% | 5% |
| Income Statement | DN-04 | Initial denial rate (claim dollars) | Gross charges denied ÷ gross charges submitted ⁵ | 5% | 6% |
| Income Statement | FN-12 | Bad debt incl. unrealized as % of gross revenue | (Provision + unrealized bad debt) ÷ gross revenue ⁶ | 3% | 3.5% |
| Income Statement | DN-01 | Avoidable write-offs as % of net revenue | Net avoidable write-offs ÷ average monthly net revenue ⁷ | 0.5% | 0.75% |
| Income Statement | DN-02 | Avoidable write-offs incl. unrealized as % of net revenue | (Avoidable write-offs + unrealized) ÷ average monthly net revenue ⁸ | 1% | 1.5% |

Prototype assumptions (confirm with the client):
¹ Credit balances are modeled; the synthetic data has no overpayments.
² `framework.billHoldDays` = 3 (illustrative), so the BL-08 target is 4.5 days.
³ The 3 months include the reporting month; quarters and YTD use the monthly average × months.
⁴ The provision is the bad debt transfers posted in the period.
⁵ Denials by denial date over claims by submit date in the same period, an approximation of the
submission cohort (a true cohort is incomplete for recent months).
⁶ Unrealized = open self-pay balances older than `framework.badDebtCriteriaDays` (120) after discharge.
⁷ Avoidable write-offs = write-offs after a final denial.
⁸ Unrealized = expected net on open denials older than `framework.unrealizedDenialDays` (90).

The synthetic data was generated before these benchmarks, so several metrics (notably PA-01, DN-01, DN-02)
sit far from target.

### 2. Analytics

| Page | Question it answers |
|---|---|
| Revenue Cycle Overview | Full enterprise scorecard (ELT framework metrics first, with codes), ranked hospital exceptions ("where to look first"), lifecycle stages (Patient Access → Charge Capture → Coding → CDI → Billing → Denials → A/R → Cash), hospital performance matrix |
| Patient Access | Sections: contact center (all lines), scheduling (order outcomes, open orders > 24 h, lead time), pre-registration and financial clearance (72-hour windows), POS collections (yield and accuracy vs estimate), eligibility and Medicaid enrollment, registration quality |
| Mid-Cycle | Charge lag, late charges ($ and %), missed charges, final coded volume, coding turnaround by type, CDI, documentation denials |
| Billing / DNFB | DNFB $ and days, hold reasons, aging, claims exported (# and $), billed not exported, first pass yield, clean claims, edits, billing lag |
| Denials | Which payers, hospitals, categories and root causes drive denials? (decomposition tree, drivers, payer × category, appeal volume, outcome and status) |
| A/R | Where is A/R accumulating, and why? (aging trend, hospital, payer, financial class, status, credit balances, concentration, aging matrix, accounts) |
| Cash | Are we on track for the cash goal? (month pace, YTD by hospital, payer collections, non-charge transactions, retractions, contractuals, life-to-date yield by service month) |
| Payers | Mix, A/R days, denial rate, net collection, contractual adjustment, payment variance, underpayment flags |
| Facilities | Sortable hospital comparison with status, trend and drill-through |
| Definitions | Metric catalog, client KPI coverage (every KPI on the client's inventory sheet and where to find it, or the data still needed), data sources and freshness, dimensions, demo scenarios, states, data contract |
| *Metric Analysis* (drill-through) | Trend with target/PY/rolling-3, breakdowns, contribution to change, peer comparison, small multiples |
| *Hospital Profile* (drill-through) | One hospital vs target, peers and system, by stage |
| *Account Detail* (drill-through) | The accounts behind an aggregate (synthetic IDs, no patient data) |

The A/R and Denials investigation paths, Billing / DNFB and Account Detail end in an **Act** step that
opens the matching worklist with the current filters.

Tabs follow the revenue cycle. Visuals with more than one form of a measure have a **measure switch**
($ / # / %, or a list when the forms share a unit), for example late charges $ or % of gross charges.

#### Client KPI inventory

The client's KPI sheet (73 rows) is mapped in `src/config/kpiCoverage.ts` and shown under
Definitions → Client KPI coverage. Each KPI is a catalog metric, a filter or view, a proxy, or needs a
source the client must supply. The data columns added for it come from a second random stream in the
generator, so all earlier columns, and the ELT Summary, are unchanged.

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

- **Global filter pane** (Analytics): date (day, week, month, quarter, YTD, rolling 12), comparison (prior period / prior year),
  region, facility type, hospital, financial class, payer, patient type, service line, RCM area, plus
  page-level fields (aging bucket, account status, denial category, root cause, DNFB hold, edit category).
  A week runs Sunday to Saturday; only complete weeks are listed. A day has a date field. For days and
  weeks, prior year = the same weekday 52 weeks earlier. Monthly visuals (trends, month-end snapshots)
  show the month that holds the selected day or week, and say which snapshot date they use.
  Multi-select, search, select all, clear, applied-filter chips, Clear all. Filters persist in the browser.
- **Click-to-filter / cross-filtering**: clicking a bar, segment, row or point filters every visual.
  Unselected members fade.
- **Drill-through**: ELT measure → analytical page; KPI → Metric Analysis; hospital → Hospital Profile;
  aggregate → Account Detail; investigation path → worklist.
  Breadcrumbs and Back keep the path. Bar charts have a Filter / Drill click mode.
- **Investigation path** (A/R, Denials): shows the analyst's drill steps as they click.
- **Every visual**: definition popover, show as table, focus (full screen), CSV export.
- **States**: loading, no data for filters, measure not available by a filter, source unavailable,
  error with retry, stale data, preliminary period. Switch them on with **Prototype** in the prototype controls bar.
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

## Metric codes and the Metric Dictionary (prototype only)

Every catalog metric has a unique code: its RCM area prefix and a number in the area, for example
`AR-06` (Gross A/R days) or `DN-09` (Appeal rate). The code is stored on the metric in
`src/engine/metrics.ts` (`code`). Codes do not change: a new metric takes the next free number in its
area, and the code of a removed metric is not used again.

| Prefix | RCM area | Prefix | RCM area |
|---|---|---|---|
| PA | Patient Access | DN | Denials |
| CC | Charge Capture | AR | A/R |
| CO | Coding | CA | Cash |
| CD | Clinical Documentation | FN | Financial |
| BL | Billing | | |

The codes replace the client's former ELT framework codes (P1–P13). Release priority ratings saved or
exported with the old codes still load (`LEGACY_FRAMEWORK_CODE` in `src/engine/framework.ts`).

**Metric Dictionary** in the prototype controls bar (after Worklists, marked *prototype only*) lists every
metric: code, name, short name, RCM category, definition, calculation in plain terms (`formula` on the
metric, for example "Appealed denials / denials"), unit, direction, target, flow or balance, shortest
period, time recency (H/D/W/M/Y, `recency` on the metric, not set yet) and the views where the metric
appears.

**One name per metric.** The dictionary name (`name`) and the approved short name (`short`, at most one,
for compact places such as KPI cards and chart legends) are the only names any view uses for a metric,
the ELT Summary included. Visual titles such as "Cash % net rev by hospital" are built from the catalog,
so they follow a measure switch. Tests check table column labels and renamed visuals. Release priority
ratings saved under a former visual title still load (`LEGACY_VISUAL_TITLE` in `src/config/priorities.ts`).
The client KPI inventory (`src/config/kpiCoverage.ts`) keeps the client's own KPI names, because it
records the client sheet.

**Shortest period** (`finest` on the metric): the shortest period type the metric is calculated for.
Day by default. Week for DNFB metrics (weekly Saturday snapshots). Month for metrics that read month-end
A/R snapshots, monthly costs, monthly revenue averages (CA-03, DN-01, DN-02) or monthly cohorts, and for
the cash goal. For a shorter period these metrics show "–" with the reason in a tooltip.
**Export to Excel (CSV)** downloads all metrics. The views are read from the page source files
(`src/config/metricDictionary.ts`), so the export follows the prototype as it changes. Every metric is
also on Metric Analysis (drill-through), which has a selector over the whole catalog. A new page file
must be added to `FILE_PAGE` (or `FILES_WITHOUT_VIEWS`); a test checks this.

## Release prioritization (facilitated session)

A prototype-only tool to decide, live with business leaders, what goes into each release. One person
(the facilitator) drives the screen. The scale combines release and MoSCoW:

| Choice | Release | MoSCoW |
|---|---|---|
| v1 | v1 (MVP) | Must |
| v2 | v2 | Should |
| v3+ | v3+ | Could |
| Won't | Not planned | Won't |

1. Click **Prioritize** in the prototype controls bar. Each visual and each ELT Summary section gets a
   release picker; unrated items have a dashed outline. A second click on the current choice clears it.
2. The floating **Release priorities** dock rates **this page**. A visual with no rating of its own takes
   its page's rating (shown as a pale choice); a rating on the visual overrides it.
3. KPIs: the ELT framework metrics (ELT Summary › Performance vs. Target) and every row of
   Definitions › Client KPI coverage get a picker. Product capabilities (drill-through, CSV export,
   bookmarks, Internal / External views, data states and more) are in **Summary › Capabilities**.
4. **Preview release** (v1, v1–v2, v1–v3+) dims the visuals outside that release, or hides them with
   **Hide others**, so leaders see what the release looks like. The preview stays on when Prioritize is off.
5. **Summary** shows the page rollup (counts per release for each page, KPI group and capability group),
   every item with a note field, and the file actions. Visual counts include only the visuals opened so
   far; **Open every page once** lists them all (visuals behind a sub-tab or switch need a manual visit).

Saving: every change is saved in the browser at once, so a page refresh keeps it. The browser warns
before you close or reload the tab when there are changes that are not exported. Use **Export (JSON)**
or **Export (CSV)** (opens in Excel) to keep a copy outside the browser, and **Load file…** to load
either file again, for example on another computer. Load replaces the current decisions. **Reset**
clears everything back to the start: all unset, except the three worklists and worklist actions (v2).

## Code structure

```
scripts/            Synthetic data generator (accounts -> A/R + DNFB snapshots, access, cost)
config/             data.config.json (seed, months, sample weight)
                    targets.config.json (target + watch threshold per metric, governance)
public/data/        Generated data files (columnar JSON)
src/data/           Loader: expands compact files into typed in-memory facts
src/engine/         engine.ts   aggregation for any filter context (sums, snapshots)
                    metrics.ts  metric catalog: code, definition, calculation, plain formula, source fields, compute
                    periods.ts  month / quarter / YTD / R12 and comparisons
                    status.ts   On target / Watch / Off target
src/services/       contracts.ts  response shapes the UI expects from a data service
                    analytics.ts  the only data API pages use (metricValue, trend, breakdown, accounts)
                    worklists.ts  worklist items, priority rules, simulated work fields
src/ui/             Shell, Visual container, Grid (analytical table), charts, widgets
                    (KPI card, scorecard, trend, breakdown, decomposition tree), investigation path
                    Priority (release prioritization: picker, dock, summary)
src/config/         priorities.ts  release prioritization model, capability list, export / import formats
                    metricDictionary.ts  metric dictionary rows, views read from the page sources, CSV export
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
