// Reusable analytical widgets built on the analytics service. Each one reads the global
// filter context, so every page cross-filters the same way.

import { useMemo, useState } from 'react';
import type { SelField, Selections } from '../engine/engine';
import { METRIC_BY_ID, RCM_AREAS, type RcmArea } from '../engine/metrics';
import { STATUS_RANK } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { breakdown, DIMENSION_LABEL, members, metricValue, trend } from '../services/analytics';
import type { BreakdownRow, DimensionId, MetricValue } from '../services/contracts';
import { useApp } from '../state/AppState';
import { Chart } from './Chart';
import { barOption, COMPARE, lineOption, SERIES } from './charts';
import { Delta, InfoIcon, Sparkline, StatusMark } from './common';
import { Grid, gridExport, type GridColumn, type GridRow } from './Grid';
import { Icon } from './icons';
import { Visual, type VisualSpec } from './Visual';

/** Catalog name with the framework code in front (e.g. "P1 · Gross A/R days"). */
const codeName = (id: string) => `${METRIC_BY_ID[id].code ? `${METRIC_BY_ID[id].code} · ` : ''}${METRIC_BY_ID[id].name}`;

const f = (id: string) => (v: number | null) => fmt(v, METRIC_BY_ID[id].unit, METRIC_BY_ID[id].digits);

/** Memoized metric value for the current context. */
export function useMetric(id: string, trendMonths = 13, selOverride?: Selections): MetricValue {
  const { engine, period, compare, sel } = useApp();
  const s = selOverride ?? sel;
  return useMemo(() => metricValue(engine, id, period, compare, s, trendMonths), [engine, id, period, compare, s, trendMonths]);
}

// ---------------------------------------------------------------- KPI card

export function KpiCard({ id, onOpen, selOverride }: { id: string; onOpen?: () => void; selOverride?: Selections }) {
  const { go, compare } = useApp();
  const m = METRIC_BY_ID[id];
  const v = useMetric(id, 13, selOverride);
  const open = onOpen ?? (() => go('metric', { id }, { drill: true }));
  const fm = f(id);
  return (
    <div className="kpi" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      title={`Analyze ${m.name}`}>
      <div className="kpi-top">
        <span className="kpi-name">{m.code ? `${m.code} · ` : ''}{m.short ?? m.name}</span>
        <span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={id} /></span>
      </div>
      {v.value === null ? <div className="kpi-nodata">{v.no_data_reason}</div> : (
        <>
          <div className="kpi-mid">
            <span className="kpi-value">{fm(v.value)}</span>
            <Sparkline values={v.trend.map((t) => t.value)} target={m.target ? null : v.target} width={78} height={24} />
          </div>
          <div className="kpi-row">
            {v.target !== null ? (
              <span className="kpi-target">Target {fm(v.target)} <span className="muted">·</span> <span className={v.status === 'On target' ? 'txt-ok' : v.status === 'Watch' ? 'txt-watch' : 'txt-off'}>{fmtDelta(v.variance_to_target, m.unit, m.digits)}</span></span>
            ) : <span className="muted">No target</span>}
            <StatusMark status={v.status} compact />
          </div>
          <div className="kpi-row">
            <Delta d={v.change} unit={m.unit} kind={v.change_kind} digits={m.digits} suffix={`vs ${compare === 'py' ? 'PY' : v.compare_period}`} />
          </div>
        </>
      )}
    </div>
  );
}

export function KpiStrip({ ids, selOverride }: { ids: string[]; selOverride?: Selections }) {
  return <div className="kpi-strip" style={{ gridTemplateColumns: `repeat(${ids.length}, minmax(0, 1fr))` }}>{ids.map((id) => <KpiCard key={id} id={id} selOverride={selOverride} />)}</div>;
}

// ---------------------------------------------------------------- Scorecard

interface ScoreRow { v: MetricValue; area: RcmArea | '' ; label: string }

