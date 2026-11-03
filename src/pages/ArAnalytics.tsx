// A/R Analytics: where A/R is accumulating and why.
// Workflow: Net A/R days -> hospital -> aging bucket -> payer -> accounts.
// Standard stage-page order: Performance, Trend, Where, Why, Act.

import { useMemo, useState } from 'react';
import { monthEndDay } from '../data/dates';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { comparePeriod, trailingMonths } from '../engine/periods';
import { fmt, fmtDelta, usd } from '../format';
import { accounts, members } from '../services/analytics';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, ORDINAL, paretoOption, SERIES, stackedColumnsOption } from '../ui/charts';
import { fmtMetric, snapshotLabel } from '../ui/common';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { InvestigationPath } from '../ui/InvestigationPath';
import { CanvasHeader } from '../ui/Shell';
import { Band, Bands } from '../ui/TabBox';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, TrendVisual, useMetric } from '../ui/widgets';
import { AccountsTable } from './AccountDetail';

type Basis = 'net' | 'gross';

export function ArAnalytics() {
  const { go, sel } = useApp();
  // Gross is the default: the workbook splits gross A/R by payor group and aging (Medhost ATB).
  const [basis, setBasis] = useState<Basis>('gross');
  const arId = basis === 'net' ? 'net_ar' : 'gross_ar';
  // Step 1 of the path is the starting point, so it ignores the fields the path drills into.
  const startSel = useMemo(() => ({ ...sel, facility: [], arAge: [], payer: [], financialClass: [], accountStatus: [] }), [sel]);
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
      <Band type="kpi" />
      <KpiStrip ids={['gross_ar', 'gross_ar_days', 'net_ar', 'net_ar_days', 'ar_gt90_pct', 'billed_ins_gt360_pct', 'ar_gt180_pct', 'credit_balance_dollars']} />
      <InvestigationPath title="Investigate A/R" steps={[
        { label: 'Net A/R days', hint: '', value: <>{fmtMetric('net_ar_days', days.value)} <span className="muted">target {fmtMetric('net_ar_days', days.target)}{sel.facility?.length ? ' · before drill' : ''}</span></> },
        { label: 'Hospital', field: 'facility', hint: 'click a bar in “A/R by hospital”' },
        { label: 'Aging bucket', field: 'arAge', hint: 'click a bucket in “Aging”' },
        { label: 'Payor group', field: 'financialClass', hint: 'click a payor group in “Gross A/R by payor group”' },
        { label: 'Act', hint: '', action: { label: 'Work these in the A/R worklist ›', onClick: () => go('wl-ar', {}, { drill: true }) },
          secondary: { label: 'View accounts', onClick: () => go('accounts', { mode: 'open' }, { drill: true }) } },
      ]} />
      <Bands
        trend={[<TrendVisual id="net_ar_days" months={18} />, <AgingTrend basis={basis} />]}
        where={[
          <BreakdownVisual id={arId} dim="facility" title={`${basis === 'net' ? 'Net' : 'Gross'} A/R by hospital`} onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />,
          <BreakdownVisual id={arId} dim="financialClass" title={`${basis === 'net' ? 'Net' : 'Gross'} A/R by payor group`} />,
          <BreakdownVisual id={arId} dim="payer" title={`${basis === 'net' ? 'Net' : 'Gross'} A/R by payer`} top={12} />,
        ]}
        why={[
          [
            <BreakdownVisual id={arId} dim="arAge" sortBy="natural" title="Aging" subtitle="Days from discharge · current vs comparison · click a bucket to filter" />,
            <InsuranceSelfPayAging />,
            <Concentration basis={basis} />,
          ],
          [<AgingMatrix basis={basis} />],
          [
            <BreakdownVisual id="credit_balance_dollars" alt={['credit_balance_days']} dim="facility" title="Credit balances $ by hospital" />,
            <TrendVisual id="credit_balance_dollars" months={18} />,
            <BreakdownVisual id={arId} dim="accountStatus" title="A/R by account status" subtitle="Where the open balance sits in the workflow · click to filter" />,
          ],
        ]}
        actNote="The largest open accounts, and the A/R worklist"
        actActions={<>
          <button type="button" className="btn" onClick={() => go('accounts', { mode: 'open' }, { drill: true })}>View accounts</button>
          <button type="button" className="btn btn-primary btn-cta" onClick={() => go('wl-ar', {}, { drill: true })}>Work these in the A/R worklist <Icon name="chevronRight" size={11} /></button>
        </>}
        act={<TopAccounts sel={sel} />} />
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

/** Payor group concentration: Pareto of A/R share by the workbook payor groups. */
function Concentration({ basis }: { basis: Basis }) {
  const { engine, period, sel, ds, toggle } = useApp();
  const day = engine.snapshotDayOnOrBefore('ar', period.endDay);
  const by = useMemo(() => (day === null ? new Map<number, number>() : engine.snapshotBy('ar', basis, 'payer', day, { ...sel, financialClass: [] })), [engine, day, basis, sel]);
  const fcTotals = ds.dims.financialClasses.map((_, fc) => ds.dims.payers.filter((p) => p.fc === fc).reduce((a, p) => a + (by.get(p.key) ?? 0), 0));
  const total = fcTotals.reduce((a, b) => a + b, 0);
  const list = ds.dims.financialClasses.map((name, key) => ({ key, name, v: fcTotals[key] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const shares = list.map((x) => (total ? x.v / total : 0));
  const top3 = shares.slice(0, 3).reduce((a, b) => a + b, 0);
  const selected = list.map((x, i) => (sel.financialClass?.includes(x.key) ? i : -1)).filter((i) => i >= 0);
  return (
    <Visual title="A/R concentration by payor group" subtitle={`Top 3 payor groups hold ${fmt(top3, 'pct', 0)} of A/R · click to filter`}
      table={{ columns: ['Payor group', 'A/R', 'Share', 'Cumulative'], rows: list.map((x, i) => [x.name, usd(x.v), fmt(shares[i], 'pct'), fmt(shares.slice(0, i + 1).reduce((a, b) => a + b, 0), 'pct')]) }}
      noData={total ? null : 'No A/R for the current filters.'} gap={basis === 'net'}
      spec={{ type: 'Pareto chart (bars + cumulative line, one % axis)', metrics: [basis === 'net' ? 'net_ar' : 'gross_ar'], dimensions: ['Payor group'], interactions: 'Click filters the payor group' }}>
      <Chart height={250} ariaLabel="A/R concentration by payor group" option={paretoOption({ labels: list.map((x) => x.name), shares, fmt: (v) => fmt(v, 'pct', 0), selected })}
        onClick={(i, s) => { if (s === 'Share of A/R') toggle('financialClass', list[i].key); }} />
    </Visual>
  );
}

/** Gross A/R by workbook bucket, insurance vs self pay: Unbilled, then billed 0–90, 91–180, 181–360, 361+. */
function InsuranceSelfPayAging() {
  const { engine, period, sel, ds } = useApp();
  const day = engine.snapshotDayOnOrBefore('ar', period.endDay);
  const sp = ds.dims.financialClasses.length - 1;
  const groups = [{ name: 'Insurance', fc: ds.dims.financialClasses.map((_, i) => i).filter((i) => i !== sp) }, { name: 'Self Pay', fc: [sp] }];
  const labels = ['Unbilled', ...ds.dims.arAge.map((a) => a.name)];
  const data = useMemo(() => groups.map((g) => {
    if (day === null) return labels.map(() => 0);
    const fc = sel.financialClass?.length ? g.fc.filter((k) => sel.financialClass!.includes(k)) : g.fc;
    if (!fc.length) return labels.map(() => 0);
    const s: Selections = { ...sel, financialClass: fc, arAge: [] };
    const unbilled = engine.snapshot('ar', 'gross', day, s, { billed: [0] });
    const billed = engine.snapshotBy('ar', 'gross', 'age', day, s, { billed: [1, 2] });
    return [unbilled, ...ds.dims.arAge.map((a) => billed.get(a.key) ?? 0)];
  }), [engine, day, sel, ds]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Visual title="Insurance vs self-pay A/R by age" metricId="gross_ar" subtitle={`Gross A/R at ${snapshotLabel(day)} · workbook "Insurance AR" and "Self Pay AR" buckets (in-house A/R not modeled)`}
      table={{ columns: ['Bucket', ...groups.map((g) => g.name)], rows: labels.map((l, i) => [l, ...data.map((d) => usd(d[i]))]) }}
      spec={{ type: 'Grouped column chart (ordered buckets)', metrics: ['gross_ar'], dimensions: ['A/R bucket', 'Insurance / self pay'] }}>
      <Chart height={240} ariaLabel="Insurance vs self-pay A/R by age"
        option={barOption({ labels, fmt: (v) => usd(v), series: groups.map((g, i) => ({ name: g.name, data: data[i], color: SERIES[i] })) })} />
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
      return { name, key, level, parent, buckets, total, prior, gt90: total ? buckets.slice(1).reduce((x, y) => x + y, 0) / total : 0 };
    };
    // Children: insurance and self pay (the workbook's split; it has no aging by payor).
    const sp = ds.dims.financialClasses.length - 1;
    const split = [{ key: 0, name: 'Insurance', fc: ds.dims.financialClasses.map((_, i) => i).filter((i) => i !== sp) }, { key: 1, name: 'Self Pay', fc: [sp] }];
    return facs.map((f) => {
      const fr = mk(f.label, f.key, 'facility', { ...base, facility: [f.key] });
      const kids = split.map((g) => {
        const fc = sel.financialClass?.length ? g.fc.filter((k) => sel.financialClass!.includes(k)) : g.fc;
        return fc.length ? mk(g.name, g.key, 'payer', { ...base, facility: [f.key], financialClass: fc }, f.key) : null;
      }).filter((r): r is AgRow => !!r && r.total > 0);
      return { id: `f${f.key}`, data: fr, children: kids.map((k) => ({ id: `f${f.key}s${k.key}`, data: k })) };
    }).filter((r) => r.data.total > 0);
  }, [engine, day, pday, basis, ds, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const total: AgRow = useMemo(() => {
    const b = ds.dims.arAge.map((_, i) => rows.reduce((a, r) => a + r.data.buckets[i], 0));
    const t = b.reduce((x, y) => x + y, 0);
    return { name: 'Total', key: -1, level: 'facility', buckets: b, total: t, prior: rows.reduce((a, r) => a + r.data.prior, 0), gt90: t ? b.slice(1).reduce((x, y) => x + y, 0) / t : 0 };
  }, [rows, ds]);
  const cols: GridColumn<AgRow>[] = [
    { key: 'name', label: 'Hospital / insurance or self pay', value: (r) => r.name, width: 230 },
    ...ds.dims.arAge.map((a, i) => ({ key: `b${i}`, label: a.name, group: 'Days from discharge', value: (r: AgRow) => r.buckets[i], format: (v: number | null) => usd(v ?? 0), heat: 'magnitude' as const })),
    { key: 'total', label: 'Total', value: (r) => r.total, format: (v) => <b>{usd(v ?? 0)}</b>, exportText: (r) => usd(r.total) },
    { key: 'chg', label: `vs ${cp.short}`, value: (r) => r.total - r.prior, format: (v) => <span className={(v ?? 0) > 0 ? 'txt-off' : 'txt-ok'}>{fmtDelta(v, 'usd')}</span>, exportText: (r) => fmtDelta(r.total - r.prior, 'usd'), info: 'Change in the A/R balance vs the comparison period. An increase is shown as unfavorable.' },
    { key: 'gt90', label: 'A/R > 90 days', value: (r) => r.gt90, format: (v) => fmt(v, 'pct'), heat: 'high', info: 'Share of the balance older than 90 days. Shaded when high relative to the other rows.' },
  ];
  return (
    <Visual title="A/R aging matrix" subtitle={`${basis === 'net' ? 'Net' : 'Gross'} A/R at ${snapshotLabel(day)} · expand a hospital to see insurance and self pay · click a row to filter`}
      table={gridExport(cols, rows, total)} noData={rows.length ? null : 'No A/R for the current filters.'} gap={basis === 'net'}
      spec={{ type: 'Matrix (pivot) table: hierarchical rows, column group, subtotals, heat formatting', metrics: [basis === 'net' ? 'net_ar' : 'gross_ar', 'ar_gt90_pct'], dimensions: ['Hospital', 'Insurance / self pay', 'Aging bucket'], interactions: 'Expand/collapse; sort within level; row click filters hospital (and insurance or self pay)' }}>
      <Grid caption="A/R aging matrix" columns={cols} rows={rows} total={total} maxHeight={420} defaultSort={{ key: 'total', dir: 'desc' }}
        selected={(r) => (r.level === 'facility' ? !!sel.facility?.includes(r.key) && !sel.financialClass?.length : !!sel.facility?.includes(r.parent!))}
        onRowClick={(r) => {
          const sp = ds.dims.financialClasses.length - 1;
          if (r.level === 'facility') selectOnly('facility', [r.key]);
          else { selectOnly('facility', [r.parent!]); selectOnly('financialClass', r.key === 1 ? [sp] : ds.dims.financialClasses.map((_, i) => i).filter((i) => i !== sp)); }
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
