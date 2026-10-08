// Metric Analysis (drill-through target for every KPI): trend, breakdown, contribution to
// change, peer comparison and small multiples. Answers what, where and why for one metric.

import { useMemo, useState } from 'react';
import type { FactName, SelField } from '../engine/engine';
import { FACILITY_TYPES } from '../engine/engine';
import { evaluate, METRIC_BY_ID, METRICS, RCM_AREAS } from '../engine/metrics';
import { comparePeriod, makePeriod, priorYearPeriod, ytdPeriod } from '../engine/periods';
import { changeOf, statusOf } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { breakdown, DIMENSION_LABEL, trend } from '../services/analytics';
import type { DimensionId } from '../services/contracts';
import { useApp, type PageId } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, waterfallOption } from '../ui/charts';
import { Delta, fmtMetric, MetricInfo, Sparkline, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { CanvasHeader, PAGE_BY_ID } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, TrendVisual, useMetric } from '../ui/widgets';

const DIMS_BY_FACT: Record<FactName, DimensionId[]> = {
  acc: ['facility', 'region', 'financialClass', 'payer', 'serviceLine', 'patientType'],
  ar: ['facility', 'region', 'financialClass', 'payer', 'arAge', 'accountStatus', 'serviceLine'],
  dnfb: ['facility', 'region', 'dnfbHold', 'serviceLine', 'patientType'],
  fe: ['facility', 'region', 'facilityType'],
  ops: ['facility', 'region', 'facilityType'],
};

