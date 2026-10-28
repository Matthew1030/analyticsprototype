// ELT Summary ("See"): the executive view of revenue cycle performance.
//
// Built from standard BI components only: KPI cards, trend charts, a metric table with
// conditional formatting, a period-by-period table, a multi-metric trend, slicers, tooltips and
// drill-through. The page carries no explanatory prose: actual, target, variance and trend carry
// the message.
//
// Sections: Key Performance Indicators · Performance Trends · Performance vs. Target (the full
// ELT framework, as a summary or as a period table) · Selected Metric Trends (the metrics checked
// in Performance vs. Target). Every metric drills into Analytics. Metric names are the catalog
// names (Metric Dictionary): the full name in tables, the approved short name in compact places.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { eltItemId, visualItemId } from '../config/priorities';
import { shortDayLabel } from '../data/dates';
import { FIELD_LABEL, type SelField } from '../engine/engine';
import { FRAMEWORK, FRAMEWORK_BY_ID } from '../engine/framework';
import { evaluate, METRIC_BY_ID, UNIT_LABEL, type MetricResult, type Unit } from '../engine/metrics';
import { grainColumns, grainOf, longDayLabel, monthPeriod, PERIOD_KIND_LABEL, TIME_GRAIN_LABEL, type Period, type PeriodKind, type TimeGrain } from '../engine/periods';
import { changeOf, type Status } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { metricValue } from '../services/analytics';
import type { MetricValue } from '../services/contracts';
import { scopeText, useApp, type PageId } from '../state/AppState';
import { usePriorities, usePriorityItem } from '../state/Priorities';
import { Chart } from '../ui/Chart';
import { eltTrendOption, multiTrendOption, SERIES, type TrendLine } from '../ui/charts';
import { fmtMetric, InfoIcon, metricLabel, PeriodInput, Sparkline, StatusMark } from '../ui/common';
import { Icon } from '../ui/icons';
import { PriorityPicker } from '../ui/Priority';
import { downloadCsv } from '../ui/Visual';

/** Headline KPIs and trend charts (AR-06, AR-07, BL-08, CA-03, DN-04). */
export const ELT_KPIS = ['gross_ar_days', 'cash_pct_npsr', 'denial_dollar_rate', 'dnfb_days', 'ar_gt90_pct'];
const ELT_TRENDS = ['gross_ar_days', 'cash_pct_npsr', 'denial_dollar_rate'];
const ALL_IDS = FRAMEWORK.flatMap((g) => g.metrics.map((m) => m.id));
/** Metric on the selected-metric trend when the page opens. */
const DEFAULT_CHOSEN = ['gross_ar_days'];
/** Units that can share the selected-metric trend (left axis, right axis). */
const MAX_UNITS = 2;

/** Drill-through target: the analytical page for the metric, or Metric Analysis. */
const DRILL: Record<string, PageId> = {
  gross_ar_days: 'ar', ar_gt90_pct: 'ar', credit_balance_days: 'ar', dnfb_days: 'billing', cash_pct_npsr: 'cash',
  denial_dollar_rate: 'denials', avoidable_wo_pct_net: 'denials', avoidable_wo_unrealized_pct: 'denials',
};

/** A change smaller than this (per unit) is shown as flat. */
const FLAT = { days: 0.3, pct: 0.0005, usd: 0, count: 0, ratio: 0.01, sec: 1 } as const;

