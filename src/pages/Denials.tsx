// Denials Analytics: which payers, hospitals, categories and root causes drive denials.
// Drill path: Total denials -> payer -> hospital -> category -> root cause -> denied claims.

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { comparePeriod, trailingMonths } from '../engine/periods';
import { fmt, fmtDelta, usd } from '../format';
import { members } from '../services/analytics';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, SERIES, stackedColumnsOption } from '../ui/charts';
import { fmtMetric } from '../ui/common';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { InvestigationPath } from '../ui/InvestigationPath';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, DecompositionTree, KpiStrip, TrendVisual, useMetric } from '../ui/widgets';

/** Category colors follow the category (fixed order), never its rank. Ninth folds to gray. */
export const CATEGORY_COLORS = [...SERIES, '#9aa2ae'];

export function Denials() {
  const { go, sel } = useApp();
  const startSel = useMemo(() => ({ ...sel, facility: [], payer: [], denialCategory: [], rootCause: [] }), [sel]);
  const rate = useMetric('denial_rate', 0, startSel);
  return (
    <div className="page">
      <CanvasHeader />
      <KpiStrip ids={['denial_rate', 'denial_dollars', 'denial_pct_npsr', 'appeal_rate', 'appeal_success', 'denial_writeoffs', 'recoverable_pct']} />
      <InvestigationPath title="Investigate denials" steps={[
        { label: 'Denial rate', hint: '', value: <>{fmtMetric('denial_rate', rate.value)} <span className="muted">target {fmtMetric('denial_rate', rate.target)}</span></> },
        { label: 'Payer', field: 'payer', hint: 'click a payer' },
        { label: 'Hospital', field: 'facility', hint: 'click a hospital' },
        { label: 'Category', field: 'denialCategory', hint: 'click a category' },
        { label: 'Root cause', field: 'rootCause', hint: 'click a driver row' },
        { label: 'Act', hint: '', action: { label: 'Work these claims in the Denials worklist ›', onClick: () => go('wl-denials', {}, { drill: true }) },
          secondary: { label: 'View denied claims', onClick: () => go('accounts', { mode: 'denied' }, { drill: true }) } },
      ]} />
      <DecompositionTree id="denial_dollars" title="Denial decomposition" dims={['payer', 'facility', 'denialCategory', 'rootCause', 'financialClass', 'serviceLine', 'patientType']}
        initial={['payer', 'facility', 'denialCategory', 'rootCause']} />
      <div className="row cols-2">
        <TrendVisual id="denial_rate" months={18} />
        <CategoryTrend />
      </div>
      <div className="row cols-3">
        <BreakdownVisual id="denial_rate" dim="payer" title="Denial rate by payer" top={11} />
        <BreakdownVisual id="denial_rate" dim="facility" title="Denial rate by hospital" onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />
        <BreakdownVisual id="denial_dollars" dim="denialCategory" title="Denied $ by category" />
      </div>
      <TopDrivers />
      <div className="row cols-2">
        <PayerCategoryMatrix />
        <Recoverability />
      </div>
    </div>
  );
}

