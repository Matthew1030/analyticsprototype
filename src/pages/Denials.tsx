// Denials Analytics: which payers, hospitals, categories and root causes drive denials.
// Drill path: Total denials -> payer -> hospital -> category -> root cause -> denied claims.
// Standard stage-page order: Performance, Trend, Where, Why, Act.
//
// v1 (src/config/v1.ts) is one screen: the KPI strip, then denied $ by reason, by payor group and
// by hospital, and the denial decomposition. Every bar cross-filters the page.

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { APPEAL_STATUSES, appealStatusCounts, evaluate, METRIC_BY_ID } from '../engine/metrics';
import { comparePeriod, trailingMonths } from '../engine/periods';
import { fmt, fmtDelta, usd } from '../format';
import { members } from '../services/analytics';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, SERIES, stackedColumnsOption } from '../ui/charts';
import { fmtMetric, snapshotLabel } from '../ui/common';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { InvestigationPath } from '../ui/InvestigationPath';
import { CanvasHeader } from '../ui/Shell';
import { Band, Bands } from '../ui/TabBox';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, DecompositionTree, KpiStrip, TrendVisual, useMetric } from '../ui/widgets';
import { AgeBucketsVisual, WriteoffsByReason } from '../ui/workbook';
import { V1_DENIAL_KPIS } from '../config/v1';

/** Reason colors follow the reason (fixed order), never its rank: the 12 workbook denial reasons. */
export const CATEGORY_COLORS = [...SERIES, '#0f7b8a', '#b5651d', '#7a7f87', '#9aa2ae'];

export function Denials() {
  const { version } = useApp();
  return version === 'v1' ? <DenialsV1 /> : <DenialsFull />;
}

/** v1: KPIs, then where the denied dollars are (reason, payor group, hospital) and the decomposition. */
function DenialsV1() {
  return (
    <div className="page denials-v1">
      <CanvasHeader question="Which denial reasons, payor groups and hospitals drive denied dollars?" />
      <KpiStrip ids={V1_DENIAL_KPIS} />
      <div className="dv1-grid">
        <div className="dv1-reason">
          <BreakdownVisual id="denial_dollars" dim="denialCategory" title="Denied $ by reason" showCompare={false} height={392} />
        </div>
        <div className="dv1-payor">
          <BreakdownVisual id="denial_dollars" alt={['denial_dollar_rate']} dim="financialClass" title="Denied $ by payor group" showCompare={false} height={190} />
        </div>
        <div className="dv1-hosp">
          <BreakdownVisual id="denial_dollars" alt={['denial_dollar_rate']} dim="facility" title="Denied $ by hospital" showCompare={false} height={190} />
        </div>
        <div className="dv1-decomp">
          <DecompositionTree id="denial_dollars" title="Denial decomposition" dims={['facility', 'denialCategory', 'financialClass']} initial={['facility', 'denialCategory']} />
        </div>
      </div>
    </div>
  );
}

function DenialsFull() {
  const { go, sel } = useApp();
  const startSel = useMemo(() => ({ ...sel, facility: [], payer: [], denialCategory: [], rootCause: [] }), [sel]);
  const rate = useMetric('denial_dollar_rate', 0, startSel);
  const work = () => go('wl-denials', {}, { drill: true });
  const claims = () => go('accounts', { mode: 'denied' }, { drill: true });
  return (
    <div className="page">
      <CanvasHeader />
      <Band type="kpi" />
      <KpiStrip ids={['denial_dollars', 'denial_dollar_rate', 'front_end_denial_rate', 'coding_denial_rate', 'documentation_denial_rate', 'denial_writeoffs', 'denial_wo_pct_npsr']} />
      <KpiStrip ids={['denial_rate', 'denial_pct_npsr', 'appeal_rate', 'appeal_success', 'recoverable_pct']} />
      <InvestigationPath title="Investigate denials" steps={[
        { label: 'Denial rate ($)', hint: '', value: <>{fmtMetric('denial_dollar_rate', rate.value)} <span className="muted">target {fmtMetric('denial_dollar_rate', rate.target)}</span></> },
        { label: 'Payor group', field: 'financialClass', hint: 'click a payor group' },
        { label: 'Hospital', field: 'facility', hint: 'click a hospital' },
        { label: 'Reason', field: 'denialCategory', hint: 'click a reason' },
        { label: 'Act', hint: '', action: { label: 'Work these claims in the Denials worklist ›', onClick: work },
          secondary: { label: 'View denied claims', onClick: claims } },
      ]} />
      <Bands
        trend={[<TrendVisual id="denial_dollar_rate" alt={['front_end_denial_rate', 'coding_denial_rate', 'documentation_denial_rate']} months={18} />, <CategoryTrend />]}
        where={[
          <BreakdownVisual id="denial_dollars" dim="financialClass" title="Denied $ by payor group" />,
          <BreakdownVisual id="denial_dollar_rate" dim="facility" title="Denial rate ($) by hospital" onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />,
          <BreakdownVisual id="denial_rate" dim="payer" title="Denial rate by payer" top={11} />,
        ]}
        why={[
          [<BreakdownVisual id="denial_dollars" dim="denialCategory" title="Denied $ by reason" />, <TopDrivers by="reason" />],
          [<DecompositionTree id="denial_dollars" title="Denial decomposition" dims={['facility', 'denialCategory', 'financialClass', 'payer', 'rootCause', 'serviceLine', 'patientType']}
            initial={['facility', 'denialCategory']} />],
          [<WriteoffsByReason />, <AgeBucketsVisual kind="writeoffs" title="Denial write-offs by age" />],
          [<PayerCategoryMatrix />, <TopDrivers by="rootCause" />],
        ]}
        actNote="Appeals, recoverable dollars and the denied claims to work"
        actActions={<>
          <button type="button" className="btn" onClick={claims}>View denied claims</button>
          <button type="button" className="btn btn-primary btn-cta" onClick={work}>Work these claims in the Denials worklist <Icon name="chevronRight" size={11} /></button>
        </>}
        act={<>
          <KpiStrip ids={['appeals_filed', 'appeals_resolved', 'appeals_open', 'appeal_success', 'appeal_upheld_rate', 'denial_wo_pct_npsr']} />
          <div className="row cols-3">
            <AppealStatus />
            <BreakdownVisual id="appeals_filed" alt={['appeal_rate']} dim="denialCategory" title="Appeals by denial category" subtitle="Clinical appeals: click Medical Necessity and Lacks Information/Med Records to filter" />
            <BreakdownVisual id="appeal_upheld_rate" alt={['appeal_success']} dim="denialCategory" title="Appeal outcome by denial category" />
          </div>
          <Recoverability />
        </>} />
    </div>
  );
}