export function Scorecard({ ids, title, groupByArea = true, selOverride, spec, showPy = true }: { ids: string[]; title: string; groupByArea?: boolean; selOverride?: Selections; spec?: VisualSpec; showPy?: boolean }) {
  const { engine, period, compare, sel, go } = useApp();
  const s = selOverride ?? sel;
  const vals = useMemo(() => ids.map((id) => metricValue(engine, id, period, compare, s, 13)), [ids, engine, period, compare, s]);
  const cmpLabel = compare === 'py' ? 'Prior year' : vals[0]?.compare_period ?? 'Prior';
  const cols: GridColumn<ScoreRow>[] = [
    { key: 'metric', label: 'Metric', value: (r) => r.label, width: 210, render: (r) => r.v.metric
      ? <span className="metric-cell">{r.label}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={r.v.metric} /></span></span>
      : <b>{r.label}</b> },
    { key: 'actual', label: period.short, text: period.label, value: (r) => r.v.value, format: (v, r) => (r.v.metric ? <b>{f(r.v.metric)(v)}</b> : ''), exportText: (r) => (r.v.metric ? f(r.v.metric)(r.v.value) : '') },
    { key: 'target', label: 'Target', value: (r) => r.v.target, format: (v, r) => (r.v.metric ? f(r.v.metric)(v) : ''), exportText: (r) => (r.v.metric ? f(r.v.metric)(r.v.target) : '') },
    { key: 'var', label: 'Var. to target', value: (r) => r.v.variance_to_target, status: (r) => r.v.status,
      format: (v, r) => (r.v.metric ? fmtDelta(v, METRIC_BY_ID[r.v.metric].unit, METRIC_BY_ID[r.v.metric].digits) : '') },
    { key: 'status', label: 'Status', value: (r) => (r.v.status ? STATUS_RANK[r.v.status] : null), render: (r) => (r.v.metric ? <StatusMark status={r.v.status} compact /> : null), exportText: (r) => r.v.status ?? '', align: 'center', info: 'Circle = on target, triangle = watch, diamond = off target. Hover for the label.' },
    { key: 'cmp', label: cmpLabel, value: (r) => r.v.compare_value, format: (v, r) => (r.v.metric ? f(r.v.metric)(v) : '') },
    { key: 'chg', label: 'Change', value: (r) => r.v.change, render: (r) => (r.v.metric ? <Delta d={r.v.change} unit={METRIC_BY_ID[r.v.metric].unit} kind={r.v.change_kind} digits={METRIC_BY_ID[r.v.metric].digits} /> : null),
      exportText: (r) => (r.v.metric ? fmtDelta(r.v.change, METRIC_BY_ID[r.v.metric].unit) : '') },
    ...(compare === 'prior' && showPy ? [{ key: 'py', label: 'Prior year', value: (r: ScoreRow) => r.v.prior_year_value, format: (v: number | null, r: ScoreRow) => (r.v.metric ? f(r.v.metric)(v) : '') }] : []),
    { key: 'trend', label: '13-month trend', value: () => null, sortable: false, align: 'center', width: 100,
      render: (r) => (r.v.metric ? <Sparkline values={r.v.trend.map((t) => t.value)} target={METRIC_BY_ID[r.v.metric].target ? null : r.v.target} /> : null), exportText: () => '' },
  ];
  const rows: GridRow<ScoreRow>[] = groupByArea
    ? RCM_AREAS.filter((a) => vals.some((v) => v.rcm_area === a)).map((a) => ({
      id: a, kind: 'subtotal' as const, data: { area: a, label: a, v: { metric: '' } as MetricValue },
      children: vals.filter((v) => v.rcm_area === a).map((v) => ({ id: v.metric, data: { v, area: a, label: codeName(v.metric) } })),
    }))
    : vals.map((v) => ({ id: v.metric, data: { v, area: v.rcm_area, label: codeName(v.metric) } }));
  return (
    <Visual title={title} subtitle={`${period.label} vs ${cmpLabel} · click a metric to analyze it`} table={gridExport(cols, rows)}
      spec={spec ?? { type: 'Scorecard table (grouped, expandable)', metrics: ids, interactions: 'Row click opens Metric Analysis (drill-through)' }}>
      <Grid caption={title} columns={cols} rows={rows} defaultExpanded dense
        onRowClick={(r) => { if (r.v.metric) go('metric', { id: r.v.metric }, { drill: true }); }} />
    </Visual>
  );
}

// ---------------------------------------------------------------- Trend

