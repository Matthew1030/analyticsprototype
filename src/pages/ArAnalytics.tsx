// A/R Analytics: where A/R is accumulating and why.
// Workflow: Net A/R days -> hospital -> aging bucket -> payer -> accounts.

import { useMemo, useState } from 'react';
import { monthEndDay } from '../data/dates';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { comparePeriod, trailingMonths } from '../engine/periods';
import { fmt, fmtDelta, usd } from '../format';
import { accounts, members } from '../services/analytics';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { ORDINAL, paretoOption, stackedColumnsOption } from '../ui/charts';
import { fmtMetric } from '../ui/common';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { InvestigationPath } from '../ui/InvestigationPath';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, TrendVisual, useMetric } from '../ui/widgets';
import { AccountsTable } from './AccountDetail';

type Basis = 'net' | 'gross';

export function ArAnalytics() {
  const { go, sel } = useApp();
  const [basis, setBasis] = useState<Basis>('net');
  const arId = basis === 'net' ? 'net_ar' : 'gross_ar';
  // Step 1 of the path is the starting point, so it ignores the fields the path drills into.
  const startSel = useMemo(() => ({ ...sel, facility: [], arAge: [], payer: [], accountStatus: [] }), [sel]);
  const days = useMetric('net_ar_days', 0, startSel);
  return (
    <div className="page">
      <CanvasHeader right={(
        <div className="seg" role="radiogroup" aria-label="Balance basis">
          {(['net', 'gross'] as Basis[]).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={basis === b} className={basis === b ? 'on' : ''} onClick={() => setBasis(b)}>{b === 'net' ? 'Net A/R' : 'Gross A/R'}</button>
          ))}
        </div>
      )} />
      <KpiStrip ids={['net_ar_days', 'net_ar', 'gross_ar', 'gross_ar_days', 'ar_gt90_pct', 'ar_gt180_pct']} />
      <InvestigationPath title="Investigate A/R" steps={[
        { label: 'Net A/R days', hint: '', value: <>{fmtMetric('net_ar_days', days.value)} <span className="muted">target {fmtMetric('net_ar_days', days.target)}{sel.facility?.length ? ' · before drill' : ''}</span></> },
        { label: 'Hospital', field: 'facility', hint: 'click a bar in “A/R by hospital”' },
        { label: 'Aging bucket', field: 'arAge', hint: 'click a bucket in “Aging”' },
        { label: 'Payer', field: 'payer', hint: 'click a payer in “A/R by payer”' },
        { label: 'Accounts', hint: '', action: { label: 'View accounts', onClick: () => go('accounts', { mode: 'open' }, { drill: true }) } },
      ]} />
      <div className="row cols-2">
        <TrendVisual id="net_ar_days" months={18} />
        <AgingTrend basis={basis} />
      </div>
      <div className="row cols-3">
        <BreakdownVisual id={arId} dim="facility" title={`${basis === 'net' ? 'Net' : 'Gross'} A/R by hospital`} onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />
        <BreakdownVisual id={arId} dim="arAge" sortBy="natural" title="Aging" subtitle="Days from discharge · current vs comparison · click a bucket to filter" />
        <BreakdownVisual id={arId} dim="payer" title={`${basis === 'net' ? 'Net' : 'Gross'} A/R by payer`} top={12} />
      </div>
      <div className="row cols-3">
        <BreakdownVisual id={arId} dim="financialClass" title="A/R by financial class" />
        <BreakdownVisual id={arId} dim="accountStatus" title="A/R by account status" subtitle="Where the open balance sits in the workflow · click to filter" />
        <Concentration basis={basis} />
      </div>
      <AgingMatrix basis={basis} />
      <TopAccounts sel={sel} />
    </div>
  );
}

