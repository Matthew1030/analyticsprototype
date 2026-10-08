// Cash and Collections: are we on track to hit the cash goal?

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { monthPeriod, priorPeriod, ytdPeriod, priorYearPeriod } from '../engine/periods';
import { statusOf } from '../engine/status';
import { fmt, fmtDelta, usd } from '../format';

const relPct = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v * 100).toFixed(1)}%`);
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { COMPARE, lineOption, SERIES } from '../ui/charts';
import { StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, TrendVisual } from '../ui/widgets';
import { CashVsGoal } from './ExecutiveOverview';

export function Cash() {
  const { go } = useApp();
  return (
    <div className="page">
      <CanvasHeader />
      <KpiStrip ids={['cash', 'cash_pct_npsr', 'net_collection_rate', 'payment_variance_pct', 'pos_collections', 'cost_to_collect']} />
      <div className="row cols-2">
        <CashVsGoal months={18} />
        <MonthPace />
      </div>
      <YtdByHospital />
      <div className="row cols-3">
        <BreakdownVisual id="cash" dim="payer" title="Collections by payer" top={12} />
        <BreakdownVisual id="cash_pct_npsr" dim="facility" title="Cash % NPSR by hospital" onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />
        <BreakdownVisual id="net_collection_rate" dim="financialClass" title="Net collection rate by financial class" />
      </div>
      <div className="row cols-2">
        <TrendVisual id="cash_pct_npsr" months={18} />
        <TrendVisual id="net_collection_rate" months={18} />
      </div>
    </div>
  );
}

/** Cumulative cash through the month vs the previous month and the goal pace. */
function MonthPace() {
  const { engine, period, sel } = useApp();
  const cur = monthPeriod(period.endMi);
  const prev = priorPeriod(cur);
  const goal = evaluate(METRIC_BY_ID.cash_goal, engine, cur, sel).value ?? 0;
  const series = useMemo(() => {
    const cum = (p: typeof cur) => {
      const out: number[] = [];
      for (let d = p.startDay; d <= p.endDay; d++) {
        out.push(engine.sum('acc', 'payAmt', 'payD', p.startDay, d, sel) + engine.sum('acc', 'pos', 'dd', p.startDay, d, sel));
      }
      return out;
    };
    return { cur: cum(cur), prev: cum(prev) };
  }, [engine, cur.key, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Math.max(series.cur.length, series.prev.length);
  const labels = Array.from({ length: n }, (_, i) => String(i + 1));
  const pace = labels.map((_, i) => (goal * (i + 1)) / series.cur.length);
  const end = series.cur[series.cur.length - 1] ?? 0;
  const pct = goal ? end / goal : null;
  const st = statusOf(end, goal, 'up', goal * 0.97);
  return (
    <Visual title={`Month-to-date pace, ${cur.label}`} metricId="cash"
      subtitle={<>Cumulative cash by day of month · {usd(end)} of {usd(goal)} goal ({fmt(pct, 'pct', 1)}) <StatusMark status={st} /></>}
      table={{ columns: ['Day', cur.short, prev.short, 'Goal pace'], rows: labels.map((l, i) => [l, usd(series.cur[i] ?? 0), usd(series.prev[i] ?? 0), usd(pace[i])]) }}
      spec={{ type: 'Cumulative line chart vs goal pace', metrics: ['cash', 'cash_goal'], dimensions: ['Day of month'], interactions: 'Follows the report month; hover for daily values' }}>
      <Chart height={250} ariaLabel="Cumulative cash by day of month"
        option={lineOption({ labels, fmt: usd, dashed: ['Goal pace'], series: [
          { name: cur.short, data: series.cur, color: SERIES[0] },
          { name: prev.short, data: series.prev, color: COMPARE },
          { name: 'Goal pace', data: pace, color: '#4b5361' },
        ] })} />
    </Visual>
  );
}

interface YRow { key: number; name: string; month: number | null; monthGoal: number | null; ytd: number | null; ytdGoal: number | null; pyYtd: number | null; pct: number | null; isRegion?: boolean }

/** YTD cash vs goal by hospital, grouped by region with subtotals. */
function YtdByHospital() {
  const { engine, period, sel, ds, go } = useApp();
  const ytd = ytdPeriod(period.endMi);
  const pyYtd = priorYearPeriod(ytd);
  const cm = monthPeriod(period.endMi);
  const facs = engine.facilitySet(sel);
  const calc = (s: Selections, name: string, key: number, isRegion = false): YRow => {
    const c = (p: typeof ytd) => evaluate(METRIC_BY_ID.cash, engine, p, s);
    const y = c(ytd);
    const mo = c(cm);
    return { key, name, isRegion, month: mo.value, monthGoal: mo.target, ytd: y.value, ytdGoal: y.target, pyYtd: c(pyYtd).value, pct: evaluate(METRIC_BY_ID.cash_pct_npsr, engine, ytd, s).value };
  };
  const rows: GridRow<YRow>[] = useMemo(() => ds.dims.regions.map((rg, ri) => {
    const kids = ds.dims.facilities.filter((f) => f.region === ri && (!facs || facs.has(f.key)));
    if (!kids.length) return null;
    return {
      id: `r${ri}`, kind: 'subtotal' as const, data: calc({ ...sel, facility: kids.map((k) => k.key) }, rg, -1 - ri, true),
      children: kids.map((f) => ({ id: `f${f.key}`, data: calc({ ...sel, facility: [f.key] }, f.short, f.key) })),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null), [engine, period, sel, ds, facs]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => calc(sel, 'Total', -99), [engine, period, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const varPct = (a: number | null, g: number | null) => (a !== null && g ? a / g - 1 : null);
  const st = (a: number | null, g: number | null) => statusOf(a, g, 'up', g === null ? null : g * 0.97);
  const cols: GridColumn<YRow>[] = [
    { key: 'name', label: 'Region / hospital', value: (r) => r.name, width: 190, render: (r) => (r.isRegion ? <b>{r.name}</b> : r.name) },
    { key: 'm', label: 'Cash', group: cm.label, value: (r) => r.month, format: (v) => usd(v ?? 0) },
    { key: 'mg', label: 'Goal', group: cm.label, value: (r) => r.monthGoal, format: (v) => usd(v ?? 0) },
    { key: 'mv', label: 'Var %', group: cm.label, value: (r) => varPct(r.month, r.monthGoal), format: relPct, status: (r) => st(r.month, r.monthGoal) },
    { key: 'y', label: 'Cash', group: `Year to date (${ytd.short.replace('YTD ', 'Jan–')})`, value: (r) => r.ytd, format: (v) => <b>{usd(v ?? 0)}</b>, exportText: (r) => usd(r.ytd ?? 0), bar: true },
    { key: 'yg', label: 'Goal', group: `Year to date (${ytd.short.replace('YTD ', 'Jan–')})`, value: (r) => r.ytdGoal, format: (v) => usd(v ?? 0) },
    { key: 'yv', label: 'Variance', group: `Year to date (${ytd.short.replace('YTD ', 'Jan–')})`, value: (r) => (r.ytd !== null && r.ytdGoal !== null ? r.ytd - r.ytdGoal : null), format: (v) => fmtDelta(v, 'usd'), status: (r) => st(r.ytd, r.ytdGoal) },
    { key: 'yvp', label: 'Var %', group: `Year to date (${ytd.short.replace('YTD ', 'Jan–')})`, value: (r) => varPct(r.ytd, r.ytdGoal), format: relPct },
    { key: 'py', label: 'vs PY YTD', value: (r) => varPct(r.ytd, r.pyYtd), format: relPct, info: 'YTD cash vs the same months last year (relative change).' },
    { key: 'pct', label: 'Cash % NPSR (YTD)', value: (r) => r.pct, format: (v) => fmt(v, 'pct'), metricId: 'cash_pct_npsr' },
    { key: 'st', label: 'YTD status', value: (r) => st(r.ytd, r.ytdGoal) ?? '', align: 'left', render: (r) => <StatusMark status={st(r.ytd, r.ytdGoal)} /> },
  ];
  return (
    <Visual title="Cash vs goal by hospital: month and year to date" subtitle="Grouped by region with subtotals · Watch = within 3% of goal · click a hospital to open its profile"
      table={gridExport(cols, rows, total)}
      spec={{ type: 'Matrix table: column groups, region subtotals, data bars, status text', metrics: ['cash', 'cash_goal', 'cash_pct_npsr'], dimensions: ['Region', 'Hospital'], interactions: 'Expand/collapse regions; sort; row click drills to Hospital Profile' }}>
      <Grid caption="Cash vs goal by hospital" columns={cols} rows={rows} total={total} defaultExpanded
        onRowClick={(r) => { if (!r.isRegion && r.key >= 0) go('facility', { id: String(r.key) }, { drill: true }); }} />
    </Visual>
  );
}