export function MetricAnalysis() {
  const { route, go } = useApp();
  const id = METRIC_BY_ID[route.params.id] ? route.params.id : 'net_ar_days';
  const m = METRIC_BY_ID[id];
  const dims = [...DIMS_BY_FACT[m.fact], ...(m.area === 'Denials' ? ['denialCategory', 'rootCause'] as DimensionId[] : [])];
  const isAdditive = m.unit === 'usd' || m.unit === 'count';
  const page = m.page as PageId;

  return (
    <div className="page">
      <CanvasHeader title={m.code ? `${m.code} · ${m.name}` : m.name} question={m.definition}
        right={(
          <div className="metric-switch">
            <label className="fld inline">Metric
              <select value={id} onChange={(e) => go('metric', { id: e.target.value })}>
                {RCM_AREAS.map((a) => (
                  <optgroup key={a} label={a}>
                    {METRICS.filter((x) => x.area === a).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            {page !== 'executive' && <button type="button" className="btn btn-sm" onClick={() => go(page, {}, { drill: true })}>Open {PAGE_BY_ID[page].label} <Icon name="chevronRight" size={10} /></button>}
            {(m.fact === 'ar' || m.area === 'Denials') && (
              <button type="button" className="btn btn-sm" onClick={() => go('accounts', { mode: m.fact === 'ar' ? 'open' : 'denied' }, { drill: true })}><Icon name="table" size={12} /> View accounts</button>
            )}
          </div>
        )} />
      <div className="row cols-4-8">
        <MetricSummary id={id} />
        <TrendVisual id={id} months={18} height={250} />
      </div>
      <div className="row cols-2">
        <BreakdownVisual id={id} dim="facility" title={`${m.short ?? m.name} by hospital`} onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />
        <BreakdownVisual key={id} id={id} dim={dims.includes('payer') ? 'payer' : dims[1]} dims={dims.filter((d) => d !== 'facility')} top={12} />
      </div>
      <div className="row cols-2">
        {isAdditive ? <ContributionBridge id={id} /> : <ChangeByHospital id={id} />}
        <PeerComparison id={id} />
      </div>
      <SmallMultiples id={id} />
    </div>
  );
}

function MetricSummary({ id }: { id: string }) {
  const { engine, period, sel, compare } = useApp();
  const m = METRIC_BY_ID[id];
  const v = useMetric(id, 0);
  const ytd = useMemo(() => (m.type === 'flow' ? evaluate(m, engine, ytdPeriod(period.endMi), sel).value : null), [m, engine, period, sel]);
  const pyYtd = useMemo(() => (m.type === 'flow' ? evaluate(m, engine, priorYearPeriod(ytdPeriod(period.endMi)), sel).value : null), [m, engine, period, sel]);
  const fm = (x: number | null) => fmt(x, m.unit, m.digits);
  const rows: [string, React.ReactNode][] = [
    ['Target', v.target === null ? 'None' : `${m.direction === 'up' ? '≥' : '≤'} ${fm(v.target)}`],
    ['Variance to target', v.variance_to_target === null ? '–' : <span className={v.status === 'On target' ? 'txt-ok' : v.status === 'Watch' ? 'txt-watch' : 'txt-off'}>{fmtDelta(v.variance_to_target, m.unit, m.digits)}</span>],
    [`${compare === 'py' ? 'Prior year' : 'Prior period'} (${v.compare_period})`, fm(v.compare_value)],
    ['Change', <Delta key="d" d={v.change} unit={m.unit} kind={v.change_kind} digits={m.digits} />],
    ['Same period last year', fm(v.prior_year_value)],
    ...(m.type === 'flow' ? [['Year to date', fm(ytd)] as [string, React.ReactNode], ['Prior year to date', fm(pyYtd)] as [string, React.ReactNode]] : []),
  ];
  return (
    <Visual title={`${period.label}`} subtitle={`${m.area} · ${m.type === 'balance' ? 'balance at period end' : 'activity in period'}`} metricId={id}
      table={{ columns: ['Measure', 'Value'], rows: [['Actual', fm(v.value)], ...rows.map(([k, x]) => [k, typeof x === 'string' ? x : ''])] }}
      spec={{ type: 'KPI summary panel', metrics: [id], interactions: 'Values follow the filter pane' }}>
      <div className="summary">
        <div className="summary-value">{fm(v.value)}</div>
        <div className="summary-status"><StatusMark status={v.status} /></div>
        <dl className="kv">{rows.map(([k, x]) => <div key={k} className="kv-row"><dt>{k}</dt><dd>{x}</dd></div>)}</dl>
        <details className="summary-def"><summary>Definition and calculation</summary><div className="info-static"><MetricInfo m={m} /></div></details>
      </div>
    </Visual>
  );
}

/** Additive metrics: what moved the total from the comparison period to the current period. */
function ContributionBridge({ id }: { id: string }) {
  const { engine, period, compare, sel } = useApp();
  const m = METRIC_BY_ID[id];
  const [dim, setDim] = useState<DimensionId>('facility');
  const rows = useMemo(() => breakdown(engine, id, dim, period, compare, sel), [engine, id, dim, period, compare, sel]);
  const cp = comparePeriod(period, compare);
  const start = rows.reduce((a, r) => a + (r.compare_value ?? 0), 0);
  const end = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const steps = rows.filter((r) => r.change !== null && Math.abs(r.change) > 0).sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!));
  const top = steps.slice(0, 7);
  const other = steps.slice(7).reduce((a, r) => a + (r.change ?? 0), 0);
  const fm = (v: number) => fmt(v, m.unit, m.digits);
  return (
    <Visual title="Contribution to change" metricId={id}
      subtitle={`${cp.short} to ${period.short}: which ${DIMENSION_LABEL[dim].toLowerCase()} drove the change`}
      actions={(
        <select className="sel-xs" value={dim} onChange={(e) => setDim(e.target.value as DimensionId)} aria-label="Contribution by">
          {(['facility', 'financialClass', 'payer', 'serviceLine'] as DimensionId[]).filter((d) => DIMS_BY_FACT[m.fact].includes(d)).map((d) => <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>)}
        </select>
      )}
      table={{ columns: [DIMENSION_LABEL[dim], cp.short, period.short, 'Change'], rows: steps.map((r) => [r.label, fm(r.compare_value ?? 0), fm(r.value ?? 0), fmtDelta(r.change, m.unit)]) }}
      spec={{ type: 'Waterfall (variance bridge)', metrics: [id], dimensions: [DIMENSION_LABEL[dim]], interactions: 'Choose the bridge dimension' }}>
      <Chart height={260} ariaLabel="Contribution to change"
        option={waterfallOption({ start: { label: cp.short, value: start }, steps: [...top.map((r) => ({ label: r.label, value: r.change! })), ...(Math.abs(other) > 0 ? [{ label: 'All other', value: other }] : [])], end: { label: period.short, value: end }, fmt: fm })} />
    </Visual>
  );
}

/** Ratio metrics: change by hospital over a chosen horizon, sorted by size. */
function ChangeByHospital({ id }: { id: string }) {
  const { engine, period, compare, sel, selectOnly, ds } = useApp();
  const m = METRIC_BY_ID[id];
  const [horizon, setHorizon] = useState<'cmp' | '3' | '6' | '12'>('cmp');
  const cp = horizon === 'cmp' ? comparePeriod(period, compare) : makePeriod(period.kind === 'quarter' ? 'month' : period.kind, period.endMi - Number(horizon));
  const cur = horizon === 'cmp' || period.kind !== 'quarter' ? period : makePeriod('month', period.endMi);
  const rows = useMemo(() => {
    const facs = engine.facilitySet(sel);
    return ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => {
      const s = { ...sel, facility: [f.key] };
      const v = evaluate(m, engine, cur, s).value;
      const c = evaluate(m, engine, cp, s).value;
      return { key: f.key, label: f.short, value: v, compare_value: c, change: v !== null && c !== null ? v - c : null };
    }).filter((r) => r.change !== null).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  }, [engine, m, cur, cp, sel, ds]);
  const fd = (v: number) => fmtDelta(v, m.unit, m.digits);
  return (
    <Visual title="Change by hospital" metricId={id} subtitle={`${cur.short} vs ${cp.short} · ${m.direction === 'down' ? 'positive = worse' : m.direction === 'up' ? 'positive = better' : 'no preferred direction'} · click to filter`}
      actions={(
        <select className="sel-xs" value={horizon} onChange={(e) => setHorizon(e.target.value as typeof horizon)} aria-label="Change horizon">
          <option value="cmp">vs comparison period</option>
          <option value="3">vs 3 months earlier</option>
          <option value="6">vs 6 months earlier</option>
          <option value="12">vs 12 months earlier</option>
        </select>
      )}
      table={{ columns: ['Hospital', cp.short, cur.short, 'Change'], rows: rows.map((r) => [r.label, fmtMetric(id, r.compare_value), fmtMetric(id, r.value), fd(r.change!)]) }}
      spec={{ type: 'Diverging bar chart with horizon selector', metrics: [id], dimensions: ['Hospital'], interactions: 'Choose horizon; click filters to the hospital' }}>
      <Chart height={Math.max(180, rows.length * 24 + 30)} ariaLabel="Change by hospital"
        option={barOption({
          labels: rows.map((r) => r.label), horizontal: true, fmt: fd, axisFmt: fd,
          series: [{ name: 'Change', data: rows.map((r) => r.change) }],
          colorBy: (i) => (changeOf(rows[i].value, rows[i].compare_value, m.direction) === 'Unfavorable' ? '#eb6834' : '#2a78d6'),
        })}
        onClick={(i) => selectOnly('facility', [rows[i].key])} />
      <div className="legend-row"><span className="swatch" style={{ background: '#eb6834' }} /> Unfavorable <span className="swatch" style={{ background: '#2a78d6' }} /> Favorable or no direction</div>
    </Visual>
  );
}

interface PeerRow { key: number; name: string; type: string; value: number | null; peer: number | null; system: number | null; target: number | null; status: ReturnType<typeof statusOf> }

/** Each hospital vs its peer group (same facility type) and vs the whole system. */
function PeerComparison({ id }: { id: string }) {
  const { engine, period, sel, ds, go } = useApp();
  const m = METRIC_BY_ID[id];
  const rows = useMemo(() => {
    const base: typeof sel = { ...sel, facility: [], region: [], facilityType: [] };
    const system = evaluate(m, engine, period, base).value;
    const peer = FACILITY_TYPES.map((_, ti) => evaluate(m, engine, period, { ...base, facilityType: [ti] }).value);
    const facs = engine.facilitySet(sel);
    return ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => {
      const r = evaluate(m, engine, period, { ...base, facility: [f.key] });
      return { key: f.key, name: f.short, type: f.type, value: r.value, peer: peer[FACILITY_TYPES.indexOf(f.type)], system, target: r.target, status: statusOf(r.value, r.target, m.direction, r.watch) } as PeerRow;
    });
  }, [m, engine, period, sel, ds]);
  const fm = (v: number | null) => fmt(v, m.unit, m.digits);
  const cols: GridColumn<PeerRow>[] = [
    { key: 'name', label: 'Hospital', value: (r) => r.name, width: 150 },
    { key: 'type', label: 'Peer group', value: (r) => r.type, align: 'left' },
    { key: 'value', label: 'Actual', value: (r) => r.value, format: fm, status: (r) => r.status },
    { key: 'peer', label: 'Peer group', value: (r) => r.peer, format: fm, info: 'Same metric for all hospitals of the same facility type (ignores hospital and region filters).' },
    { key: 'vsPeer', label: 'vs peer', value: (r) => (r.value !== null && r.peer !== null ? r.value - r.peer : null), render: (r) => <Delta d={r.value !== null && r.peer !== null ? r.value - r.peer : null} unit={m.unit} digits={m.digits} kind={changeOf(r.value, r.peer, m.direction)} /> },
    { key: 'system', label: 'System', value: (r) => r.system, format: fm },
    { key: 'status', label: 'Status', value: (r) => r.status ?? '', align: 'left', render: (r) => <StatusMark status={r.status} /> },
  ];
  const rowsG = rows.map((r) => ({ id: String(r.key), data: r }));
  return (
    <Visual title="Peer comparison" metricId={id} subtitle="Hospital vs peer group (same facility type) and system · click to open the hospital profile"
      table={gridExport(cols, rowsG)} spec={{ type: 'Table with conditional formatting', metrics: [id], dimensions: ['Hospital', 'Facility type'], interactions: 'Row click drills through to Hospital Profile' }}>
      <Grid caption="Peer comparison" columns={cols} rows={rowsG} dense defaultSort={{ key: 'value', dir: m.direction === 'up' ? 'asc' : 'desc' }}
        onRowClick={(r) => go('facility', { id: String(r.key) }, { drill: true })} />
    </Visual>
  );
}