export function TrendVisual({ id, months = 18, title, height = 240, selOverride, compareSel, compareLabel }: {
  id: string; months?: number; title?: string; height?: number; selOverride?: Selections; compareSel?: Selections; compareLabel?: string;
}) {
  const { engine, period, sel, setPeriod } = useApp();
  const s = selOverride ?? sel;
  const m = METRIC_BY_ID[id];
  const [showPy, setShowPy] = useState(true);
  const [showR3, setShowR3] = useState(false);
  const t = useMemo(() => trend(engine, id, period.endMi, months, s), [engine, id, period.endMi, months, s]);
  const peer = useMemo(() => (compareSel ? trend(engine, id, period.endMi, months, compareSel) : null), [engine, id, period.endMi, months, compareSel]);
  const fm = f(id);
  const hasTarget = t.some((x) => x.target !== null);
  const series = [
    { name: m.short ?? m.name, data: t.map((x) => x.value), color: SERIES[0] },
    ...(peer ? [{ name: compareLabel ?? 'Comparison', data: peer.map((x) => x.value), color: SERIES[2] }] : []),
    ...(showPy ? [{ name: 'Prior year', data: t.map((x) => x.prior_year), color: COMPARE }] : []),
    ...(showR3 ? [{ name: 'Rolling 3-month', data: t.map((x) => x.rolling_3), color: SERIES[1] }] : []),
  ];
  const sIdx = t.findIndex((x) => x.period === `${Math.floor(period.endMi / 12)}-${String((period.endMi % 12) + 1).padStart(2, '0')}`);
  const noData = t.every((x) => x.value === null) ? 'No data for the current filters.' : null;
  return (
    <Visual title={title ?? `${m.name} trend`} metricId={id} noData={noData}
      subtitle={`Monthly, ${t.length} months to ${period.short} · click a month to set the period`}
      table={{ columns: ['Month', m.name, 'Target', 'Prior year', 'Rolling 3-month'], rows: t.map((x) => [x.label, fm(x.value), fm(x.target), fm(x.prior_year), fm(x.rolling_3)]) }}
      actions={(
        <span className="toggles">
          <label><input type="checkbox" checked={showPy} onChange={(e) => setShowPy(e.target.checked)} /> PY</label>
          <label><input type="checkbox" checked={showR3} onChange={(e) => setShowR3(e.target.checked)} /> R3</label>
        </span>
      )}
      spec={{ type: 'Line chart with target and comparison overlays', metrics: [id], dimensions: ['Month'], interactions: 'Click a month to set the report period; PY and rolling-3 toggles' }}>
      <Chart height={height} ariaLabel={`${m.name} monthly trend`}
        option={lineOption({ labels: t.map((x) => x.label), series, fmt: fm, target: hasTarget ? (m.target ? t.map((x) => x.target) : t[t.length - 1]?.target) : null, selectedIndex: sIdx >= 0 ? sIdx : undefined, dashed: ['Prior year'] })}
        onClick={(i) => setPeriod('month', Number(t[i].period.slice(0, 4)) * 12 + Number(t[i].period.slice(5)) - 1)} />
    </Visual>
  );
}

// ---------------------------------------------------------------- Breakdown (click to filter)

