// ELT Summary ("See"): the executive view of revenue cycle performance.
//
// Built from standard BI components only: KPI cards, trend charts, a metric table with
// conditional formatting, a period-by-period table, a multi-metric trend, slicers, tooltips and
// drill-through. The page carries no explanatory prose: actual, target, variance and trend carry
// the message.
//
// Sections: Key Performance Indicators · Performance Trends · Performance vs. Target (the full
// ELT framework, as a summary or as a period table) · Selected Metric Trends (the metrics checked
// in Performance vs. Target). Metric names are the catalog names (Metric Dictionary): the full name
// in tables, the approved short name in compact places.
//
// v1 (src/config/v1.ts): six KPI cards in two rows, no Performance Trends, the option's metrics in
// Performance vs. Target grouped by stage. A row click puts the metric on the Selected Metric
// Trends chart. Only the KPI cards in the option's drill list open an analytics page.
//
// v1 (B): the ELT Summary is the only dashboard. Daily, Weekly and Monthly tabs each hold six
// headline KPI cards; the tab sets the period type, so Performance vs. Target and the trend follow
// it. A metric that is calculated only by week or by month (DNFB, A/R) shows its latest snapshot,
// labeled "As of <date>". The KPI cards do not drill through.

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CADENCES, DNFB_SPLIT, isV1, kpiMetrics, V1_SCOPE, type Cadence, type KpiSpec, type V1Version } from '../config/v1';
import { shortDayLabel } from '../data/dates';
import { FIELD_LABEL, type SelField } from '../engine/engine';
import { FRAMEWORK, FRAMEWORK_BY_ID } from '../engine/framework';
import { evaluate, METRIC_BY_ID, UNIT_LABEL, validFor, type MetricResult, type Unit } from '../engine/metrics';
import { grainColumns, grainOf, latestSnapshotPeriod, longDayLabel, monthPeriod, PERIOD_KIND_LABEL, shiftPeriod, TIME_GRAIN_LABEL, trailing, type Period, type PeriodKind, type TimeGrain } from '../engine/periods';
import { changeOf, statusOf, type Status } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { metricValue } from '../services/analytics';
import { worklist } from '../services/worklists';
import type { MetricValue } from '../services/contracts';
import { scopeText, useApp, type PageId } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { eltTrendOption, multiTrendOption, SERIES, type TrendLine } from '../ui/charts';
import { fmtMetric, GapLegend, GapMark, InfoIcon, metricLabel, PeriodInput, Sparkline, StatusMark } from '../ui/common';
import { gapStar } from '../config/datasetGaps';
import { Icon } from '../ui/icons';
import { PAGE_BY_ID } from '../ui/Shell';
import { TabBox, useGroupStatus, useTab, type TabDef } from '../ui/TabBox';
import { downloadCsv } from '../ui/Visual';

/** Headline KPIs and trend charts (AR-06, AR-07, BL-08, CA-03, DN-04). */
export const ELT_KPIS = ['gross_ar_days', 'cash_pct_npsr', 'denial_dollar_rate', 'dnfb_days', 'ar_gt90_pct'];
const ELT_TRENDS = ['gross_ar_days', 'cash_pct_npsr', 'denial_dollar_rate'];
/** A table group: name and metrics, each with the client's benchmark where the framework has one. */
interface Group { name: string; metrics: { id: string; benchmark?: string }[] }
const FULL_GROUPS: Group[] = FRAMEWORK;
const toGroups = (v: V1Version): Group[] => V1_SCOPE[v].eltGroups.map((g) => ({ name: g.name, metrics: g.metrics.map((id) => ({ id, benchmark: FRAMEWORK_BY_ID[id]?.benchmark })) }));
const V1_GROUPS: Record<V1Version, Group[]> = { v1: toGroups('v1'), v1b: toGroups('v1b') };
const ALL_IDS = [...new Set([...FULL_GROUPS, ...V1_GROUPS.v1, ...V1_GROUPS.v1b].flatMap((g) => g.metrics.map((m) => m.id)))];
/** Metric on the selected-metric trend when the page opens. */
const DEFAULT_CHOSEN = { v1: ['denial_dollar_rate'], v1b: ['denial_dollar_rate'], full: ['gross_ar_days'] };
/** Units that can share the selected-metric trend (left axis, right axis). */
const MAX_UNITS = 2;

/** Drill-through target: the analytical page for the metric, or Metric Analysis. */
const DRILL: Record<string, PageId> = {
  gross_ar_days: 'ar', ar_gt90_pct: 'ar', credit_balance_days: 'ar', dnfb_days: 'billing', cash_pct_npsr: 'cash',
  denial_dollar_rate: 'denials', avoidable_wo_pct_net: 'denials', avoidable_wo_unrealized_pct: 'denials',
};

/** A change smaller than this (per unit) is shown as flat. */
const FLAT = { days: 0.3, pct: 0.0005, usd: 0, count: 0, ratio: 0.01, sec: 1 } as const;

/** asOf: the snapshot period shown when the metric is not calculated for the selected period (v1 (B)). */
interface Row { id: string; v: MetricValue; d3: number | null; asOf?: Period }