interface Row { id: string; v: MetricValue; d3: number | null }

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
  const { engine, period, compare, sel, go, ds } = useApp();
  const rows = useMemo(() => Object.fromEntries(ALL_IDS.map((id) => [id, row(id, metricValue(engine, id, period, compare, sel, 13))])) as Record<string, Row>,
    [engine, period, compare, sel]);
  const open = (id: string) => (DRILL[id] ? go(DRILL[id], {}, { drill: true }) : go('metric', { id }, { drill: true }));

  const [view, setView] = useState<'summary' | 'table'>('summary');
  const [grain, setGrain] = useState<TimeGrain>(grainOf(period.kind));
  useEffect(() => setGrain(grainOf(period.kind)), [period.kind]);
  const cols = useMemo(() => grainColumns(grain, period, ds.meta.windowStartMonth), [grain, period, ds.meta.windowStartMonth]);
  const grid = useMemo(() => Object.fromEntries(ALL_IDS.map((id) => [id, cols.map((c) => evaluate(METRIC_BY_ID[id], engine, c, sel))])) as Record<string, MetricResult[]>,
    [engine, cols, sel]);

  const [chosen, setChosen] = useState<Chosen>(() => ({ ids: DEFAULT_CHOSEN, color: Object.fromEntries(DEFAULT_CHOSEN.map((id, i) => [id, SERIES[i]])) }));
  const pick = useMetricPicker(chosen, setChosen);

  return (
    <div className="elt">
      <EltHeader />

      <Sec id="elt-kpi" title="Key Performance Indicators" meta={period.label}>
        <div className="elt-kpis">
          {ELT_KPIS.map((id) => <KpiCard key={id} r={rows[id]} onOpen={() => open(id)} />)}
        </div>
      </Sec>

      <Sec id="elt-trend" title="Performance Trends" meta={`12 months ending ${monthPeriod(period.endMi).short}`}>
        <div className="elt-trends">
          {ELT_TRENDS.map((id) => <TrendCard key={id} r={rows[id]} onOpen={() => go('metric', { id }, { drill: true })} />)}
        </div>
      </Sec>

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
                <ExportButton cols={cols} grid={grid} grain={grain} />
              </>}
            </>
          )}>
          {view === 'summary'
            ? <TargetTable rows={rows} onOpen={open} pick={pick} />
            : <PeriodTable cols={cols} grid={grid} onOpen={open} pick={pick} />}
        </Sec>
        <Sec id="elt-selected" title="Selected Metric Trends" meta={`${TIME_GRAIN_LABEL[grain]} · ${spanText(cols)}`}
          actions={<GrainSelect grain={grain} setGrain={setGrain} />}>
          <SelectedTrend chosen={chosen} cols={cols} grid={grid} grain={grain} />
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
      </div>
      <EltSlicers />
    </header>
  );
}

function EltSlicers() {
  const { ds, period, setPeriodKind, sel, selectOnly, clearField, valueLabel, toast } = useApp();
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
      <label className="elt-slicer"><span>Period type</span>
        <select value={period.kind} onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}>
          {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>)}
        </select>
      </label>
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