export function BreakdownVisual({ id, dim: dimProp, dims, title, height, top, showCompare = true, sortBy = 'value', subtitle, onDrill, spec, filterField }: {
  id: string; dim: DimensionId; dims?: DimensionId[]; title?: string; height?: number; top?: number; showCompare?: boolean;
  sortBy?: 'value' | 'natural' | 'change'; subtitle?: string; onDrill?: (key: number) => void; spec?: VisualSpec;
  /** Field that a click filters (defaults to the dimension). */
  filterField?: SelField;
}) {
  const { engine, period, compare, sel, toggle } = useApp();
  const [mode, setMode] = useState<'filter' | 'drill'>('filter');
  const [dim, setDim] = useState<DimensionId>(dimProp);
  const m = METRIC_BY_ID[id];
  const rows = useMemo(() => breakdown(engine, id, dim, period, compare, sel), [engine, id, dim, period, compare, sel]);
  let list = rows.filter((r) => r.value !== null);
  if (sortBy === 'value') list = [...list].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (sortBy === 'change') list = [...list].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
  const more = top && list.length > top ? list.length - top : 0;
  if (top) list = list.slice(0, top);
  const fm = f(id);
  const field = filterField ?? (dim as SelField);
  const chosen = sel[field] ?? [];
  const selectedIdx = list.map((r, i) => (chosen.includes(r.key) ? i : -1)).filter((i) => i >= 0);
  const target = list.find((r) => r.target !== null)?.target ?? null;
  const horizontal = sortBy !== 'natural';
  const noData = list.length === 0 ? (evaluateReason(rows) ?? 'No data for the current filters.') : null;
  const cmpName = compare === 'py' ? 'Prior year' : 'Prior period';
  return (
    <Visual title={title ?? `${m.short ?? m.name} by ${DIMENSION_LABEL[dim].toLowerCase()}`} metricId={id} noData={noData}
      subtitle={subtitle ?? `${period.label} · click to ${mode === 'drill' ? 'drill through' : 'filter'}${more ? ` · top ${top} of ${top! + more}` : ''}`}
      actions={dims ? (
        <select className="sel-xs" value={dim} onChange={(e) => setDim(e.target.value as DimensionId)} aria-label="Break down by">
          {dims.map((d) => <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>)}
        </select>
      ) : onDrill && (
        <span className="seg seg-xs" role="radiogroup" aria-label="Click action">
          <button type="button" role="radio" aria-checked={mode === 'filter'} className={mode === 'filter' ? 'on' : ''} onClick={() => setMode('filter')} title="Click filters the page">Filter</button>
          <button type="button" role="radio" aria-checked={mode === 'drill'} className={mode === 'drill' ? 'on' : ''} onClick={() => setMode('drill')} title="Click opens the detail page"><Icon name="drill" size={11} /> Drill</button>
        </span>
      )}
      table={{ columns: [DIMENSION_LABEL[dim], m.name, cmpName, 'Change', ...(m.unit === 'usd' || m.unit === 'count' ? ['Share'] : [])], rows: list.map((r) => [r.label, fm(r.value), fm(r.compare_value), fmtDelta(r.change, m.unit, m.digits), ...(r.share !== null ? [fmt(r.share, 'pct')] : [])]) }}
      spec={spec ?? { type: horizontal ? 'Bar chart (horizontal, sorted)' : 'Column chart', metrics: [id], dimensions: [DIMENSION_LABEL[dim]], interactions: `Click toggles a ${DIMENSION_LABEL[dim]} filter (cross-filters every visual)${onDrill ? '; Drill mode opens the detail page' : ''}` }}>
        <Chart height={height ?? (horizontal ? Math.max(150, list.length * (showCompare ? 30 : 24) + 44) : 230)} ariaLabel={`${m.name} by ${DIMENSION_LABEL[dim]}`}
          option={barOption({
            labels: list.map((r) => r.label), horizontal, fmt: fm, target, selected: selectedIdx,
            series: showCompare
              ? [{ name: cmpName, data: list.map((r) => r.compare_value), color: COMPARE }, { name: period.short, data: list.map((r) => r.value), color: SERIES[0] }]
              : [{ name: period.short, data: list.map((r) => r.value), color: SERIES[0] }],
            labels_on: true,
          })}
          onClick={(i) => (mode === 'drill' && onDrill ? onDrill(list[i].key) : toggle(field, list[i].key))} />
    </Visual>
  );
}

function evaluateReason(rows: BreakdownRow[]): string | null {
  return rows.length === 0 ? 'No members match the current filters.' : null;
}

// ---------------------------------------------------------------- Decomposition tree

export interface DecompLevel { dim: DimensionId; key: number }

/**
 * Decomposition tree: split a measure level by level. The user picks the next dimension at
 * each level (like an analyst would) and the chosen path can be applied as filters.
 */
