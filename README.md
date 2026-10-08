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

Users move from **enterprise → hospital → revenue-cycle area → metric → detail records**, and the
product is built to answer *what is happening, where, and why*, not only to show KPIs.

### Screens

| Page | Question it answers |
|---|---|
| Executive Overview | How is the revenue cycle performing against target, and where should leadership look first? |
| Revenue Cycle | Which lifecycle stage (Patient Access → Charge Capture → Coding → CDI → Billing → A/R → Denials → Cash) is failing, and where? |
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

### Interaction model

- **Global filter pane**: date (month, quarter, YTD, rolling 12), comparison (prior period / prior year),
  region, facility type, hospital, financial class, payer, patient type, service line, RCM area, plus
  page-level fields (aging bucket, account status, denial category, root cause, DNFB hold, edit category).
  Multi-select, search, select all, clear, applied-filter chips, Clear all. Filters persist in the browser.
- **Click-to-filter / cross-filtering**: clicking a bar, segment, row or point filters every visual.
  Unselected members fade.
- **Drill-through**: KPI → Metric Analysis; hospital → Hospital Profile; aggregate → Account Detail.
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
src/ui/             Shell, Visual container, Grid (analytical table), charts, widgets
                    (KPI card, scorecard, trend, breakdown, decomposition tree), investigation path
src/pages/          One file per screen
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