/** Denied dollars by category per month (stacked) - shows which category is changing. */
function CategoryTrend() {
  const { engine, period, sel, ds, toggle } = useApp();
  const months = trailingMonths(period.endMi, 13).filter((p) => p.startMi >= ds.meta.windowStartMonth);
  const cats = ds.dims.denialCategories;
  const data = useMemo(() => cats.map((c) => months.map((p) => engine.sum('acc', '__one', 'denD', p.startDay, p.endDay, { ...sel, denialCategory: [c.key] }, { detail: 'denial' }))),
    [engine, months.map((p) => p.key).join(), sel, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = cats.map((c, i) => ({ name: c.name, data: data[i], color: CATEGORY_COLORS[i] }));
  return (
    <Visual title="Denied claims by category, monthly" subtitle="Claim count by denial date · click a segment to filter the category"
      table={{ columns: ['Month', ...cats.map((c) => c.name)], rows: months.map((p, j) => [p.short, ...data.map((d) => fmt(d[j], 'count'))]) }}
      spec={{ type: 'Stacked column chart', metrics: ['denied_claims'], dimensions: ['Month', 'Denial category'], interactions: 'Click a segment filters the category' }}>
      <Chart height={250} ariaLabel="Denied claims by category by month"
        option={stackedColumnsOption({ labels: months.map((p) => p.short), series, fmt: (v) => fmt(v, 'count'), selectedSeries: sel.denialCategory })}
        onClick={(_, name) => { const c = cats.find((x) => x.name === name); if (c) toggle('denialCategory', c.key); }} />
    </Visual>
  );
}

interface Driver { key: number; name: string; category: string; owner: string; recoverable: boolean; dollars: number; prior: number; claims: number; share: number; appeal: number | null; wo: number }

/** Top denial drivers by root cause, with change, appeal rate and write-offs. */
function TopDrivers() {
  const { engine, period, compare, sel, ds, toggle } = useApp();
  const cp = comparePeriod(period, compare);
  const rows = useMemo(() => {
    const base: Selections = { ...sel, rootCause: [] };
    const all = engine.sum('acc', 'denAmt', 'denD', period.startDay, period.endDay, base, { detail: 'denial' });
    return members(ds, 'rootCause', sel).filter((r) => !sel.rootCause?.length || sel.rootCause.includes(r.key)).map((r) => {
      const rc = ds.dims.rootCauses[r.key];
      const s: Selections = { ...sel, rootCause: [r.key] };
      const dollars = engine.sum('acc', 'denAmt', 'denD', period.startDay, period.endDay, s, { detail: 'denial' });
      const claims = engine.sum('acc', '__one', 'denD', period.startDay, period.endDay, s, { detail: 'denial' });
      return {
        key: r.key, name: rc.name, category: ds.dims.denialCategories[rc.category].name, owner: ds.dims.denialCategories[rc.category].owner, recoverable: rc.recoverable,
        dollars, claims, share: all ? dollars / all : 0,
        prior: engine.sum('acc', 'denAmt', 'denD', cp.startDay, cp.endDay, s, { detail: 'denial' }),
        appeal: evaluate(METRIC_BY_ID.appeal_rate, engine, period, s).value,
        wo: engine.sum('acc', 'woAmt', 'woD', period.startDay, period.endDay, s, { detail: 'denial' }),
      } as Driver;
    }).filter((r) => r.dollars > 0 || r.prior > 0);
  }, [engine, period, cp, sel, ds]);
  const cols: GridColumn<Driver>[] = [
    { key: 'name', label: 'Root cause', value: (r) => r.name, width: 260 },
    { key: 'cat', label: 'Category', value: (r) => r.category, align: 'left' },
    { key: 'owner', label: 'Prevention owner', value: (r) => r.owner, align: 'left', info: 'Revenue cycle area that usually owns prevention of this root cause.' },
    { key: 'rec', label: 'Recoverable', value: (r) => (r.recoverable ? 'Yes' : 'No'), align: 'center' },
    { key: 'claims', label: 'Claims', value: (r) => r.claims, format: (v) => fmt(v, 'count') },
    { key: 'dollars', label: 'Denied $', value: (r) => r.dollars, format: (v) => usd(v ?? 0), bar: true, exportText: (r) => Math.round(r.dollars) },
    { key: 'share', label: 'Share', value: (r) => r.share, format: (v) => fmt(v, 'pct') },
    { key: 'chg', label: `vs ${cp.short}`, value: (r) => r.dollars - r.prior, format: (v) => <span className={(v ?? 0) > 0 ? 'txt-off' : 'txt-ok'}>{fmtDelta(v, 'usd')}</span>, exportText: (r) => Math.round(r.dollars - r.prior) },
    { key: 'appeal', label: 'Appeal rate', value: (r) => r.appeal, format: (v) => fmt(v, 'pct', 0) },
    { key: 'wo', label: 'Written off', value: (r) => r.wo, format: (v) => usd(v ?? 0), heat: 'high' },
  ];
  const g = rows.map((r) => ({ id: String(r.key), data: r }));
  const total = useMemo<Driver>(() => ({ key: -1, name: 'Total', category: '', owner: '', recoverable: true, dollars: rows.reduce((a, r) => a + r.dollars, 0), prior: rows.reduce((a, r) => a + r.prior, 0), claims: rows.reduce((a, r) => a + r.claims, 0), share: 1, appeal: evaluate(METRIC_BY_ID.appeal_rate, engine, period, sel).value, wo: rows.reduce((a, r) => a + r.wo, 0) }), [rows, engine, period, sel]);
  return (
    <Visual title="Top denial drivers" subtitle={`Root causes, ${period.label} · sorted by denied $ · click a row to filter the root cause`}
      table={gridExport(cols, g, total)}
      spec={{ type: 'Ranked analytical table with data bars and heat', metrics: ['denial_dollars', 'denied_claims', 'appeal_rate', 'denial_writeoffs'], dimensions: ['Root cause', 'Category'], interactions: 'Row click toggles the root cause filter' }}>
      <Grid caption="Top denial drivers" columns={cols} rows={g} total={total} pageSize={12} defaultSort={{ key: 'dollars', dir: 'desc' }}
        selected={(r) => !!sel.rootCause?.includes(r.key)} onRowClick={(r) => { if (r.key >= 0) toggle('rootCause', r.key); }} />
    </Visual>
  );
}

interface PcRow { key: number; name: string; vals: number[]; total: number; rate: number | null }

/** Payer x denial category heat matrix (denied $). */
function PayerCategoryMatrix() {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const cats = ds.dims.denialCategories;
  const rows = useMemo(() => members(ds, 'payer', sel).filter((p) => p.label !== 'Self Pay' && (!sel.payer?.length || sel.payer.includes(p.key))).map((p) => {
    const vals = cats.map((c) => engine.sum('acc', 'denAmt', 'denD', period.startDay, period.endDay, { ...sel, payer: [p.key], denialCategory: [c.key] }, { detail: 'denial' }));
    return { key: p.key, name: p.label, vals, total: vals.reduce((a, b) => a + b, 0), rate: evaluate(METRIC_BY_ID.denial_rate, engine, period, { ...sel, payer: [p.key] }).value };
  }), [engine, period, sel, ds, cats]);
  const cols: GridColumn<PcRow>[] = [
    { key: 'name', label: 'Payer', value: (r) => r.name, width: 200 },
    ...cats.map((c, i) => ({ key: `c${i}`, label: c.name.replace('Missing information / records', 'Missing info').replace('Coordination of benefits', 'COB').replace('Medical necessity', 'Med. necessity'), group: 'Denied $ by category', value: (r: PcRow) => r.vals[i], format: (v: number | null) => (v ? usd(v) : '–'), heat: 'magnitude' as const })),
    { key: 'total', label: 'Total', value: (r) => r.total, format: (v) => <b>{usd(v ?? 0)}</b> },
    { key: 'rate', label: 'Denial rate', value: (r) => r.rate, format: (v) => fmt(v, 'pct') },
  ];
  const g = rows.map((r) => ({ id: String(r.key), data: r }));
  return (
    <Visual title="Payer × category" subtitle={`Denied $, ${period.label} · darker = more dollars · click a row to filter the payer`}
      table={gridExport(cols, g)}
      spec={{ type: 'Heat matrix (pivot)', metrics: ['denial_dollars', 'denial_rate'], dimensions: ['Payer', 'Denial category'], interactions: 'Row click filters the payer' }}>
      <Grid caption="Payer by denial category" columns={cols} rows={g} dense defaultSort={{ key: 'total', dir: 'desc' }} maxHeight={380}
        selected={(r) => !!sel.payer?.includes(r.key)} onRowClick={(r) => selectOnly('payer', [r.key])} />
    </Visual>
  );
}

/** Recoverable vs non-recoverable denials by category, with what was written off. */
function Recoverability() {
  const { engine, period, sel, ds } = useApp();
  const cats = ds.dims.denialCategories;
  const data = useMemo(() => cats.map((c) => {
    const rcs = ds.dims.rootCauses.filter((r) => r.category === c.key);
    const sum = (keys: number[]) => (keys.length ? engine.sum('acc', 'denAmt', 'denD', period.startDay, period.endDay, { ...sel, rootCause: keys }, { detail: 'denial' }) : 0);
    return { name: c.name, rec: sum(rcs.filter((r) => r.recoverable).map((r) => r.key)), non: sum(rcs.filter((r) => !r.recoverable).map((r) => r.key)) };
  }).sort((a, b) => b.rec + b.non - (a.rec + a.non)), [engine, period, sel, ds, cats]);
  return (
    <Visual title="Recoverable vs non-recoverable" metricId="recoverable_pct" subtitle="Denied $ by category, split by whether the root cause is usually recoverable"
      table={{ columns: ['Category', 'Recoverable', 'Non-recoverable'], rows: data.map((d) => [d.name, usd(d.rec), usd(d.non)]) }}
      spec={{ type: 'Stacked bar chart (horizontal)', metrics: ['denial_dollars', 'recoverable_pct'], dimensions: ['Denial category', 'Recoverable flag'] }}>
      <Chart height={300} ariaLabel="Recoverable vs non-recoverable denials by category"
        option={barOption({ labels: data.map((d) => d.name), horizontal: true, stacked: true, fmt: usd, series: [{ name: 'Recoverable', data: data.map((d) => d.rec), color: SERIES[0] }, { name: 'Non-recoverable', data: data.map((d) => d.non), color: SERIES[1] }] })} />
    </Visual>
  );
}