/** Code and full catalog name (tables). */
const label = (id: string) => <><span className="elt-code">{FRAMEWORK_BY_ID[id]?.code ?? METRIC_BY_ID[id].code}</span>{METRIC_BY_ID[id].name}</>;
/** Code and approved short name (KPI cards, trend cards). */
const shortLabel = (id: string) => <><span className="elt-code">{METRIC_BY_ID[id].code}</span>{metricLabel(id)}</>;
const tone = (s: Status) => (s === 'On target' ? 'ok' : s === 'Watch' ? 'watch' : s ? 'off' : 'none');

function row(id: string, v: MetricValue): Row {
  const t = v.trend;
  const cur = t[t.length - 1]?.value ?? null;
  const prev = t.length >= 4 ? t[t.length - 4].value : null;
  return { id, v, d3: cur !== null && prev !== null ? cur - prev : null };
}

/** Metrics checked for the selected-metric trend, each with its fixed series color. */
interface Chosen { ids: string[]; color: Record<string, string> }

export function EltSummary() {
  const { engine, period, compare, sel, go, ds, version, toast } = useApp();
  const v1 = isV1(version);
  const groups = isV1(version) ? V1_GROUPS[version] : FULL_GROUPS;
  const kpis = isV1(version) ? V1_SCOPE[version].eltKpis : ELT_KPIS;
  const v1Drill = isV1(version) ? V1_SCOPE[version].drill : {};
  // v1 (B): Performance vs. Target in tabs, so that the page fits one screen.
  const tabDefs = isV1(version) ? V1_SCOPE[version].eltTabs : undefined;
  const tabGroups = useMemo(() => (tabDefs ?? []).map((t) => groups.filter((g) => t.groups.includes(g.name)).flatMap((g) => g.metrics.map((m) => m.id))), [tabDefs, groups]);
  const tabStatus = useGroupStatus(tabGroups);
  const tabs: TabDef[] = (tabDefs ?? [{ id: 'all', label: '', groups: [] }]).map((t, i) => ({ id: t.id, label: t.label, status: tabDefs ? tabStatus[i] : undefined }));
  const [tab, openTab] = useTab(tabs);
  const shown = tabDefs ? groups.filter((g) => tabDefs.find((t) => t.id === tab)!.groups.includes(g.name)) : groups;
  const rows = useMemo(() => Object.fromEntries(ALL_IDS.map((id) => {
    const asOf = version === 'v1b' ? snapshotFor(id, period) : undefined;
    return [id, { ...row(id, metricValue(engine, id, asOf ?? period, compare, sel, 13)), asOf }];
  })) as Record<string, Row>, [engine, period, compare, sel, version]);
  const open = (id: string) => (DRILL[id] ? go(DRILL[id], {}, { drill: true }) : go('metric', { id }, { drill: true }));

  const [view, setView] = useState<'summary' | 'table'>('summary');
  const [grain, setGrain] = useState<TimeGrain>(grainOf(period.kind));
  useEffect(() => setGrain(grainOf(period.kind)), [period.kind]);
  const cols = useMemo(() => grainColumns(grain, period, ds.meta.windowStartMonth), [grain, period, ds.meta.windowStartMonth]);
  const grid = useMemo(() => Object.fromEntries(ALL_IDS.map((id) => [id, cols.map((c) => evaluate(METRIC_BY_ID[id], engine, c, sel))])) as Record<string, MetricResult[]>,
    [engine, cols, sel]);

  const [chosen, setChosen] = useState<Chosen>(() => ({ ids: DEFAULT_CHOSEN[version], color: Object.fromEntries(DEFAULT_CHOSEN[version].map((id, i) => [id, SERIES[i]])) }));
  const pick = useMetricPicker(chosen, setChosen);
  // v1 has no metric analysis pages: a row click puts the metric on (or takes it off) the trend chart.
  const onRow = v1 ? (id: string) => { const why = pick.blocked(id); if (why) toast(why); else pick.toggle(id); } : open;

  return (
    <div className="elt">
      <EltHeader />

      {version === 'v1b' ? <CadenceKpis /> : (
        <Sec id="elt-kpi" title="Key Performance Indicators" meta={period.label}>
          <div className={`elt-kpis ${v1 ? 'elt-kpis-3' : ''}`}>
            {kpis.map((id) => <KpiCard key={id} r={rows[id]} onOpen={!v1 ? () => open(id) : v1Drill[id] ? () => go(v1Drill[id], {}, { drill: true }) : undefined}
              hint={v1Drill[id] ? `Open ${PAGE_BY_ID[v1Drill[id]].label} ›` : undefined} />)}
          </div>
        </Sec>
      )}

      {!v1 && (
        <Sec id="elt-trend" title="Performance Trends" meta={`12 months ending ${monthPeriod(period.endMi).short}`}>
          <div className="elt-trends">
            {ELT_TRENDS.map((id) => <TrendCard key={id} r={rows[id]} onOpen={() => go('metric', { id }, { drill: true })} />)}
          </div>
        </Sec>
      )}

      <div className="elt-split">
        <Sec id="elt-target" title="Performance vs. Target" meta={view === 'summary' ? period.label : `${TIME_GRAIN_LABEL[grain]} · ${spanText(cols)}`}
          actions={(
            <>
              <span className="seg seg-xs" role="radiogroup" aria-label="Performance vs. Target view">
                <button type="button" role="radio" aria-checked={view === 'summary'} className={view === 'summary' ? 'on' : ''} onClick={() => setView('summary')}>Summary</button>
                <button type="button" role="radio" aria-checked={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
              </span>
              {view === 'table' && <>
                <GrainSelect grain={grain} setGrain={setGrain} />
                <ExportButton cols={cols} grid={grid} grain={grain} groups={groups} />
              </>}
            </>
          )}>
          {(() => {
            const table = view === 'summary'
              ? <TargetTable rows={rows} groups={shown} onOpen={onRow} pick={pick} rowAction={v1 ? 'trend' : 'analyze'} />
              : <PeriodTable cols={cols} grid={grid} groups={shown} onOpen={onRow} pick={pick} rowAction={v1 ? 'trend' : 'analyze'} />;
            return tabDefs ? <TabBox id="elt-pvt" tabs={tabs} current={tab} onOpen={openTab} label="Performance vs. Target areas">{table}</TabBox> : table;
          })()}
        </Sec>
        <Sec id="elt-selected" title="Selected Metric Trends" meta={`${TIME_GRAIN_LABEL[grain]} · ${spanText(cols)}`}
          actions={<GrainSelect grain={grain} setGrain={setGrain} />}>
          <SelectedTrend chosen={chosen} cols={cols} grid={grid} grain={grain} height={version === 'v1b' ? 236 : 300} />
        </Sec>
      </div>
    </div>
  );
}

/** "Oct 2025 to Sep 2026" for a list of period columns. */
function spanText(cols: Period[]): string {
  if (!cols.length) return 'No periods in the data window';
  const [a, b] = [cols[0], cols[cols.length - 1]];
  if (a.kind === 'week') return `Weeks ending ${longDayLabel(a.endDay)} to ${longDayLabel(b.endDay)}`;
  return cols.length === 1 ? a.label : `${a.label} to ${b.label}`;
}

/** Axis label of a period column: "09/26" for days and weeks, the short label otherwise. */
const axisLabel = (c: Period) => (c.grain ? shortDayLabel(c.endDay) : c.short);

function GrainSelect({ grain, setGrain }: { grain: TimeGrain; setGrain: (g: TimeGrain) => void }) {
  return (
    <select className="sel-xs" value={grain} onChange={(e) => setGrain(e.target.value as TimeGrain)} aria-label="Time scale">
      {(Object.keys(TIME_GRAIN_LABEL) as TimeGrain[]).map((g) => <option key={g} value={g}>{TIME_GRAIN_LABEL[g]}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------- header and slicers

function EltHeader() {
  const { ds, sel, valueLabel, period, periodStatus } = useApp();
  return (
    <header className="elt-head">
      <div className="elt-title">
        <h1>ELT Summary</h1>
        <p>Revenue Cycle Performance · {scopeText(sel, valueLabel, ds.dims.organization.name, ds.dims.facilities.length)} · {period.label}
          {periodStatus(period) === 'Preliminary' && <span className="pill pill-prelim">Preliminary</span>}</p>
        <GapLegend />
      </div>
      <EltSlicers />
    </header>
  );
}

function EltSlicers() {
  const { ds, period, setPeriodKind, sel, selectOnly, clearField, valueLabel, toast, version } = useApp();
  const scope = sel.facility?.length === 1 ? `f${sel.facility[0]}` : sel.region?.length === 1 && !sel.facility?.length ? `r${sel.region[0]}` : sel.facility?.length || sel.region?.length ? 'custom' : 'all';
  const setScope = (v: string) => {
    clearField('facility');
    clearField('region');
    if (v.startsWith('f')) selectOnly('facility', [Number(v.slice(1))]);
    if (v.startsWith('r')) selectOnly('region', [Number(v.slice(1))]);
  };
  const other = (Object.keys(sel) as SelField[]).filter((f) => f !== 'facility' && f !== 'region' && (sel[f]?.length ?? 0) > 0);
  return (
    <div className="elt-slicers no-print">
      {other.length > 0 && (
        <span className="elt-other" title={other.map((f) => `${FIELD_LABEL[f]}: ${sel[f]!.map((k) => valueLabel(f, k)).join(', ')}`).join('\n')}>
          Filtered: {other.map((f) => FIELD_LABEL[f]).join(', ')}
          <button type="button" className="icon-btn xs" aria-label="Clear additional filters" onClick={() => other.forEach(clearField)}><Icon name="close" size={9} /></button>
        </span>
      )}
      {version !== 'v1b' && (
        <label className="elt-slicer"><span>Period type</span>
          <select value={period.kind} onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}>
            {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>)}
          </select>
        </label>
      )}
      <label className="elt-slicer"><span>Period</span>
        <PeriodInput />
      </label>
      <label className="elt-slicer"><span>Hospital</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All hospitals</option>
          {scope === 'custom' && <option value="custom">Multiple selected</option>}
          <optgroup label="Region">{ds.dims.regions.map((r, i) => <option key={r} value={`r${i}`}>{r}</option>)}</optgroup>
          <optgroup label="Hospital">{ds.dims.facilities.map((f) => <option key={f.key} value={`f${f.key}`}>{f.short}</option>)}</optgroup>
        </select>
      </label>
      <span className="elt-actions">
        <button type="button" className="icon-btn" title="Copy link" onClick={() => {
          try { void navigator.clipboard?.writeText(location.href); } catch { /* clipboard blocked */ }
          toast('Link copied.');
        }}><Icon name="share" /></button>
        <button type="button" className="icon-btn" title="Export to PDF" onClick={() => window.print()}><Icon name="download" /></button>
      </span>
    </div>
  );
}

/** One ELT section. */
function Sec({ id, title, meta, actions, children }: { id: string; title: string; meta?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="elt-sec" aria-labelledby={id}>
      <div className="elt-sec-head">
        <h2 id={id}>{title}</h2>
        {meta && <span className="elt-meta">{meta}</span>}
        {actions && <span className="elt-sec-actions no-print">{actions}</span>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- shared cells

/** Change over three months, colored by whether the metric's direction makes it favorable. */
function Change3({ r }: { r: Row }) {
  const m = METRIC_BY_ID[r.id];
  if (r.d3 === null) return <span className="muted">–</span>;
  const flat = Math.abs(r.d3) <= FLAT[m.unit];
  const kind = flat ? null : changeOf(r.d3, 0, m.direction);
  return (
    <span className={`elt-chg ${kind === 'Favorable' ? 'fav' : kind === 'Unfavorable' ? 'unfav' : ''}`}>
      <span aria-hidden="true">{flat ? '▶' : r.d3 > 0 ? '▲' : '▼'}</span> {fmtDelta(r.d3, m.unit, m.digits)}
    </span>
  );
}

/** Target, or "No target set" when the client has not set one. */
function Target({ id, target }: { id: string; target: number | null }) {
  return target === null ? <span className="muted">No target set</span> : <>{fmtMetric(id, target)}</>;
}

function Variance({ r }: { r: Row }) {
  const m = METRIC_BY_ID[r.id];
  if (r.v.target === null) return <span className="muted">–</span>;
  return <span className={`elt-var v-${tone(r.v.status)}`}>{fmtDelta(r.v.variance_to_target, m.unit, m.digits)}</span>;
}

/** Value of a metric, or "–" with the reason as a tooltip (e.g. not calculated by day). */
function Cell({ id, r }: { id: string; r: { value: number | null; noData?: string } }) {
  return r.value === null ? <span className="muted" title={r.noData}>–</span> : <>{fmtMetric(id, r.value)}</>;
}

// ---------------------------------------------------------------- KPI cards

/** KPI card. With onOpen it opens the metric's analytics page; without it, it is display only. */
function KpiCard({ r, onOpen, hint }: { r: Row; onOpen?: () => void; hint?: string }) {
  const m = METRIC_BY_ID[r.id];
  const v = r.v;
  const click = onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter') onOpen(); }, title: `Analyze ${m.name}` } : {};
  return (
    <div className={`elt-kpi st-${tone(v.status)} ${onOpen ? 'elt-kpi-link' : 'elt-kpi-static'}`} {...click}>
      <div className="elt-kpi-name"><span>{shortLabel(r.id)}</span><span>{hint && <span className="elt-kpi-go">{hint}</span>}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={r.id} /></span></span></div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value"><Cell id={r.id} r={{ value: v.value, noData: v.no_data_reason }} /></span>
        <Sparkline values={v.trend.slice(-12).map((t) => t.value)} target={v.target} width={88} height={30} />
      </div>
      <dl className="elt-kpi-grid">
        <div><dt>Target</dt><dd><Target id={r.id} target={v.target} /></dd></div>
        <div><dt>Variance to target</dt><dd><Variance r={r} /></dd></div>
        <div><dt>3M change</dt><dd><Change3 r={r} /></dd></div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- v1 (B): cadence tabs and KPI cards

/**
 * The snapshot period for a metric that is not calculated for the selected period (A/R by month,
 * DNFB by week): the latest one on or before the period end. Undefined when no fallback is needed.
 */
function snapshotFor(id: string, p: Period): Period | undefined {
  const m = METRIC_BY_ID[id];
  if (!m.finest || !p.grain || validFor(m, p.grain)) return undefined;
  return latestSnapshotPeriod(m.finest, p.endDay);
}

/** Number of points on a KPI card sparkline, by period type. */
const SPARK_POINTS: Record<Cadence, number> = { day: 14, week: 13, month: 12 };

/** One metric on a v1 (B) KPI card: value and status for the period, change and a short trend. */
interface CardValue {
  id: string; value: number | null; target: number | null; status: Status; noData?: string;
  change: number | null; changeLabel: string; spark: (number | null)[]; asOf?: Period;
}

/**
 * Value of a metric on a card. Change: Daily compares with the same day last week (days of the
 * week differ too much to compare with the day before), Weekly with the prior week, Monthly with
 * three months earlier. A snapshot shown "as of" compares with its own prior period.
 */
function cardValue(id: string, p: Period, engine: ReturnType<typeof useApp>['engine'], sel: ReturnType<typeof useApp>['sel']): CardValue {
  const m = METRIC_BY_ID[id];
  const asOf = snapshotFor(id, p);
  const at = asOf ?? p;
  const kind = at.kind as Cadence;
  const cur = evaluate(m, engine, at, sel);
  const back = kind === 'day' ? 7 : kind === 'week' || asOf ? 1 : 3;
  const prev = evaluate(m, engine, shiftPeriod(at, back), sel).value;
  const changeLabel = kind === 'day' ? 'vs. same day last week' : kind === 'week' ? 'vs. prior week' : asOf ? 'vs. prior month' : '3M change';
  return {
    id, value: cur.value, target: cur.target, status: statusOf(cur.value, cur.target, m.direction, cur.watch), noData: cur.noData,
    change: cur.value !== null && prev !== null ? cur.value - prev : null, changeLabel,
    spark: trailing(at, SPARK_POINTS[kind]).map((x) => evaluate(m, engine, x, sel).value), asOf,
  };
}

/** Daily, Weekly and Monthly tabs. The tab sets the period type for the whole page. */
function CadenceKpis() {
  const { engine, period, sel, setPeriodKind, version } = useApp();
  const cadences = isV1(version) ? V1_SCOPE[version].cadences : undefined;
  const cadence: Cadence = (CADENCES as string[]).includes(period.kind) ? period.kind as Cadence : 'month';
  // A period type with no tab (quarter, year to date, rolling 12 months) opens the Monthly tab.
  useEffect(() => { if (cadence !== period.kind) setPeriodKind('month'); }, [cadence, period.kind, setPeriodKind]);
  const values = useMemo(() => {
    const ids = [...new Set((cadences?.[cadence].kpis ?? []).flatMap(kpiMetrics))];
    return Object.fromEntries(ids.map((id) => [id, cardValue(id, period, engine, sel)])) as Record<string, CardValue>;
  }, [cadences, cadence, period, engine, sel]);
  if (!cadences) return null;
  const tabs: TabDef[] = CADENCES.map((c) => ({ id: c, label: cadences[c].label }));
  return (
    <section className="elt-sec" aria-labelledby="elt-kpi">
      <div className="elt-sec-head">
        <h2 id="elt-kpi">Key Performance Indicators</h2>
        <span className="elt-meta">{period.label}</span>
      </div>
      <TabBox id="elt-cadence" tabs={tabs} current={cadence} onOpen={(id) => setPeriodKind(id as Cadence)} label="Key Performance Indicators by period">
        <div className="elt-kpis elt-kpis-3">
          {cadences[cadence].kpis.map((k, i) => <SpecCard key={`${cadence}-${i}`} k={k} values={values} />)}
        </div>
      </TabBox>
    </section>
  );
}

function SpecCard({ k, values }: { k: KpiSpec; values: Record<string, CardValue> }) {
  if (typeof k === 'string') return <MetricCard c={values[k]} />;
  if (k.kind === 'pair') return <MetricCard c={values[k.id]} secondary={values[k.secondary]} />;
  if (k.kind === 'dnfb-split') return <DnfbSplitCard values={values} />;
  if (k.kind === 'denial-worklist') return <DenialWorklistCard />;
  return <PlaceholderCard />;
}

const AsOf = ({ p }: { p?: Period }) => (p ? <span className="elt-asof" title={`Calculated by ${p.kind}: latest snapshot`}>As of {longDayLabel(p.endDay)}</span> : null);

/** Change, colored by whether the metric's direction makes it favorable. */
function ChangeCell({ c }: { c: CardValue }) {
  const m = METRIC_BY_ID[c.id];
  if (c.change === null) return <span className="muted">–</span>;
  const flat = Math.abs(c.change) <= FLAT[m.unit];
  const kind = flat ? null : changeOf(c.change, 0, m.direction);
  return (
    <span className={`elt-chg ${kind === 'Favorable' ? 'fav' : kind === 'Unfavorable' ? 'unfav' : ''}`}>
      <span aria-hidden="true">{flat ? '▶' : c.change > 0 ? '▲' : '▼'}</span> {fmtDelta(c.change, m.unit, m.digits)}
    </span>
  );
}

/** KPI card for one metric, with an optional second metric under the value (e.g. A/R $ under A/R days). */
function MetricCard({ c, secondary }: { c: CardValue; secondary?: CardValue }) {
  const m = METRIC_BY_ID[c.id];
  return (
    <div className={`elt-kpi elt-kpi-static st-${tone(c.status)}`}>
      <div className="elt-kpi-name">
        <span>{shortLabel(c.id)}{secondary && <> / {metricLabel(secondary.id)}</>}</span>
        <span><AsOf p={c.asOf} /><InfoIcon metricId={c.id} /></span>
      </div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value"><Cell id={c.id} r={{ value: c.value, noData: c.noData }} />
          {secondary && <span className="elt-kpi-sec">{metricLabel(secondary.id)} <b><Cell id={secondary.id} r={{ value: secondary.value, noData: secondary.noData }} /></b></span>}
        </span>
        <Sparkline values={c.spark} target={c.target} width={88} height={30} />
      </div>
      <dl className="elt-kpi-grid">
        <div><dt>Target</dt><dd><Target id={c.id} target={c.target} /></dd></div>
        <div><dt>Variance to target</dt><dd>{c.target === null || c.value === null ? <span className="muted">–</span>
          : <span className={`elt-var v-${tone(c.status)}`}>{fmtDelta(c.value - c.target, m.unit, m.digits)}</span>}</dd></div>
        <div><dt>{c.changeLabel}</dt><dd><ChangeCell c={c} /></dd></div>
      </dl>
    </div>
  );
}

/** DNFB in the EHR (not final billed) and in the scrubber (billed, not submitted): $ and days. */
function DnfbSplitCard({ values }: { values: Record<string, CardValue> }) {
  const parts = DNFB_SPLIT.map((x) => ({ ...x, d: values[x.dollars], t: values[x.days] }));
  const total = parts.every((x) => x.d.value !== null) ? parts.reduce((a, x) => a + (x.d.value ?? 0), 0) : null;
  const worst = parts.map((x) => x.t.status).find((st) => st === 'Off target') ?? parts.map((x) => x.t.status).find((st) => st === 'Watch') ?? parts[0].t.status;
  return (
    <div className={`elt-kpi elt-kpi-static st-${tone(worst)}`}>
      <div className="elt-kpi-name">
        <span><span className="elt-code">BL-07</span>DNFB ($ and days)</span>
        <span><AsOf p={parts[0].d.asOf} /><InfoIcon metricId="dnfb_dollars" /></span>
      </div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value">{total === null ? <span className="muted">–</span> : fmtMetric('dnfb_dollars', total)}<span className="elt-kpi-sec">Total, EHR and scrubber</span></span>
      </div>
      <table className="elt-split-tbl">
        <thead><tr><th className="al-left">Stage</th><th>$</th><th>Days</th><th>Target</th><th className="al-center">Status</th></tr></thead>
        <tbody>
          {parts.map((x) => (
            <tr key={x.label} title={`${METRIC_BY_ID[x.dollars].name}; ${METRIC_BY_ID[x.days].name}`}>
              <td className="al-left">{x.label}</td>
              <td><Cell id={x.dollars} r={{ value: x.d.value, noData: x.d.noData }} /></td>
              <td><b><Cell id={x.days} r={{ value: x.t.value, noData: x.t.noData }} /></b></td>
              <td className="muted"><Target id={x.days} target={x.t.target} /></td>
              <td className="al-center"><StatusMark status={x.t.status} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Open items in the denials worklist on the period's last day: denied $ and count. No target. */
function DenialWorklistCard() {
  const { engine, period, sel, ds } = useApp();
  const day = Math.min(period.endDay, ds.meta.asOfDay);
  const { amount, count } = useMemo(() => {
    const items = worklist(engine, { kind: 'denials', day }, sel);
    return { amount: items.reduce((a, x) => a + x.amount, 0), count: items.length };
  }, [engine, day, sel]);
  return (
    <div className="elt-kpi elt-kpi-static st-none">
      <div className="elt-kpi-name">
        <span>Denial worklist</span>
        <span><span className="elt-asof">As of {longDayLabel(day)}</span></span>
      </div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value">{fmt(amount, 'usd')}<span className="elt-kpi-sec">Open denied claims <b>{fmt(count, 'count')}</b></span></span>
      </div>
      <dl className="elt-kpi-grid">
        <div><dt>Open denied $</dt><dd>{fmt(amount, 'usd')}</dd></div>
        <div><dt>Open items</dt><dd>{fmt(count, 'count')}</dd></div>
        <div><dt>Target</dt><dd><span className="muted">No target set</span></dd></div>
      </dl>
    </div>
  );
}

/** A card kept for a daily KPI that is not chosen yet. */
function PlaceholderCard() {
  return (
    <div className="elt-kpi elt-kpi-static elt-kpi-placeholder" aria-label="Placeholder: metric to be confirmed">
      <div className="elt-kpi-name"><span>Placeholder</span></div>
      <div className="elt-kpi-mid"><span className="elt-kpi-value muted">Metric to be confirmed</span></div>
    </div>
  );
}

// ---------------------------------------------------------------- trends

function TrendCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const m = METRIC_BY_ID[r.id];
  const t = r.v.trend.slice(-12);
  const fm = (x: number) => fmt(x, m.unit, m.digits);
  const option = useMemo(() => eltTrendOption({ labels: t.map((x) => x.label), values: t.map((x) => x.value), target: r.v.target, fmt: fm, direction: m.direction }), [r]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="elt-trend">
      <div className="elt-trend-head">
        <span className="elt-trend-name">{shortLabel(r.id)}<GapMark id={r.id} /></span>
        <span className="elt-trend-kv"><span>Actual <b><Cell id={r.id} r={{ value: r.v.value, noData: r.v.no_data_reason }} /></b></span><span>Target <b>{fmtMetric(r.id, r.v.target)}</b></span></span>
      </div>
      <Chart height={150} ariaLabel={`${m.name}, monthly, 12 months`} option={option} onClick={onOpen} />
      <div className="elt-legend" aria-hidden="true"><i className="lg-line" />Actual<i className="lg-target" />Target<i className="lg-zone" />Off-target range</div>
    </div>
  );
}

// ---------------------------------------------------------------- metric picker (for the selected-metric trend)

interface Picker {
  chosen: Chosen;
  /** Why the metric cannot be added, or null. */
  blocked: (id: string) => string | null;
  toggle: (id: string) => void;
}

/**
 * Check a metric to put it on the selected-metric trend. A metric keeps its color while it is
 * checked (color follows the metric, not its position). Two units at most, eight lines at most.
 */
function useMetricPicker(chosen: Chosen, setChosen: (f: (c: Chosen) => Chosen) => void): Picker {
  const units = [...new Set(chosen.ids.map((id) => METRIC_BY_ID[id].unit))];
  const blocked = (id: string) => {
    if (chosen.ids.includes(id)) return null;
    if (chosen.ids.length >= SERIES.length) return `The chart shows ${SERIES.length} metrics at most. Clear one to add another.`;
    const u = METRIC_BY_ID[id].unit;
    if (units.length >= MAX_UNITS && !units.includes(u)) {
      return `The chart has two units already (${units.map((x) => UNIT_LABEL[x]).join(' and ')}). Clear the metrics in one unit to add a metric in ${UNIT_LABEL[u]}.`;
    }
    return null;
  };
  const toggle = (id: string) => setChosen((c) => {
    if (c.ids.includes(id)) {
      const { [id]: _, ...color } = c.color;
      return { ids: c.ids.filter((x) => x !== id), color };
    }
    const used = new Set(Object.values(c.color));
    return { ids: [...c.ids, id], color: { ...c.color, [id]: SERIES.find((x) => !used.has(x)) ?? SERIES[0] } };
  });
  return { chosen, blocked, toggle };
}

/** Checkbox that puts a metric on the selected-metric trend, with the metric's line color. */
function MetricCheck({ id, pick }: { id: string; pick: Picker }) {
  const on = pick.chosen.ids.includes(id);
  const why = pick.blocked(id);
  const name = METRIC_BY_ID[id].name;
  return (
    <label className={`elt-check ${why ? 'disabled' : ''}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      title={why ?? (on ? `Remove ${name} from the trend chart` : `Show ${name} on the trend chart`)}>
      <input type="checkbox" checked={on} disabled={!!why} onChange={() => pick.toggle(id)} aria-label={`Show ${name} on the trend chart`} />
      <i className="elt-swatch" style={on ? { background: pick.chosen.color[id] } : undefined} aria-hidden="true" />
    </label>
  );
}

// ---------------------------------------------------------------- performance vs. target: summary

/** What a row click does: open the metric's analysis, or put the metric on the trend chart (v1). */
type RowAction = 'analyze' | 'trend';
const rowTitle = (id: string, a: RowAction) => (a === 'trend' ? `Show or hide ${METRIC_BY_ID[id].name} on the trend chart` : `Analyze ${METRIC_BY_ID[id].name}`);

function TargetTable({ rows, groups, onOpen, pick, rowAction }: { rows: Record<string, Row>; groups: Group[]; onOpen: (id: string) => void; pick: Picker; rowAction: RowAction }) {
  return (
    <div className="elt-table">
      <table>
        <thead>
          <tr>
            <th className="al-left">Metric</th><th>Actual</th><th>Target</th><th>Variance to target</th>
            <th className="al-center">Status</th><th>3M change</th><th className="al-center">12-month trend</th><th className="al-left">Benchmark</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => [
            <tr key={g.name} className="elt-group"><td colSpan={8}>{g.name}</td></tr>,
            ...g.metrics.map((f) => {
              const r = rows[f.id];
              return (
                <tr key={f.id} className={`clickable ${rowAction === 'trend' && pick.chosen.ids.includes(f.id) ? 'elt-row-on' : ''}`} tabIndex={0} onClick={() => onOpen(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f.id); }} title={rowTitle(f.id, rowAction)}>
                  <td className="al-left elt-mname"><MetricCheck id={f.id} pick={pick} />{label(f.id)}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={f.id} /></span></td>
                  <td><b><Cell id={f.id} r={{ value: r.v.value, noData: r.v.no_data_reason }} /></b>{r.asOf && <span className="elt-asof" title={`Calculated by ${r.asOf.kind}: latest snapshot`}>as of {shortDayLabel(r.asOf.endDay)}</span>}</td>
                  <td className="muted"><Target id={f.id} target={r.v.target} /></td>
                  <td><Variance r={r} /></td>
                  <td className="al-center"><StatusMark status={r.v.status} compact /></td>
                  <td><Change3 r={r} /></td>
                  <td className="al-center"><Sparkline values={r.v.trend.slice(-12).map((t) => t.value)} target={r.v.target} width={72} height={20} /></td>
                  <td className="al-left muted">{f.benchmark ?? '–'}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- performance vs. target: period table

/** One metric per row, one column per period of the chosen time scale. Actual values only. */
function PeriodTable({ cols, grid, groups, onOpen, pick, rowAction }: { cols: Period[]; grid: Record<string, MetricResult[]>; groups: Group[]; onOpen: (id: string) => void; pick: Picker; rowAction: RowAction }) {
  if (!cols.length) return <div className="elt-table elt-none">No periods of this time scale in the data window.</div>;
  return (
    <div className="elt-table elt-ptable">
      <table>
        <thead>
          <tr>
            <th className="al-left elt-sticky">Metric</th><th>Target</th>
            {cols.map((c) => <th key={c.startDay} title={`${c.label}`}>{c.short}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => [
            <tr key={g.name} className="elt-group"><td className="elt-sticky">{g.name}</td><td colSpan={cols.length + 1} /></tr>,
            ...g.metrics.map((f) => (
              <tr key={f.id} className={`clickable ${rowAction === 'trend' && pick.chosen.ids.includes(f.id) ? 'elt-row-on' : ''}`} tabIndex={0} onClick={() => onOpen(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f.id); }} title={rowTitle(f.id, rowAction)}>
                <td className="al-left elt-mname elt-sticky"><MetricCheck id={f.id} pick={pick} />{label(f.id)}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={f.id} /></span></td>
                <td className="muted"><Target id={f.id} target={targetOf(grid[f.id])} /></td>
                {grid[f.id].map((r, i) => <td key={cols[i].startDay}><Cell id={f.id} r={r} /></td>)}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

/** The target shown in the period table: the latest period's target (static targets do not change). */
const targetOf = (rs: MetricResult[]) => [...rs].reverse().find((r) => r.target !== null)?.target ?? null;

/** CSV for Excel: the period table as shown (one metric per row), with the filters as context. */
function ExportButton({ cols, grid, grain, groups }: { cols: Period[]; grid: Record<string, MetricResult[]>; grain: TimeGrain; groups: Group[] }) {
  const { sel, valueLabel, ds, toast } = useApp();
  const run = () => {
    const columns = ['Group', 'Code', 'Metric', 'Unit', 'Target', ...cols.map((c) => c.label)];
    const out = groups.flatMap((g) => g.metrics.map((f) => {
      const m = METRIC_BY_ID[f.id];
      return [g.name, m.code, m.name, UNIT_LABEL[m.unit], fmtMetric(f.id, targetOf(grid[f.id])), ...grid[f.id].map((r) => (r.value === null ? '' : fmtMetric(f.id, r.value)))];
    }));
    const scope = scopeText(sel, valueLabel, ds.dims.organization.name, ds.dims.facilities.length);
    const other = (Object.keys(sel) as SelField[]).filter((x) => x !== 'facility' && x !== 'region' && (sel[x]?.length ?? 0) > 0)
      .map((x) => [FIELD_LABEL[x], sel[x]!.map((k) => valueLabel(x, k)).join('; ')]);
    downloadCsv('Performance vs. Target', { columns, rows: out }, [['Scope', scope], ['Time scale', TIME_GRAIN_LABEL[grain]], ['Periods', spanText(cols)], ...other,
      ['Blank cell', 'Not calculated for this time scale, or no data']]);
    toast(`Exported "Performance vs. Target" (${out.length} metrics × ${cols.length} periods).`);
  };
  return <button type="button" className="btn btn-sm" onClick={run} title="Download the table as a CSV file that opens in Excel"><Icon name="download" size={12} /> Export</button>;
}

// ---------------------------------------------------------------- selected metric trends

const AXIS_DIGITS: Partial<Record<Unit, number>> = { pct: 1, days: 0, ratio: 2 };

/** Lines for the metrics checked in Performance vs. Target. A second unit goes on the right axis. */
function SelectedTrend({ chosen, cols, grid, grain, height }: { chosen: Chosen; cols: Period[]; grid: Record<string, MetricResult[]>; grain: TimeGrain; height: number }) {
  const [showTargets, setShowTargets] = useState(true);
  const units = [...new Set(chosen.ids.map((id) => METRIC_BY_ID[id].unit))];
  const lines: TrendLine[] = chosen.ids.map((id) => ({
    name: `${metricLabel(id)}${gapStar(id)}`, color: chosen.color[id], axis: units.indexOf(METRIC_BY_ID[id].unit) as 0 | 1,
    data: grid[id].map((r) => r.value),
    // No target line for a metric that has no values at this time scale.
    target: grid[id].every((r) => r.value === null) ? undefined : grid[id].map((r) => r.target),
  }));
  const axes = units.map((u) => ({ name: UNIT_LABEL[u], fmt: (v: number) => fmt(v, u, AXIS_DIGITS[u]) }));
  const missing = chosen.ids.filter((id) => grid[id].every((r) => r.value === null));
  const option = useMemo(() => multiTrendOption({ labels: cols.map(axisLabel), lines, axes, showTargets }), [cols, chosen, grid, showTargets]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="elt-trend elt-multi">
      <div className="elt-trend-head">
        <span className="elt-trend-kv">{units.length === 2 ? <span>Left axis <b>{UNIT_LABEL[units[0]]}</b> · right axis <b>{UNIT_LABEL[units[1]]}</b></span> : null}</span>
        <label className="elt-trend-kv no-print"><input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} /> Targets</label>
      </div>
      {chosen.ids.length === 0 || !cols.length || missing.length === chosen.ids.length
        ? <div className="elt-none">{!cols.length ? 'No periods of this time scale in the data window.'
          : chosen.ids.length === 0 ? 'Click or check one or more metrics in Performance vs. Target to show their trend.'
          : 'No checked metric is calculated at this time scale. Check another metric or choose a longer time scale.'}</div>
        : <Chart height={height} ariaLabel={`${chosen.ids.map((id) => METRIC_BY_ID[id].name).join(', ')}: ${TIME_GRAIN_LABEL[grain].toLowerCase()} trend`} option={option} />}
      {missing.length > 0 && (
        <div className="elt-note">Not calculated at this time scale: {missing.map((id) => metricLabel(id)).join(', ')}. {grid[missing[0]].find((r) => r.noData)?.noData ?? ''}</div>
      )}
      <div className="elt-note muted">Solid line = actual · dashed line = target · click or check metrics in Performance vs. Target (two units at most)</div>
    </div>
  );
}
