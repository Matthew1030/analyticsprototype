// Definitions and Data: metric catalog, data freshness and sources, dimensions, the response
// contract, the visual states developers must build, and guided demo scenarios.

import { useState } from 'react';
import type { SelField } from '../engine/engine';
import { METRICS, type MetricDef } from '../engine/metrics';
import { CONFIG, staticTarget, watchFor } from '../engine/status';
import { fmt, fmtDate, fmtDateTime } from '../format';
import { DIMENSION_LABEL, members } from '../services/analytics';
import type { DimensionId } from '../services/contracts';
import { useApp, type PageId } from '../state/AppState';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { CanvasHeader } from '../ui/Shell';
import { Skeleton, Visual } from '../ui/Visual';

const TABS = ['Metric catalog', 'Data sources', 'Dimensions', 'Demo scenarios', 'States', 'Data contract'] as const;
type Tab = typeof TABS[number];

export function Definitions() {
  const [tab, setTab] = useState<Tab>('Metric catalog');
  return (
    <div className="page">
      <CanvasHeader />
      <div className="subtabs" role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Metric catalog' && <Catalog />}
      {tab === 'Data sources' && <Sources />}
      {tab === 'Dimensions' && <Dimensions />}
      {tab === 'Demo scenarios' && <Scenarios />}
      {tab === 'States' && <States />}
      {tab === 'Data contract' && <Contract />}
    </div>
  );
}