/** A/R by aging bucket per month (stacked), showing how the age mix shifts over time. */
function AgingTrend({ basis }: { basis: Basis }) {
  const { engine, period, sel, ds, toggle } = useApp();
  const months = trailingMonths(period.endMi, 13).filter((p) => p.startMi >= ds.meta.windowStartMonth);
  const base: Selections = { ...sel, arAge: [] };
  const data = useMemo(() => months.map((p) => {
    const day = engine.snapshotDayOnOrBefore('ar', p.endDay);
    return day === null ? new Map<number, number>() : engine.snapshotBy('ar', basis, 'age', day, base);
  }), [engine, months.map((p) => p.key).join(), basis, JSON.stringify(base)]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = ds.dims.arAge.map((a, i) => ({ name: a.name, data: data.map((m) => m.get(a.key) ?? 0), color: ORDINAL[i] }));
  return (
    <Visual title="Aging trend" subtitle={`${basis === 'net' ? 'Net' : 'Gross'} A/R by days from discharge, month end · click a segment to filter the bucket`}
      table={{ columns: ['Month', ...ds.dims.arAge.map((a) => a.name), 'Total'], rows: months.map((p, i) => [p.short, ...series.map((s) => usd(s.data[i])), usd(series.reduce((t, s) => t + s.data[i], 0))]) }}
      spec={{ type: 'Stacked column chart (ordinal color ramp)', metrics: [basis === 'net' ? 'net_ar' : 'gross_ar'], dimensions: ['Month', 'Aging bucket'], interactions: 'Click a segment to filter the aging bucket' }}>
      <Chart height={240} ariaLabel="A/R by aging bucket by month"
        option={stackedColumnsOption({ labels: months.map((p) => p.short), series, fmt: usd, selectedSeries: sel.arAge })}
        onClick={(_, name) => { const b = ds.dims.arAge.find((a) => a.name === name); if (b) toggle('arAge', b.key); }} />
    </Visual>
  );
}

/** Payer concentration: Pareto of A/R share by payer. */
function Concentration({ basis }: { basis: Basis }) {
  const { engine, period, sel, ds, toggle } = useApp();
  const day = engine.snapshotDayOnOrBefore('ar', period.endDay);
  const by = useMemo(() => (day === null ? new Map<number, number>() : engine.snapshotBy('ar', basis, 'payer', day, { ...sel, payer: [] })), [engine, day, basis, sel]);
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  const list = ds.dims.payers.map((p) => ({ key: p.key, name: p.name, v: by.get(p.key) ?? 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const shares = list.map((x) => (total ? x.v / total : 0));
  const top3 = shares.slice(0, 3).reduce((a, b) => a + b, 0);
  const selected = list.map((x, i) => (sel.payer?.includes(x.key) ? i : -1)).filter((i) => i >= 0);
  return (
    <Visual title="A/R concentration by payer" subtitle={`Top 3 payers hold ${fmt(top3, 'pct', 0)} of A/R · click to filter`}
      table={{ columns: ['Payer', 'A/R', 'Share', 'Cumulative'], rows: list.map((x, i) => [x.name, usd(x.v), fmt(shares[i], 'pct'), fmt(shares.slice(0, i + 1).reduce((a, b) => a + b, 0), 'pct')]) }}
      noData={total ? null : 'No A/R for the current filters.'}
      spec={{ type: 'Pareto chart (bars + cumulative line, one % axis)', metrics: [basis === 'net' ? 'net_ar' : 'gross_ar'], dimensions: ['Payer'], interactions: 'Click filters the payer' }}>
      <Chart height={250} ariaLabel="A/R concentration by payer" option={paretoOption({ labels: list.map((x) => x.name), shares, fmt: (v) => fmt(v, 'pct', 0), selected })}
        onClick={(i, s) => { if (s === 'Share of A/R') toggle('payer', list[i].key); }} />
    </Visual>
  );
}

interface AgRow { name: string; key: number; level: 'facility' | 'payer'; parent?: number; buckets: number[]; total: number; prior: number; gt90: number }

/** Hierarchical aging matrix: hospital -> payer x aging buckets, with totals and heat. */
function AgingMatrix({ basis }: { basis: Basis }) {
  const { engine, period, compare, sel, ds, selectOnly, go } = useApp();
  const day = engine.snapshotDayOnOrBefore('ar', period.endDay);
  const cp = comparePeriod(period, compare);
  const pday = engine.snapshotDayOnOrBefore('ar', cp.endDay);
  const base: Selections = { ...sel, arAge: [] };
  const rows = useMemo(() => {
    if (day === null) return [] as GridRow<AgRow>[];
    const facs = members(ds, 'facility', sel).filter((f) => !sel.facility?.length || sel.facility.includes(f.key));
    const mk = (name: string, key: number, level: AgRow['level'], s: Selections, parent?: number): AgRow => {
      const by = engine.snapshotBy('ar', basis, 'age', day, s);
      const buckets = ds.dims.arAge.map((a) => by.get(a.key) ?? 0);
      const total = buckets.reduce((x, y) => x + y, 0);
      const prior = pday === null ? 0 : [...engine.snapshotBy('ar', basis, 'age', pday, s).values()].reduce((x, y) => x + y, 0);
      return { name, key, level, parent, buckets, total, prior, gt90: total ? buckets.slice(3).reduce((x, y) => x + y, 0) / total : 0 };
    };
    const payers = members(ds, 'payer', sel).filter((p) => !sel.payer?.length || sel.payer.includes(p.key));
    return facs.map((f) => {
      const fr = mk(f.label, f.key, 'facility', { ...base, facility: [f.key] });
      const kids = payers.map((p) => mk(p.label, p.key, 'payer', { ...base, facility: [f.key], payer: [p.key] }, f.key)).filter((r) => r.total > 0);
      return { id: `f${f.key}`, data: fr, children: kids.map((k) => ({ id: `f${f.key}p${k.key}`, data: k })) };
    }).filter((r) => r.data.total > 0);
  }, [engine, day, pday, basis, ds, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const total: AgRow = useMemo(() => {
    const b = ds.dims.arAge.map((_, i) => rows.reduce((a, r) => a + r.data.buckets[i], 0));
    const t = b.reduce((x, y) => x + y, 0);
    return { name: 'Total', key: -1, level: 'facility', buckets: b, total: t, prior: rows.reduce((a, r) => a + r.data.prior, 0), gt90: t ? b.slice(3).reduce((x, y) => x + y, 0) / t : 0 };
  }, [rows, ds]);
  const cols: GridColumn<AgRow>[] = [
    { key: 'name', label: 'Hospital / payer', value: (r) => r.name, width: 230 },
    ...ds.dims.arAge.map((a, i) => ({ key: `b${i}`, label: a.name, group: 'Days from discharge', value: (r: AgRow) => r.buckets[i], format: (v: number | null) => usd(v ?? 0), heat: 'magnitude' as const })),
    { key: 'total', label: 'Total', value: (r) => r.total, format: (v) => <b>{usd(v ?? 0)}</b>, exportText: (r) => usd(r.total) },
    { key: 'chg', label: `vs ${cp.short}`, value: (r) => r.total - r.prior, format: (v) => <span className={(v ?? 0) > 0 ? 'txt-off' : 'txt-ok'}>{fmtDelta(v, 'usd')}</span>, exportText: (r) => fmtDelta(r.total - r.prior, 'usd'), info: 'Change in the A/R balance vs the comparison period. An increase is shown as unfavorable.' },
    { key: 'gt90', label: '% > 90 days', value: (r) => r.gt90, format: (v) => fmt(v, 'pct'), heat: 'high', info: 'Share of the balance older than 90 days. Shaded when high relative to the other rows.' },
  ];
  return (
    <Visual title="A/R aging matrix" subtitle={`${basis === 'net' ? 'Net' : 'Gross'} A/R at ${period.short} month end · expand a hospital to see payers · click a row to filter`}
      table={gridExport(cols, rows, total)} noData={rows.length ? null : 'No A/R for the current filters.'}
      spec={{ type: 'Matrix (pivot) table: hierarchical rows, column group, subtotals, heat formatting', metrics: [basis === 'net' ? 'net_ar' : 'gross_ar', 'ar_gt90_pct'], dimensions: ['Hospital', 'Payer', 'Aging bucket'], interactions: 'Expand/collapse; sort within level; row click filters hospital (and payer)' }}>
      <Grid caption="A/R aging matrix" columns={cols} rows={rows} total={total} maxHeight={420} defaultSort={{ key: 'total', dir: 'desc' }}
        selected={(r) => (r.level === 'facility' ? !!sel.facility?.includes(r.key) && !sel.payer?.length : !!sel.payer?.includes(r.key) && !!sel.facility?.includes(r.parent!))}
        onRowClick={(r) => {
          if (r.level === 'facility') selectOnly('facility', [r.key]);
          else { selectOnly('facility', [r.parent!]); selectOnly('payer', [r.key]); }
        }}
        footnote={<button type="button" className="link" onClick={() => go('accounts', { mode: 'open' }, { drill: true })}>View accounts for the current filters ›</button>} />
    </Visual>
  );
}

function TopAccounts({ sel }: { sel: Selections }) {
  const { engine, period, go } = useApp();
  const day = engine.snapshotDayOnOrBefore('ar', period.endDay) ?? period.endDay;
  const rows = useMemo(() => accounts(engine, { mode: 'open', day: Math.min(day, monthEndDay(period.endMi)), arAge: sel.arAge, accountStatus: sel.accountStatus }, sel, 15), [engine, day, period.endMi, sel]);
  const m = METRIC_BY_ID.net_ar;
  const total = evaluate(m, engine, period, sel).value;
  return (
    <Visual title="Largest open accounts" subtitle={`Top 15 by open balance for the current filters (sample of ${total ? usd(total) : '–'} net A/R) · synthetic account numbers`}
      table={{ columns: ['Account', 'Hospital', 'Payer', 'Discharged', 'Days', 'Balance', 'Status'], rows: rows.map((r) => [r.account_id, r.facility, r.payer, r.discharge_date, r.days_since_discharge, usd(r.balance), r.status]) }}
      actions={<button type="button" className="btn btn-sm" onClick={() => go('accounts', { mode: 'open' }, { drill: true })}>All accounts ›</button>}
      spec={{ type: 'Detail table (drill-through preview)', dimensions: ['Account'], interactions: 'Opens Account Detail with the same filters' }}>
      <AccountsTable rows={rows} pageSize={15} compact />
    </Visual>
  );
}
