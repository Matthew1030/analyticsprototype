// Payer Performance: which payers pay slowly, deny more, or underpay.

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { fmt, fmtDelta, usd } from '../format';
import { members } from '../services/analytics';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, scatterOption } from '../ui/charts';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip } from '../ui/widgets';

interface PRow {
  key: number; name: string; fc: string; isClass?: boolean;
  gross: number | null; mix: number | null; ar: number | null; arDays: number | null; gt90: number | null;
  denial: number | null; ncr: number | null; contractual: number | null; pv: number | null; pvPct: number | null;
}

const UNDERPAY = -0.02;

export function Payers() {
  return (
    <div className="page">
      <CanvasHeader />
      <KpiStrip ids={['payment_variance', 'payment_variance_pct', 'contractual_adj_pct', 'denial_rate', 'net_collection_rate', 'gross_ar_days']} />
      <PayerTable />
      <div className="row cols-3">
        <PayerScatter />
        <PaymentVariance />
        <BreakdownVisual id="gross_charges" dim="financialClass" title="Payer mix (gross charges by financial class)" />
      </div>
      <p className="footnote">Payer names are used for realism only. All figures are synthetic and do not describe any real payer's performance or contracts.</p>
    </div>
  );
}

function usePayerRows() {
  const { engine, period, sel, ds } = useApp();
  return useMemo(() => {
    const allGross = evaluate(METRIC_BY_ID.gross_charges, engine, period, { ...sel, payer: [], financialClass: [] }).value ?? 0;
    const row = (s: Selections, key: number, name: string, fc: string, isClass = false): PRow => {
      const v = (id: string) => evaluate(METRIC_BY_ID[id], engine, period, s).value;
      const gross = v('gross_charges');
      return {
        key, name, fc, isClass, gross, mix: allGross && gross !== null ? gross / allGross : null, ar: v('net_ar'), arDays: v('gross_ar_days'), gt90: v('ar_gt90_pct'),
        denial: v('denial_rate'), ncr: v('net_collection_rate'), contractual: v('contractual_adj_pct'), pv: v('payment_variance'), pvPct: v('payment_variance_pct'),
      };
    };
    const payers = members(ds, 'payer', sel).filter((p) => !sel.payer?.length || sel.payer.includes(p.key));
    const tree: GridRow<PRow>[] = ds.dims.financialClasses.map((fcName, fc) => {
      const kids = payers.filter((p) => ds.dims.payers[p.key].fc === fc);
      if (!kids.length) return null;
      return {
        id: `fc${fc}`, kind: 'subtotal' as const, data: row({ ...sel, payer: kids.map((k) => k.key) }, -1 - fc, fcName, fcName, true),
        children: kids.map((p) => ({ id: `p${p.key}`, data: row({ ...sel, payer: [p.key] }, p.key, p.label, fcName) })),
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    return { tree, total: row(sel, -99, 'Total', '') };
  }, [engine, period, sel, ds]);
}

function PayerTable() {
  const { sel, toggle, go } = useApp();
  const { tree, total } = usePayerRows();
  const cols: GridColumn<PRow>[] = [
    { key: 'name', label: 'Financial class / payer', value: (r) => r.name, width: 240, render: (r) => (r.isClass ? <b>{r.name}</b> : r.name) },
    { key: 'gross', label: 'Gross chg.', value: (r) => r.gross, format: (v) => usd(v ?? 0) },
    { key: 'mix', label: 'Mix', value: (r) => r.mix, format: (v) => fmt(v, 'pct'), bar: true, info: 'Share of gross charges across all payers (ignores the payer filter).' },
    { key: 'ar', label: 'Net A/R', value: (r) => r.ar, format: (v) => usd(v ?? 0), group: 'A/R' },
    { key: 'arDays', label: 'Days in A/R', value: (r) => r.arDays, format: (v) => fmt(v, 'days'), heat: 'high', group: 'A/R', metricId: 'gross_ar_days' },
    { key: 'gt90', label: '% > 90', value: (r) => r.gt90, format: (v) => fmt(v, 'pct'), heat: 'high', group: 'A/R', metricId: 'ar_gt90_pct' },
    { key: 'denial', label: 'Denial rate', value: (r) => r.denial, format: (v) => fmt(v, 'pct'), heat: 'high', metricId: 'denial_rate' },
    { key: 'ncr', label: 'Net collection', value: (r) => r.ncr, format: (v) => fmt(v, 'pct'), heat: 'low', metricId: 'net_collection_rate' },
    { key: 'pv', label: 'Pmt variance', value: (r) => r.pv, format: (v) => <span className={(v ?? 0) < 0 ? 'txt-off' : ''}>{fmtDelta(v, 'usd')}</span>, exportText: (r) => Math.round(r.pv ?? 0), group: 'Reimbursement', metricId: 'payment_variance' },
    { key: 'pvPct', label: 'Var %', value: (r) => r.pvPct, format: (v) => fmtDelta(v, 'pct'), heat: 'low', group: 'Reimbursement', metricId: 'payment_variance_pct' },
    { key: 'flag', label: 'Underpayment', value: (r) => (r.pvPct !== null && r.pvPct < UNDERPAY ? 1 : 0), align: 'left', group: 'Reimbursement',
      render: (r) => (r.pvPct !== null && r.pvPct < UNDERPAY ? <span className="flag-off" title="Review contract terms and payment posting">▲ Review</span> : <span className="muted">–</span>),
      exportText: (r) => (r.pvPct !== null && r.pvPct < UNDERPAY ? 'Yes' : 'No'), info: 'Flagged when payments run more than 2% below expected reimbursement.' },
    { key: 'contr', label: 'Contractual adj.', value: (r) => r.contractual, format: (v) => fmt(v, 'pct'), metricId: 'contractual_adj_pct' },
  ];
  return (
    <Visual title="Payer performance" subtitle="Grouped by financial class with subtotals · shading = worse relative to other payers · click a payer to filter"
      table={gridExport(cols, tree, total)}
      spec={{ type: 'Matrix table: grouped rows, column groups, heat formatting, flags, totals', metrics: ['gross_charges', 'net_ar', 'gross_ar_days', 'ar_gt90_pct', 'denial_rate', 'net_collection_rate', 'contractual_adj_pct', 'payment_variance'], dimensions: ['Financial class', 'Payer'], interactions: 'Expand/collapse; sort within level; row click toggles payer filter; header info opens definitions' }}>
      <Grid caption="Payer performance" columns={cols} rows={tree} total={total} defaultExpanded
        selected={(r) => !r.isClass && !!sel.payer?.includes(r.key)}
        onRowClick={(r) => { if (!r.isClass) toggle('payer', r.key); }}
        footnote={<button type="button" className="link" onClick={() => go('metric', { id: 'payment_variance_pct' }, { drill: true })}>Analyze payment variance ›</button>} />
    </Visual>
  );
}

function PayerScatter() {
  const { sel, toggle } = useApp();
  const { tree } = usePayerRows();
  const leaves = tree.flatMap((t) => t.children ?? []).map((c) => c.data).filter((r) => r.fc !== 'Self Pay');
  const pts = leaves.map((r) => ({ name: r.name, x: r.arDays, y: r.denial, size: r.ar ?? 0 }));
  const xs = pts.map((p) => p.x).filter((v): v is number => v !== null);
  const ys = pts.map((p) => p.y).filter((v): v is number => v !== null);
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : undefined; };
  const shown = leaves.filter((r) => r.arDays !== null && r.denial !== null);
  return (
    <Visual title="Denials vs days in A/R" subtitle="Each bubble is a payer (size = net A/R) · dashed lines = medians · top right = slow and denying"
      table={{ columns: ['Payer', 'Days in A/R', 'Denial rate', 'Net A/R'], rows: leaves.map((r) => [r.name, fmt(r.arDays, 'days'), fmt(r.denial, 'pct'), usd(r.ar ?? 0)]) }}
      spec={{ type: 'Scatter / bubble chart with median reference lines', metrics: ['gross_ar_days', 'denial_rate', 'net_ar'], dimensions: ['Payer'], interactions: 'Click toggles the payer filter' }}>
      <Chart height={300} ariaLabel="Payer denial rate vs days in A/R"
        option={scatterOption({ points: pts, xName: 'Days in A/R', yName: 'Denial rate', xFmt: (v) => fmt(v, 'days', 0), yFmt: (v) => fmt(v, 'pct', 0), xRef: med(xs), yRef: med(ys),
          selected: shown.map((r, i) => (sel.payer?.includes(r.key) ? i : -1)).filter((i) => i >= 0) })}
        onClick={(i) => toggle('payer', shown[i].key)} />
    </Visual>
  );
}

function PaymentVariance() {
  const { sel, toggle } = useApp();
  const { tree } = usePayerRows();
  const leaves = tree.flatMap((t) => t.children ?? []).map((c) => c.data).filter((r) => r.pvPct !== null && r.fc !== 'Self Pay').sort((a, b) => (a.pvPct ?? 0) - (b.pvPct ?? 0));
  return (
    <Visual title="Payment variance by payer" metricId="payment_variance_pct" subtitle="Paid vs expected reimbursement · below −2% flags possible underpayment · click to filter"
      table={{ columns: ['Payer', 'Variance %', 'Variance $'], rows: leaves.map((r) => [r.name, fmtDelta(r.pvPct, 'pct'), fmtDelta(r.pv, 'usd')]) }}
      spec={{ type: 'Bar chart (horizontal, sorted) with threshold line', metrics: ['payment_variance_pct'], dimensions: ['Payer'], interactions: 'Click toggles the payer filter' }}>
      <Chart height={300} ariaLabel="Payment variance by payer"
        option={barOption({ labels: leaves.map((r) => r.name), horizontal: true, fmt: (v) => fmtDelta(v, 'pct'), axisFmt: (v) => fmt(v, 'pct', 0), target: UNDERPAY,
          series: [{ name: 'Payment variance %', data: leaves.map((r) => r.pvPct) }],
          colorBy: (i) => ((leaves[i].pvPct ?? 0) < UNDERPAY ? '#eb6834' : '#2a78d6'),
          selected: leaves.map((r, i) => (sel.payer?.includes(r.key) ? i : -1)).filter((i) => i >= 0) })}
        onClick={(i) => toggle('payer', leaves[i].key)} />
    </Visual>
  );
}