export function DecompositionTree({ id, dims, initial, title }: { id: string; dims: DimensionId[]; initial?: DimensionId[]; title: string }) {
  const { engine, period, compare, sel, selectOnly, toast } = useApp();
  const m = METRIC_BY_ID[id];
  const fm = f(id);
  const [order, setOrder] = useState<DimensionId[]>(initial ?? dims.slice(0, 1));
  const [path, setPath] = useState<number[]>([]);
  const total = useMemo(() => metricValue(engine, id, period, compare, sel, 0), [engine, id, period, compare, sel]);

  const levels = order.slice(0, path.length + 1).map((dim, li) => {
    const s: Selections = { ...sel };
    for (let k = 0; k < li; k++) s[order[k] as SelField] = [path[k]];
    const rows = breakdown(engine, id, dim, period, compare, s).filter((r) => r.value !== null && (r.value ?? 0) > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return { dim, rows };
  });
  const used = new Set(order.slice(0, path.length + 1));
  const nextOptions = dims.filter((d) => !used.has(d));
  const pick = (li: number, key: number) => {
    const p = path.slice(0, li);
    p[li] = key;
    setPath(p);
    if (order.length <= li + 1 && nextOptions.length) setOrder([...order.slice(0, li + 1), dims.find((d) => !order.slice(0, li + 1).includes(d))!]);
  };
  const setDimAt = (li: number, dim: DimensionId) => {
    setOrder([...order.slice(0, li), dim]);
    setPath(path.slice(0, li));
  };
  const apply = () => {
    path.forEach((k, i) => selectOnly(order[i] as SelField, [k]));
    toast(`Applied ${path.length} filter${path.length === 1 ? '' : 's'} from the decomposition path.`);
  };
  const exportRows = levels.flatMap((l, li) => l.rows.map((r) => [`Level ${li + 1}: ${DIMENSION_LABEL[l.dim]}`, r.label, fm(r.value), fmt(r.share, 'pct')]));
  return (
    <Visual title={title} metricId={id}
      subtitle={<>{m.name}, {period.label}: <b>{fm(total.value)}</b> · click a node to split it by the next dimension</>}
      table={{ columns: ['Level', 'Member', m.name, 'Share of parent'], rows: exportRows }}
      actions={path.length > 0 && (
        <span className="tree-actions">
          <button type="button" className="btn btn-sm" onClick={() => { setPath([]); setOrder(initial ?? dims.slice(0, 1)); }}>Reset</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={apply}><Icon name="filter" size={12} /> Apply path as filters</button>
        </span>
      )}
      spec={{ type: 'Decomposition tree', metrics: [id], dimensions: dims.map((d) => DIMENSION_LABEL[d]), interactions: 'Click node to expand; choose the split dimension per level; apply path as filters' }}>
      <div className="decomp">
        <div className="decomp-col decomp-root">
          <div className="decomp-head">Total</div>
          <div className="decomp-node on root"><span className="decomp-label">All</span><span className="decomp-val">{fm(total.value)}</span><span className="decomp-bar"><i style={{ width: '100%' }} /></span></div>
        </div>
        {levels.map((l, li) => {
          const max = Math.max(...l.rows.map((r) => r.value ?? 0), 1);
          const parentVal = l.rows.reduce((a, r) => a + (r.value ?? 0), 0);
          const avail = dims.filter((d) => d === l.dim || !order.slice(0, li).includes(d));
          return (
            <div className="decomp-col" key={li}>
              <div className="decomp-head">
                <select value={l.dim} onChange={(e) => setDimAt(li, e.target.value as DimensionId)} aria-label={`Split level ${li + 1} by`}>
                  {avail.map((d) => <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>)}
                </select>
              </div>
              <div className="decomp-list">
                {l.rows.slice(0, 9).map((r) => (
                  <button type="button" key={r.key} className={`decomp-node ${path[li] === r.key ? 'on' : ''}`} onClick={() => pick(li, r.key)}
                    title={`${r.label}: ${fm(r.value)} (${fmt(parentVal ? (r.value ?? 0) / parentVal : null, 'pct')} of parent)`}>
                    <span className="decomp-label">{r.label}</span>
                    <span className="decomp-val">{fm(r.value)}</span>
                    <span className="decomp-bar"><i style={{ width: `${(100 * (r.value ?? 0)) / max}%` }} /></span>
                  </button>
                ))}
                {l.rows.length > 9 && <span className="muted small decomp-more">+{l.rows.length - 9} more</span>}
              </div>
            </div>
          );
        })}
        {path.length === levels.length && nextOptions.length === 0 && <div className="decomp-end muted small">End of path. Apply the path as filters, or open the accounts.</div>}
      </div>
    </Visual>
  );
}

/** Members helper for pages. */
export { members };
