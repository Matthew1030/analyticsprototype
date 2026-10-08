// Enterprise overview parts: the analytical scorecard, the ranked exception list and the hospital
// matrix. They used to sit on the executive page; they now live in Analytics (Revenue Cycle
// Overview), where dense, comparative detail belongs.

import { useMemo } from 'react';
import { FACILITY_TYPES } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { comparePeriod } from '../engine/periods';
import { changeOf, statusOf, type Status } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { trend } from '../services/analytics';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barLineOption, COMPARE, SERIES } from '../ui/charts';
import { Delta, fmtMetric, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { Visual } from '../ui/Visual';

export const EXEC_KPIS = [
  'net_ar_days', 'gross_ar', 'net_ar', 'npsr', 'cash', 'cash_pct_npsr', 'denial_rate', 'clean_claim_rate',
  'dnfb_days', 'dnfb_dollars', 'bad_debt_pct', 'charity_pct', 'cost_to_collect',
];
export const MATRIX_KPIS = ['net_ar_days', 'cash_pct_npsr', 'denial_rate', 'clean_claim_rate', 'dnfb_days', 'ar_gt90_pct', 'cost_to_collect'];

// ---------------------------------------------------------------- attention list

interface Flag { fac: number; facName: string; id: string; value: number; target: number; status: Status; gap: number; impact: number; change: number | null }

/** Largest misses against target by hospital: the "where to look first" list. */
export function AttentionList() {
  const { engine, period, compare, sel, ds, go, selectOnly } = useApp();
  const flags = useMemo(() => {
    const out: Flag[] = [];
    const facs = engine.facilitySet(sel);
    const cp = comparePeriod(period, compare);
    const npsr = ds.dims.facilities.map((f) => evaluate(METRIC_BY_ID.npsr, engine, period, { ...sel, facility: [f.key] }).value ?? 0);
    const avg = npsr.reduce((a, b) => a + b, 0) / Math.max(1, npsr.length);
    for (const f of ds.dims.facilities) {
      if (facs && !facs.has(f.key)) continue;
      for (const id of MATRIX_KPIS) {
        const m = METRIC_BY_ID[id];
        const s = { ...sel, facility: [f.key] };
        const r = evaluate(m, engine, period, s);
        if (r.value === null || r.target === null) continue;
        const st = statusOf(r.value, r.target, m.direction, r.watch);
        if (st !== 'Off target') continue;
        const prev = evaluate(m, engine, cp, s).value;
        const gap = Math.abs(r.value - r.target) / Math.abs(r.target);
        out.push({ fac: f.key, facName: f.short, id, value: r.value, target: r.target, status: st, gap, impact: gap * Math.sqrt(npsr[f.key] / (avg || 1)), change: prev === null ? null : r.value - prev });
      }
    }
    return out.sort((a, b) => b.impact - a.impact).slice(0, 12);
  }, [engine, period, compare, sel, ds]);

  const cols: GridColumn<Flag>[] = [
    { key: 'fac', label: 'Hospital', value: (r) => r.facName, width: 140 },
    { key: 'metric', label: 'Metric', value: (r) => METRIC_BY_ID[r.id].short ?? METRIC_BY_ID[r.id].name, align: 'left' },
    { key: 'value', label: 'Actual', value: (r) => r.value, format: (_, r) => fmtMetric(r.id, r.value), status: (r) => r.status },
    { key: 'target', label: 'Target', value: (r) => r.target, format: (_, r) => fmtMetric(r.id, r.target) },
    { key: 'gap', label: 'Gap', value: (r) => r.gap, format: (v) => fmt(v, 'pct', 0), info: 'Distance from target as a share of the target. The list is ranked by gap weighted by hospital size (square root of NPSR share), so large hospitals with material misses come first.' },
    { key: 'chg', label: `vs ${comparePeriod(period, compare).short}`, value: (r) => r.change, render: (r) => {
      const m = METRIC_BY_ID[r.id];
      return <Delta d={r.change} unit={m.unit} digits={m.digits} kind={changeOf(r.change === null ? null : r.value, r.change === null ? null : r.value - r.change, m.direction)} />;
    }, exportText: (r) => fmtDelta(r.change, METRIC_BY_ID[r.id].unit) },
  ];
  const rows: GridRow<Flag>[] = flags.map((f) => ({ id: `${f.fac}-${f.id}`, data: f }));
  return (
    <Visual title="Where to look first" subtitle={`Hospital metrics off target in ${period.label}, ranked by gap × hospital size · click to analyze`}
      info="Lists hospital and metric pairs that miss the Watch threshold, ranked by the size of the gap relative to target. The trend compares with the comparison period."
      table={gridExport(cols, rows)} noData={rows.length ? null : 'No hospital metric is off target for the current filters.'}
      spec={{ type: 'Exception table (ranked)', metrics: MATRIX_KPIS, dimensions: ['Hospital'], interactions: 'Row click filters to the hospital and opens Metric Analysis' }}>
      <Grid caption="Where to look first" columns={cols} rows={rows} dense
        onRowClick={(r) => { selectOnly('facility', [r.fac]); go('metric', { id: r.id }, { drill: true }); }} />
    </Visual>
  );
}

// ---------------------------------------------------------------- facility matrix

interface MRow { key: number; name: string; region: string; type: string; isRegion?: boolean; vals: Record<string, { v: number | null; st: Status; t: number | null }> }

/** Hospitals x key metrics with status coloring, grouped by region with region subtotals. */
export function FacilityMatrix({ title = 'Hospital performance matrix' }: { title?: string }) {
  const { engine, period, sel, ds, go, compare } = useApp();
  const facs = engine.facilitySet(sel);
  const rows = useMemo(() => {
    const calc = (s: typeof sel) => Object.fromEntries(MATRIX_KPIS.map((id) => {
      const m = METRIC_BY_ID[id];
      const r = evaluate(m, engine, period, s);
      return [id, { v: r.value, t: r.target, st: statusOf(r.value, r.target, m.direction, r.watch) }];
    }));
    return ds.dims.regions.map((rg, ri) => {
      const kids = ds.dims.facilities.filter((f) => f.region === ri && (!facs || facs.has(f.key)));
      if (!kids.length) return null;
      return {
        id: `r${ri}`, kind: 'subtotal' as const,
        data: { key: -1 - ri, name: rg, region: rg, type: '', isRegion: true, vals: calc({ ...sel, facility: kids.map((k) => k.key) }) } as MRow,
        children: kids.map((f) => ({ id: `f${f.key}`, data: { key: f.key, name: f.short, region: rg, type: f.type, vals: calc({ ...sel, facility: [f.key] }) } as MRow })),
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [engine, period, sel, ds, facs]);
  const total: MRow = useMemo(() => ({
    key: -99, name: 'Total (filtered)', region: '', type: '',
    vals: Object.fromEntries(MATRIX_KPIS.map((id) => {
      const m = METRIC_BY_ID[id];
      const r = evaluate(m, engine, period, sel);
      return [id, { v: r.value, t: r.target, st: statusOf(r.value, r.target, m.direction, r.watch) }];
    })),
  }), [engine, period, sel]);

  const cols: GridColumn<MRow>[] = [
    { key: 'name', label: 'Region / hospital', value: (r) => r.name, width: 190, render: (r) => (r.isRegion ? <b>{r.name}</b> : <span>{r.name} <span className="muted small">{r.type === 'Critical Access' ? 'CAH' : ''}</span></span>) },
    ...MATRIX_KPIS.map((id) => ({
      key: id, label: METRIC_BY_ID[id].short ?? METRIC_BY_ID[id].name, metricId: id,
      value: (r: MRow) => r.vals[id].v,
      render: (r: MRow) => <span className={`cell-status st-${r.vals[id].st === 'On target' ? 'ok' : r.vals[id].st === 'Watch' ? 'watch' : r.vals[id].st ? 'off' : 'none'}`}>{fmtMetric(id, r.vals[id].v)}</span>,
      exportText: (r: MRow) => fmtMetric(id, r.vals[id].v),
    })),
    { key: 'overall', label: 'Overall', align: 'left' as const, value: (r) => overallRank(r), render: (r) => <OverallStatus r={r} />, exportText: (r) => overallText(r) },
  ];
  return (
    <Visual title={title} subtitle={`${period.label} · cell color = status against target · click a hospital to open its profile`}
      info="Overall status: Off target if three or more metrics are off target; Watch if one or two are off target or three or more are on watch; otherwise On target."
      table={gridExport(cols, rows, total)}
      spec={{ type: 'Matrix table with conditional formatting, grouped by region (expand/collapse, subtotals)', metrics: MATRIX_KPIS, dimensions: ['Region', 'Hospital'], interactions: `Row click drills through to Hospital Profile; sort any column; compare = ${compare}` }}>
      <Grid caption={title} columns={cols} rows={rows} total={total} defaultExpanded
        onRowClick={(r) => { if (!r.isRegion) go('facility', { id: String(r.key) }, { drill: true }); }} />
      <div className="legend-row">
        <span className="cell-status st-ok">On target</span><span className="cell-status st-watch">Watch</span><span className="cell-status st-off">Off target</span>
        <span className="muted small">Facility types: {FACILITY_TYPES.join(', ')}. CAH = Critical Access Hospital.</span>
      </div>
    </Visual>
  );
}

function counts(r: MRow) {
  const sts = Object.values(r.vals).map((x) => x.st);
  return { off: sts.filter((s) => s === 'Off target').length, watch: sts.filter((s) => s === 'Watch').length };
}
/** Overall: Off target when 3+ metrics are off; Watch when 1–2 are off or 3+ are on watch. */
export function overallStatus(off: number, watch: number): Status {
  return off >= 3 ? 'Off target' : off >= 1 || watch >= 3 ? 'Watch' : 'On target';
}
function overallRank(r: MRow) { const c = counts(r); return c.off * 10 + c.watch; }
function overallText(r: MRow) { const c = counts(r); return `${overallStatus(c.off, c.watch)} (${c.off} off, ${c.watch} watch)`; }
function OverallStatus({ r }: { r: MRow }) {
  const c = counts(r);
  return <span className="overall"><StatusMark status={overallStatus(c.off, c.watch)} /> <span className="muted small">{c.off} off · {c.watch} watch</span></span>;
}

// ---------------------------------------------------------------- cash vs goal

export function CashVsGoal({ months = 13 }: { months?: number }) {
  const { engine, period, sel, setPeriod } = useApp();
  const cash = useMemo(() => trend(engine, 'cash', period.endMi, months, sel), [engine, period.endMi, months, sel]);
  const pct = useMemo(() => trend(engine, 'cash_pct_npsr', period.endMi, months, sel), [engine, period.endMi, months, sel]);
  const f = (v: number | null) => fmt(v, 'usd');
  return (
    <Visual title="Cash collected vs cash goal" metricId="cash"
      subtitle={`Monthly · goal = ${'98%'} of lagged NPSR · click a month to set the period`}
      table={{ columns: ['Month', 'Cash collected', 'Cash goal', 'Variance', 'Cash % NPSR'], rows: cash.map((c, i) => [c.label, f(c.value), f(c.target), c.value !== null && c.target !== null ? f(c.value - c.target) : '–', fmt(pct[i].value, 'pct')]) }}
      spec={{ type: 'Column chart with goal line (single $ axis)', metrics: ['cash', 'cash_goal'], dimensions: ['Month'], interactions: 'Click a month to set the period' }}>
      <Chart height={240} ariaLabel="Cash collected vs cash goal by month"
        option={barLineOption({ labels: cash.map((c) => c.label), bars: [{ name: 'Cash collected', data: cash.map((c) => c.value), color: SERIES[0] }], lines: [{ name: 'Cash goal', data: cash.map((c) => c.target), color: '#4b5361' }, { name: 'Cash, prior year', data: cash.map((c) => c.prior_year), color: COMPARE }], fmt: f, selectedIndex: cash.length - 1 })}
        onClick={(i) => setPeriod('month', Number(cash[i].period.slice(0, 4)) * 12 + Number(cash[i].period.slice(5)) - 1)} />
    </Visual>
  );
}
