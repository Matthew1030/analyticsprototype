// Billing and DNFB: what is holding claims back from going out the door.

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { fmt, usd } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { lineOption, ORDINAL, stackedColumnsOption } from '../ui/charts';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { weekLabel, weeksEnding } from '../ui/weekly';
import { BreakdownVisual, KpiStrip, TrendVisual } from '../ui/widgets';

export function BillingDnfb() {
  const { go } = useApp();
  const drill = (k: number) => go('facility', { id: String(k) }, { drill: true });
  return (
    <div className="page">
      <CanvasHeader right={<>
        <button type="button" className="btn btn-sm" onClick={() => go('accounts', { mode: 'dnfb' }, { drill: true })}>View unbilled accounts</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => go('wl-dnfb', {}, { drill: true })}>Work these in the DNFB worklist ›</button>
      </>} />
      <KpiStrip ids={['dnfb_dollars', 'dnfb_days', 'unbilled_accounts', 'dnfb_15plus_pct', 'dnsp_days', 'clean_claim_rate', 'billing_lag']} />
      <div className="row cols-2">
        <WeeklyDnfb />
        <TrendVisual id="dnfb_days" months={18} />
      </div>
      <div className="row cols-3">
        <BreakdownVisual id="dnfb_dollars" dim="facility" title="DNFB $ by hospital" onDrill={drill} />
        <BreakdownVisual id="dnfb_dollars" dim="dnfbHold" title="DNFB $ by hold reason" subtitle="Click to filter the hold reason (applies to DNFB measures)" />
        <BreakdownVisual id="clean_claim_rate" dim="facility" title="Clean claim rate by hospital" onDrill={drill} />
      </div>
      <div className="row cols-2">
        <DnfbMatrix />
        <div className="stack">
          <BreakdownVisual id="rework_claims" dim="editCategory" title="Claims failing edits by edit category" subtitle="Click to filter the edit category (applies to edit measures)" />
          <BreakdownVisual id="billing_lag" dim="facility" title="Billing lag by hospital" showCompare={false} onDrill={drill} />
        </div>
      </div>
    </div>
  );
}