function Catalog() {
  const { areas, go } = useApp();
  const [q, setQ] = useState('');
  const list = METRICS.filter((m) => (!areas.length || areas.includes(m.area)) && (!q || `${m.name} ${m.id} ${m.definition}`.toLowerCase().includes(q.toLowerCase())));
  const cols: GridColumn<MetricDef>[] = [
    { key: 'name', label: 'Metric', value: (m) => m.name, width: 200, render: (m) => <span><b>{m.name}</b><br /><code className="small">{m.id}</code></span> },
    { key: 'area', label: 'RCM area', value: (m) => m.area, align: 'left' },
    { key: 'type', label: 'Type', value: (m) => (m.type === 'balance' ? 'Balance' : 'Flow'), align: 'left' },
    { key: 'unit', label: 'Unit', value: (m) => m.unit, align: 'left' },
    { key: 'dir', label: 'Better', value: (m) => (m.direction === 'up' ? 'Higher' : m.direction === 'down' ? 'Lower' : '–'), align: 'left' },
    { key: 'target', label: 'Target', value: (m) => staticTarget(m.id), render: (m) => (m.target ? 'Calculated' : fmt(staticTarget(m.id), m.unit, m.digits)), exportText: (m) => (m.target ? 'Calculated' : fmt(staticTarget(m.id), m.unit, m.digits)) },
    { key: 'watch', label: 'Watch to', value: (m) => watchFor(m.id, staticTarget(m.id)), render: (m) => fmt(watchFor(m.id, staticTarget(m.id)), m.unit, m.digits) },
    { key: 'def', label: 'Definition', value: (m) => m.definition, align: 'left', render: (m) => <span className="wrap">{m.definition}{m.multiDef && <span className="note"> Several industry definitions exist; confirm with Finance.</span>}</span> },
    { key: 'calc', label: 'Calculation', value: (m) => m.calculation, align: 'left', render: (m) => <code className="wrap small">{m.calculation}</code> },
    { key: 'src', label: 'Source fields', value: (m) => m.sourceFields.join(', '), align: 'left', render: (m) => <span className="wrap small mono">{m.sourceFields.join(', ')}</span> },
  ];
  const rows = list.map((m) => ({ id: m.id, data: m }));
  const g = CONFIG.governance;
  return (
    <Visual title={`Metric catalog (${list.length} metrics)`} subtitle={`Draft definitions · owner ${g.owner} · version ${g.version} · changed ${g.changeDate} · click a metric to analyze it`}
      actions={<span className="search-inline"><Icon name="search" size={12} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search metrics" aria-label="Search metrics" /></span>}
      table={gridExport(cols, rows)}
      spec={{ type: 'Reference table', interactions: 'Search; RCM area filter applies; row click opens Metric Analysis' }}>
      <Grid caption="Metric catalog" columns={cols} rows={rows} dense onRowClick={(m) => go('metric', { id: m.id }, { drill: true })} />
    </Visual>
  );
}

function Sources() {
  const { ds, sim } = useApp();
  const rows = ds.dims.sourceSystems.map((s) => {
    const failed = (sim === 'partial' && s.key === 'clearinghouse') || sim === 'stale';
    return {
      id: s.key, data: {
        ...s,
        status: failed ? (sim === 'stale' ? 'Failed' : 'Delayed') : 'Current',
        last: failed ? (s.key === 'clearinghouse' ? '2026-10-06T08:30:00Z' : '2026-10-06T11:00:00Z') : s.key === 'gl' ? '2026-10-07T13:00:00Z' : ds.meta.lastRefreshUtc,
        rows: s.key === 'gl' ? 'Sep close posted' : 'Complete',
      },
    };
  });
  type R = typeof rows[number]['data'];
  const cols: GridColumn<R>[] = [
    { key: 'name', label: 'Source system', value: (r) => r.name, width: 230 },
    { key: 'feeds', label: 'Feeds', value: (r) => r.feeds, align: 'left' },
    { key: 'cadence', label: 'Schedule', value: (r) => r.cadence, align: 'left' },
    { key: 'last', label: 'Last successful load', value: (r) => r.last, align: 'left', render: (r) => fmtDateTime(r.last, ds.meta.displayTimeZone) },
    { key: 'status', label: 'Status', value: (r) => r.status, align: 'left', render: (r) => <span className={`status status-${r.status === 'Current' ? 'ok' : r.status === 'Delayed' ? 'watch' : 'off'}`}><span className="status-shape" />{r.status}</span> },
    { key: 'dq', label: 'Data quality checks', value: (r) => r.rows, align: 'left' },
  ];
  return (
    <div className="row cols-8-4">
      <Visual title="Source systems and freshness" subtitle="Generic source categories; the product does not depend on a specific vendor"
        table={gridExport(cols, rows)} spec={{ type: 'Status table', interactions: 'Drives the header freshness indicator and stale/partial banners' }}>
        <Grid caption="Source systems" columns={cols} rows={rows} dense />
      </Visual>
      <Visual title="Data currency">
        <dl className="kv">
          {[
            ['Last refreshed', fmtDateTime(ds.meta.lastRefreshUtc, ds.meta.displayTimeZone)],
            ['Data through', fmtDate(ds.meta.asOfDay)],
            ['Latest reporting period', 'September 2026 (preliminary until close)'],
            ['Planned September close', ds.meta.availability[String(ds.meta.endMonth + 1)] ?? ''],
            ['History available', '24 months (Oct 2024 – Sep 2026)'],
            ['Account sample (prototype)', `1 in ${ds.meta.sampleWeight}; account measures scaled ×${ds.meta.sampleWeight}`],
            ['Refresh failure rule', 'Banner when the last refresh is older than 24 hours'],
          ].map(([k, v]) => <div key={k} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </Visual>
    </div>
  );
}

function Dimensions() {
  const { ds } = useApp();
  const dims: DimensionId[] = ['region', 'facility', 'facilityType', 'financialClass', 'payer', 'serviceLine', 'patientType', 'denialCategory', 'rootCause', 'editCategory', 'dnfbHold', 'arAge', 'accountStatus'];
  return (
    <div className="dim-grid">
      {dims.map((d) => {
        const list = members(ds, d);
        return (
          <Visual key={d} title={DIMENSION_LABEL[d]} subtitle={`${list.length} members`}
            table={{ columns: ['Key', 'Member', 'Attribute'], rows: list.map((m) => [m.key, m.label, m.sub ?? '']) }}>
            <ul className="dim-list">{list.map((m) => <li key={m.key}><span>{m.label}</span>{m.sub && <span className="muted small">{m.sub}</span>}</li>)}</ul>
          </Visual>
        );
      })}
    </div>
  );
}

interface Scenario { title: string; question: string; page: PageId; params?: Record<string, string>; filters: Partial<Record<SelField, number[]>>; steps: string[] }

const SCENARIOS: Scenario[] = [
  {
    title: 'Why is net A/R increasing?', question: 'Net A/R days rose from about 53 to 60 in six months against a target of 50.', page: 'metric', params: { id: 'net_ar_days' }, filters: {},
    steps: ['Metric Analysis: trend shows the rise starting in spring 2026.', '“Change by hospital”, set to “vs 6 months earlier”: Williamson Regional rose most. Click its bar to filter.', 'Open A/R: “Aging trend” shows growth in 91–120 and 121–180. Click 121–180.', '“A/R by payer”: Humana Medicare Advantage dominates the bucket. Click it.', '“A/R by account status”: most of it is “Pended, records requested”. Click “View accounts”.'],
  },
  {
    title: 'Why are denials up at Valley Regional?', question: 'The system denial rate is above the 5% target, highest at Valley Regional.', page: 'denials', filters: {},
    steps: ['Decomposition tree: Payer → Humana / UHC Medicare Advantage are the largest.', 'Next level Hospital → Valley Regional.', 'Category → Coordination of benefits; root cause → MSP / COB questionnaire.', 'Apply the path as filters, then “View denied claims”.', 'Patient Access page: registration accuracy shows the front-end cause.'],
  },
  {
    title: 'Is any payer underpaying?', question: 'Payment variance flags payers that pay below expected reimbursement.', page: 'payers', filters: {},
    steps: ['Payer performance table: Cigna is flagged (about −8% vs expected).', 'Click the payer, then “Analyze payment variance” for its trend and hospital split.'],
  },
  {
    title: 'What is holding claims at Riverbend?', question: 'DNFB days are off target at Riverbend and Lakeside General.', page: 'billing', filters: {},
    steps: ['DNFB $ by hospital: Riverbend and Lakeside General lead relative to size.', 'Expand them in “DNFB by hospital and hold reason”: Riverbend = awaiting coding; Lakeside = unassigned and charge reconciliation.', 'Mid-Cycle page: coding turnaround at Riverbend; late charges at Lakeside.'],
  },
  {
    title: 'Are we on track for cash?', question: 'Cash collected vs goal for the month and year to date.', page: 'cash', filters: {},
    steps: ['Month-to-date pace vs goal pace.', 'YTD by hospital: which hospitals are behind goal.', 'Cash % NPSR by hospital: drill into the weakest.'],
  },
];

function Scenarios() {
  const { go, clearAll, selectOnly, setPeriod, ds } = useApp();
  const start = (s: Scenario) => {
    clearAll();
    setPeriod('month', ds.meta.endMonth);
    for (const [f, keys] of Object.entries(s.filters)) selectOnly(f as SelField, keys!);
    go(s.page, s.params ?? {}, { drill: true });
  };
  return (
    <div className="dim-grid wide">
      {SCENARIOS.map((s) => (
        <Visual key={s.title} title={s.title} subtitle={s.question}>
          <ol className="steps">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => start(s)}>Start from a clean slate ›</button>
        </Visual>
      ))}
      <p className="footnote">The synthetic data contains these patterns on purpose, so each workflow ends at a traceable cause. All names and figures are fictional.</p>
    </div>
  );
}

function States() {
  const { setSim } = useApp();
  return (
    <>
      <p className="footnote">Every visual handles these states the same way. Use <b>Prototype</b> in the header to switch the whole workspace into a state, or see each one below.</p>
      <div className="dim-grid">
        <Visual title="Loading" subtitle="Skeleton while a query runs; layout does not jump"><Skeleton /></Visual>
        <Visual title="No data for filters" subtitle="Filtered to zero results; offers Clear filters">
          <div className="state state-empty"><Icon name="filter" size={16} /><span>No data matches the current filters.</span><button type="button" className="btn btn-sm">Clear filters</button></div>
        </Visual>
        <Visual title="Measure not available by a filter" subtitle="The fact has no such field (e.g. DNFB by payer)">
          <div className="state state-empty"><Icon name="filter" size={16} /><span>Not available by payer. Clear the payer filter to see this measure.</span></div>
        </Visual>
        <Visual title="Source unavailable" subtitle="One feed is late; other visuals still work">
          <div className="state state-unavailable"><Icon name="database" size={16} /><span><b>Data unavailable.</b> The claims clearinghouse feed has not loaded since Oct 6, 2026 3:30 AM.</span></div>
        </Visual>
        <Visual title="Error" subtitle="Query failed; retry per visual">
          <div className="state state-error"><Icon name="warn" size={16} /><span><b>This visual could not load.</b> The data service returned an error (request id 7f3c-91a2).</span><button type="button" className="btn btn-sm">Retry</button></div>
        </Visual>
        <Visual title="Stale data" subtitle="Header and banner warn when refresh is over 24 hours old">
          <div className="banner banner-warn"><Icon name="warn" size={14} /><span><b>Data may be out of date.</b> Last refresh more than 24 hours ago.</span></div>
          <button type="button" className="btn btn-sm" onClick={() => setSim('stale')}>Turn on for the workspace</button>
        </Visual>
        <Visual title="Preliminary period" subtitle="The current month is open until close">
          <span className="pill pill-prelim">Preliminary</span> <span className="small">Shown next to the period in the header; closed months show <span className="pill pill-closed">Closed</span>.</span>
        </Visual>
      </div>
    </>
  );
}

function Contract() {
  return (
    <div className="row cols-2">
      <Visual title="Response shapes" subtitle="src/services/contracts.ts · the prototype fills these in the browser; production returns them from an API">
        <pre className="code">{`// GET /api/metrics/net_ar_days?period_type=month&period_end=2026-09&compare=prior&facility=2
{
  "metric": "net_ar_days", "name": "Net A/R days", "rcm_area": "A/R",
  "unit": "days", "direction": "down", "period": "Sep 2026",
  "value": 60.5, "compare_period": "Aug 2026", "compare_value": 60.1,
  "change": 0.4, "change_kind": "Unfavorable", "prior_year_value": 53.6,
  "target": 50.0, "watch_threshold": 54.0, "variance_to_target": 10.5,
  "status": "Off target",
  "trend": [{ "period": "2025-09", "label": "Sep 25", "value": 53.6,
              "target": 50, "prior_year": null, "rolling_3": 54.2 }, ...]
}

// GET /api/metrics/net_ar/breakdown?dimension=payer&...
[{ "key": 1, "label": "Humana Medicare Advantage", "value": 21400000,
   "compare_value": 18900000, "change": 2500000, "target": null,
   "status": null, "share": 0.13, "contribution": 2500000 }, ...]

// GET /api/accounts?snapshot=2026-09-30&aging_bucket=4&payer=1&sort=-balance
[{ "account_id": "A4105612", "facility": "Williamson Regional",
   "payer": "Humana Medicare Advantage", "discharge_date": "2026-04-18",
   "days_since_discharge": 165, "balance": 48210,
   "status": "Pended, records requested", ... }]`}</pre>
      </Visual>
      <Visual title="Build notes for developers">
        <ul className="notes">
          <li><b>Filter context</b> is global (left pane + click-to-filter) and sent with every request. Detail fields (aging bucket, denial category, hold reason) apply only to the measures that carry them.</li>
          <li><b>Ratios</b> are always sum(numerator) / sum(denominator) for the filter context, never an average of ratios.</li>
          <li><b>Balance</b> metrics use the period-end snapshot; <b>flow</b> metrics sum the period. Quarter, YTD and rolling-12 work the same way.</li>
          <li><b>Targets</b> and Watch thresholds are configuration (config/targets.config.json). Status = On target / Watch / Off target, always with a shape and label, never color alone.</li>
          <li><b>Drill-through</b>: KPI → Metric Analysis; hospital → Hospital Profile; aggregate → Account Detail. Breadcrumbs and Back keep the path.</li>
          <li><b>Every visual</b> supports definition, show as table, focus mode and CSV export, and handles loading, empty, unavailable and error states.</li>
          <li><b>Security</b>: account detail needs role-based access and audit logging; hospital-level entitlements should filter data at the service, not in the UI.</li>
          <li>The prototype is <b>analytics-platform agnostic</b>: any BI or custom front end can implement these screens from the same contracts.</li>
        </ul>
      </Visual>
    </div>
  );
}