/** One ELT section. In prioritization mode it carries a release picker, like a visual. */
function Sec({ id, title, meta, actions, children }: { id: string; title: string; meta?: string; actions?: ReactNode; children: ReactNode }) {
  const { on } = usePriorities();
  const itemId = visualItemId('executive', title);
  const prio = usePriorityItem({ id: itemId, kind: 'visual', label: title, group: 'ELT Summary', page: 'executive' });
  return (
    <section className={`elt-sec ${prio.cls}`} aria-labelledby={id}>
      <div className="elt-sec-head">
        <h2 id={id}>{title}</h2>
        {on && <PriorityPicker id={itemId} label={title} tier={prio.tier} inherited={prio.inherited} />}
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

function Variance({ r }: { r: Row }) {
  const m = METRIC_BY_ID[r.id];
  return <span className={`elt-var v-${tone(r.v.status)}`}>{fmtDelta(r.v.variance_to_target, m.unit, m.digits)}</span>;
}

/** Value of a metric, or "–" with the reason as a tooltip (e.g. not calculated by day). */
function Cell({ id, r }: { id: string; r: { value: number | null; noData?: string } }) {
  return r.value === null ? <span className="muted" title={r.noData}>–</span> : <>{fmtMetric(id, r.value)}</>;
}

// ---------------------------------------------------------------- KPI cards

function KpiCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const m = METRIC_BY_ID[r.id];
  const v = r.v;
  return (
    <div role="button" tabIndex={0} className={`elt-kpi st-${tone(v.status)}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} title={`Analyze ${m.name}`}>
      <div className="elt-kpi-name"><span>{shortLabel(r.id)}</span><span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={r.id} /></span></div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value"><Cell id={r.id} r={{ value: v.value, noData: v.no_data_reason }} /></span>
        <Sparkline values={v.trend.slice(-12).map((t) => t.value)} target={v.target} width={88} height={30} />
      </div>
      <dl className="elt-kpi-grid">
        <div><dt>Target</dt><dd>{fmtMetric(r.id, v.target)}</dd></div>
        <div><dt>Variance to target</dt><dd><Variance r={r} /></dd></div>
        <div><dt>3M change</dt><dd><Change3 r={r} /></dd></div>
      </dl>
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
        <span className="elt-trend-name">{shortLabel(r.id)}</span>
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

function TargetTable({ rows, onOpen, pick }: { rows: Record<string, Row>; onOpen: (id: string) => void; pick: Picker }) {
  const { on: prioOn, decisions } = usePriorities();
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
          {FRAMEWORK.map((g) => [
            <tr key={g.name} className="elt-group"><td colSpan={8}>{g.name}</td></tr>,
            ...g.metrics.map((f) => {
              const r = rows[f.id];
              return (
                <tr key={f.id} className="clickable" tabIndex={0} onClick={() => onOpen(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f.id); }} title={`Analyze ${METRIC_BY_ID[f.id].name}`}>
                  <td className="al-left elt-mname"><MetricCheck id={f.id} pick={pick} />{label(f.id)}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={f.id} /></span>
                    {prioOn && <> <PriorityPicker id={eltItemId(f.id)} label={`${f.code} ${METRIC_BY_ID[f.id].name}`} tier={decisions[eltItemId(f.id)]?.tier} compact /></>}</td>
                  <td><b><Cell id={f.id} r={{ value: r.v.value, noData: r.v.no_data_reason }} /></b></td>
                  <td className="muted">{fmtMetric(f.id, r.v.target)}</td>
                  <td><Variance r={r} /></td>
                  <td className="al-center"><StatusMark status={r.v.status} compact /></td>
                  <td><Change3 r={r} /></td>
                  <td className="al-center"><Sparkline values={r.v.trend.slice(-12).map((t) => t.value)} target={r.v.target} width={72} height={20} /></td>
                  <td className="al-left muted">{f.benchmark}</td>
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
function PeriodTable({ cols, grid, onOpen, pick }: { cols: Period[]; grid: Record<string, MetricResult[]>; onOpen: (id: string) => void; pick: Picker }) {
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
          {FRAMEWORK.map((g) => [
            <tr key={g.name} className="elt-group"><td className="elt-sticky">{g.name}</td><td colSpan={cols.length + 1} /></tr>,
            ...g.metrics.map((f) => (
              <tr key={f.id} className="clickable" tabIndex={0} onClick={() => onOpen(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f.id); }} title={`Analyze ${METRIC_BY_ID[f.id].name}`}>
                <td className="al-left elt-mname elt-sticky"><MetricCheck id={f.id} pick={pick} />{label(f.id)}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={f.id} /></span></td>
                <td className="muted">{fmtMetric(f.id, targetOf(grid[f.id]))}</td>
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
function ExportButton({ cols, grid, grain }: { cols: Period[]; grid: Record<string, MetricResult[]>; grain: TimeGrain }) {
  const { sel, valueLabel, ds, toast } = useApp();
  const run = () => {
    const columns = ['Group', 'Code', 'Metric', 'Unit', 'Target', ...cols.map((c) => c.label)];
    const out = FRAMEWORK.flatMap((g) => g.metrics.map((f) => {
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
function SelectedTrend({ chosen, cols, grid, grain }: { chosen: Chosen; cols: Period[]; grid: Record<string, MetricResult[]>; grain: TimeGrain }) {
  const [showTargets, setShowTargets] = useState(true);
  const units = [...new Set(chosen.ids.map((id) => METRIC_BY_ID[id].unit))];
  const lines: TrendLine[] = chosen.ids.map((id) => ({
    name: metricLabel(id), color: chosen.color[id], axis: units.indexOf(METRIC_BY_ID[id].unit) as 0 | 1,
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
          : chosen.ids.length === 0 ? 'Check one or more metrics in Performance vs. Target to show their trend.'
          : 'No checked metric is calculated at this time scale. Check another metric or choose a longer time scale.'}</div>
        : <Chart height={300} ariaLabel={`${chosen.ids.map((id) => METRIC_BY_ID[id].name).join(', ')}: ${TIME_GRAIN_LABEL[grain].toLowerCase()} trend`} option={option} />}
      {missing.length > 0 && (
        <div className="elt-note">Not calculated at this time scale: {missing.map((id) => metricLabel(id)).join(', ')}. {grid[missing[0]].find((r) => r.noData)?.noData ?? ''}</div>
      )}
      <div className="elt-note muted">Solid line = actual · dashed line = target · check metrics in Performance vs. Target (two units at most)</div>
    </div>
  );
}