/** Weekly DNFB by age bucket (stacked) with DNFB days below on its own axis. */
function WeeklyDnfb() {
  const { engine, period, sel, ds } = useApp();
  const weeks = weeksEnding(period.endDay, 13);
  const base: Selections = sel;
  const data = useMemo(() => weeks.map((w) => engine.snapshotBy('dnfb', 'amount', 'age', w.endDay, base, { stage: 0 })), [engine, period.endDay, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => weeks.map((w) => evaluate(METRIC_BY_ID.dnfb_days, engine, w, sel).value), [engine, period.endDay, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = ds.dims.dnfbAge.map((a, i) => ({ name: a.name, data: data.map((m) => m.get(a.key) ?? 0), color: ORDINAL[i * 2] }));
  const target = evaluate(METRIC_BY_ID.dnfb_days, engine, period, sel).target;
  return (
    <Visual title="DNFB by age, weekly" subtitle={`Saturday snapshots, 13 weeks to ${weekLabel(weeks[weeks.length - 1])} · days from discharge`}
      noData={evaluate(METRIC_BY_ID.dnfb_dollars, engine, period, sel).noData ?? null}
      table={{ columns: ['Week ending', ...ds.dims.dnfbAge.map((a) => a.name), 'DNFB days'], rows: weeks.map((w, i) => [weekLabel(w), ...series.map((s) => usd(s.data[i])), fmt(days[i], 'days')]) }}
      spec={{ type: 'Stacked columns + aligned line chart (separate axes, shared weeks)', metrics: ['dnfb_dollars', 'dnfb_days'], dimensions: ['Week', 'DNFB age'] }}>
      <Chart height={170} ariaLabel="Weekly DNFB dollars by age" option={stackedColumnsOption({ labels: weeks.map(weekLabel), series, fmt: usd })} />
      <Chart height={110} ariaLabel="Weekly DNFB days" option={lineOption({ labels: weeks.map(weekLabel), series: [{ name: 'DNFB days', data: days }], fmt: (v) => fmt(v, 'days'), target })} />
    </Visual>
  );
}

interface DRow { name: string; key: number; vals: number[]; total: number; days: number | null; isHold?: boolean; parent?: number }

/** DNFB by hospital -> hold reason x age buckets. */
function DnfbMatrix() {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const day = engine.snapshotDayOnOrBefore('dnfb', period.endDay);
  const facs = engine.facilitySet(sel);
  const rows: GridRow<DRow>[] = useMemo(() => {
    if (day === null) return [];
    const mk = (s: Selections) => { const by = engine.snapshotBy('dnfb', 'amount', 'age', day, s, { stage: 0 }); return ds.dims.dnfbAge.map((a) => by.get(a.key) ?? 0); };
    return ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => {
      const vals = mk({ ...sel, facility: [f.key] });
      const kids = ds.dims.dnfbHolds.filter((h) => !sel.dnfbHold?.length || sel.dnfbHold.includes(h.key)).map((h) => {
        const v = mk({ ...sel, facility: [f.key], dnfbHold: [h.key] });
        return { id: `f${f.key}h${h.key}`, data: { name: `${h.name}`, key: h.key, parent: f.key, isHold: true, vals: v, total: v.reduce((a, b) => a + b, 0), days: null } };
      }).filter((k) => k.data.total > 0);
      return { id: `f${f.key}`, data: { name: f.short, key: f.key, vals, total: vals.reduce((a, b) => a + b, 0), days: evaluate(METRIC_BY_ID.dnfb_days, engine, period, { ...sel, facility: [f.key] }).value }, children: kids };
    }).filter((r) => r.data.total > 0);
  }, [engine, day, period, sel, ds, facs]);
  const total: DRow = { name: 'Total', key: -1, vals: ds.dims.dnfbAge.map((_, i) => rows.reduce((a, r) => a + r.data.vals[i], 0)), total: rows.reduce((a, r) => a + r.data.total, 0), days: evaluate(METRIC_BY_ID.dnfb_days, engine, period, sel).value };
  const cols: GridColumn<DRow>[] = [
    { key: 'name', label: 'Hospital / hold reason', value: (r) => r.name, width: 220 },
    ...ds.dims.dnfbAge.map((a, i) => ({ key: `a${i}`, label: a.name, group: 'Days since discharge', value: (r: DRow) => r.vals[i], format: (v: number | null) => (v ? usd(v) : '–'), heat: i >= 2 ? 'magnitude' as const : undefined })),
    { key: 'total', label: 'DNFB $', value: (r) => r.total, format: (v) => <b>{usd(v ?? 0)}</b>, exportText: (r) => usd(r.total) },
    { key: 'days', label: 'DNFB days', value: (r) => r.days, format: (v) => fmt(v, 'days'), metricId: 'dnfb_days' },
  ];
  return (
    <Visual title="DNFB by hospital and hold reason" subtitle={`${period.short} month-end snapshot · expand a hospital for hold reasons · click to filter`}
      table={gridExport(cols, rows, total)} noData={rows.length ? null : 'No DNFB for the current filters.'}
      spec={{ type: 'Matrix (pivot) table with hierarchy and heat', metrics: ['dnfb_dollars', 'dnfb_days'], dimensions: ['Hospital', 'Hold reason', 'DNFB age'], interactions: 'Expand/collapse; row click filters hospital (and hold reason)' }}>
      <Grid caption="DNFB by hospital and hold reason" columns={cols} rows={rows} total={total} defaultSort={{ key: 'total', dir: 'desc' }} maxHeight={430}
        onRowClick={(r) => { if (r.isHold) { selectOnly('facility', [r.parent!]); selectOnly('dnfbHold', [r.key]); } else selectOnly('facility', [r.key]); }} />
    </Visual>
  );
}