/** Denied dollars by category per month (stacked) - shows which category is changing. */
function CategoryTrend() {
  const { engine, period, sel, ds, toggle } = useApp();
  const months = trailingMonths(period.endMi, 13).filter((p) => p.startMi >= ds.meta.windowStartMonth);
  const cats = ds.dims.denialCategories;
  const data = useMemo(() => cats.map((c) => months.map((p) => engine.sum('acc', 'denAmt', 'denD', p.startDay, p.endDay, { ...sel, denialCategory: [c.key] }, { detail: 'denial' }))),
    [engine, months.map((p) => p.key).join(), sel, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = cats.map((c, i) => ({ name: c.name, data: data[i], color: CATEGORY_COLORS[i] }));
  return (
    <Visual title="Denied $ by reason, monthly" subtitle="Gross initial denials $ by denial date · click a segment to filter the reason"
      table={{ columns: ['Month', ...cats.map((c) => c.name)], rows: months.map((p, j) => [p.short, ...data.map((d) => usd(d[j]))]) }}
      spec={{ type: 'Stacked column chart', metrics: ['denial_dollars'], dimensions: ['Month', 'Denial reason'], interactions: 'Click a segment filters the reason' }}>
      <Chart height={250} ariaLabel="Denied dollars by reason by month"
        option={stackedColumnsOption({ labels: months.map((p) => p.short), series, fmt: (v) => usd(v), selectedSeries: sel.denialCategory })}
        onClick={(_, name) => { const c = cats.find((x) => x.name === name); if (c) toggle('denialCategory', c.key); }} />
    </Visual>
  );
}

interface Driver { key: number; name: string; category: string; owner: string; recoverable: boolean; dollars: number; prior: number; claims: number; share: number; appeal: number | null; wo: number }

/**
 * Denial drivers with change and write-offs: by workbook reason (what the dataset holds), or by root
 * cause with claims, recoverability and appeal rate (v3+: the workbook has no root causes or claim counts).
 */
function TopDrivers({ by }: { by: 'reason' | 'rootCause' }) {
  const { engine, period, compare, sel, ds, toggle } = useApp();
  const cp = comparePeriod(period, compare);
  const field = by === 'reason' ? 'denialCategory' : 'rootCause';
  const rows = useMemo(() => {
    const base: Selections = { ...sel, [field]: [] };
    const all = engine.sum('acc', 'denAmt', 'denD', period.startDay, period.endDay, base, { detail: 'denial' });
    return members(ds, field, sel).filter((r) => !sel[field]?.length || sel[field]!.includes(r.key)).map((r) => {
      const rc = by === 'reason' ? { name: ds.dims.denialCategories[r.key].name, category: r.key, recoverable: true } : ds.dims.rootCauses[r.key];
      const s: Selections = { ...sel, [field]: [r.key] };
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
  }, [engine, period, cp, sel, ds, field, by]);
  const reason = by === 'reason';
  const cols: GridColumn<Driver>[] = [
    { key: 'name', label: reason ? 'Denial reason' : 'Root cause', value: (r) => r.name, width: 260 },
    ...(reason ? [] : [{ key: 'cat', label: 'Reason', value: (r: Driver) => r.category, align: 'left' as const }]),
    { key: 'owner', label: 'Prevention owner', value: (r) => r.owner, align: 'left', info: 'Revenue cycle area that usually owns prevention.' },
    ...(reason ? [] : [
      { key: 'rec', label: 'Recoverable', value: (r: Driver) => (r.recoverable ? 'Yes' : 'No'), align: 'center' as const },
      { key: 'claims', label: 'Claims', value: (r: Driver) => r.claims, format: (v: number | null) => fmt(v, 'count') },
    ]),
    { key: 'dollars', label: 'Denied $', value: (r) => r.dollars, format: (v) => usd(v ?? 0), bar: true, exportText: (r) => Math.round(r.dollars) },
    { key: 'share', label: 'Share', value: (r) => r.share, format: (v) => fmt(v, 'pct') },
    { key: 'chg', label: `vs ${cp.short}`, value: (r) => r.dollars - r.prior, format: (v) => <span className={(v ?? 0) > 0 ? 'txt-off' : 'txt-ok'}>{fmtDelta(v, 'usd')}</span>, exportText: (r) => Math.round(r.dollars - r.prior) },
    ...(reason ? [] : [{ key: 'appeal', label: 'Appeal rate', value: (r: Driver) => r.appeal, format: (v: number | null) => fmt(v, 'pct', 0) }]),
    { key: 'wo', label: 'Written off', value: (r) => r.wo, format: (v) => usd(v ?? 0), heat: 'high' },
  ];
  const g = rows.map((r) => ({ id: String(r.key), data: r }));
  const total = useMemo<Driver>(() => ({ key: -1, name: 'Total', category: '', owner: '', recoverable: true, dollars: rows.reduce((a, r) => a + r.dollars, 0), prior: rows.reduce((a, r) => a + r.prior, 0), claims: rows.reduce((a, r) => a + r.claims, 0), share: 1, appeal: evaluate(METRIC_BY_ID.appeal_rate, engine, period, sel).value, wo: rows.reduce((a, r) => a + r.wo, 0) }), [rows, engine, period, sel]);
  return (
    <Visual title={reason ? 'Denial drivers by reason' : 'Top denial drivers'} subtitle={`${reason ? 'Workbook denial reasons' : 'Root causes'}, ${period.label} · sorted by denied $ · click a row to filter`}
      table={gridExport(cols, g, total)}
      spec={reason
        ? { type: 'Ranked analytical table with data bars and heat', metrics: ['denial_dollars', 'denial_writeoffs'], dimensions: ['Denial reason'], interactions: 'Row click toggles the reason filter' }
        : { type: 'Ranked analytical table with data bars and heat', metrics: ['denial_dollars', 'denied_claims', 'appeal_rate', 'denial_writeoffs'], dimensions: ['Root cause', 'Denial reason'], interactions: 'Row click toggles the root cause filter' }}>
      <Grid caption={reason ? 'Denial drivers by reason' : 'Top denial drivers'} columns={cols} rows={g} total={total} pageSize={12} defaultSort={{ key: 'dollars', dir: 'desc' }}
        selected={(r) => !!sel[field]?.includes(r.key)} onRowClick={(r) => { if (r.key >= 0) toggle(field, r.key); }} />
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
    ...cats.map((c, i) => ({ key: `c${i}`, label: c.name.replace('Lacks Information/Med Records', 'Lacks info').replace('Coordination Of Benefits', 'COB').replace('Medical Necessity', 'Med. necessity').replace('Benefits Exhausted', 'Benefits exh.'), group: 'Denied $ by category', value: (r: PcRow) => r.vals[i], format: (v: number | null) => (v ? usd(v) : '–'), heat: 'magnitude' as const })),
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

/** Open denials by work status at period end: review, appeal levels and rework (client KPI: appeal status). */
function AppealStatus() {
  const { engine, period, sel } = useApp();
  const day = Math.min(period.endDay, engine.lastDay);
  const counts = useMemo(() => appealStatusCounts(engine, day, sel), [engine, day, sel]);
  return (
    <Visual title="Denial and appeal status" metricId="appeals_open" noData={counts.every((v) => v === 0) ? 'No open denials for the current filters.' : null}
      subtitle={`Open denials at ${snapshotLabel(day)} · filter the denial category for clinical appeals`}
      table={{ columns: ['Status', 'Open denials'], rows: APPEAL_STATUSES.map((st, i) => [st, fmt(counts[i], 'count')]) }}
      spec={{ type: 'Bar chart (horizontal, fixed status order)', metrics: ['appeals_open'], dimensions: ['Appeal status'] }}>
      <Chart height={200} ariaLabel="Open denials by appeal status"
        option={barOption({ labels: [...APPEAL_STATUSES], horizontal: true, fmt: (v) => fmt(v, 'count'), series: [{ name: 'Open denials', data: counts, color: SERIES[0] }], labels_on: true })} />
    </Visual>
  );
}