/** Small multiples: the metric trend for every hospital on its own scale, with target. */
function SmallMultiples({ id }: { id: string }) {
  const { engine, period, sel, ds, toggle } = useApp();
  const m = METRIC_BY_ID[id];
  const facs = engine.facilitySet({ ...sel, facility: [] });
  const data = useMemo(() => ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => ({
    f, t: trend(engine, id, period.endMi, 13, { ...sel, facility: [f.key] as number[] }),
  })), [engine, id, period.endMi, sel, ds, facs]);
  const chosen = sel.facility ?? [];
  return (
    <Visual title={`${m.short ?? m.name}: 13-month trend by hospital`} metricId={id} subtitle="Small multiples, each on its own scale · dashed line = target · click to filter"
      table={{ columns: ['Hospital', ...(data[0]?.t.map((x) => x.label) ?? [])], rows: data.map((d) => [d.f.short, ...d.t.map((x) => fmtMetric(id, x.value))]) }}
      spec={{ type: 'Small multiples (sparkline grid)', metrics: [id], dimensions: ['Hospital', 'Month'], interactions: 'Click toggles the hospital filter' }}>
      <div className="multiples">
        {data.map(({ f, t }) => {
          const last = t[t.length - 1];
          const st = statusOf(last?.value ?? null, last?.target ?? null, m.direction, null);
          return (
            <button type="button" key={f.key} className={`multiple ${chosen.includes(f.key) ? 'on' : ''}`} onClick={() => toggle('facility' as SelField, f.key)}>
              <span className="multiple-head"><span className="multiple-name">{f.short}</span><span className={`multiple-val ${st === 'On target' ? 'txt-ok' : st ? 'txt-off' : ''}`}>{fmtMetric(id, last?.value ?? null)}</span></span>
              <Sparkline values={t.map((x) => x.value)} target={m.target ? null : last?.target} width={168} height={40} />
            </button>
          );
        })}
      </div>
    </Visual>
  );
}
