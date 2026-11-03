// Visuals for the splits the client's workbook (QHC RCM Dashboard) has: several metrics side by
// side by hospital, completion by team, amounts by age bucket, DNFB by owner, POS by service and
// denial write-offs by reason. They read the global filter context like every other widget.

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { amountByAge, cashByAge, CASH_AGE, evaluate, METRIC_BY_ID, WO_AGE } from '../engine/metrics';
import { fmt } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from './Chart';
import { barOption, ORDINAL, SERIES } from './charts';
import { metricLabel, snapshotLabel } from './common';
import { Visual } from './Visual';

const fmtOf = (id: string) => (v: number | null) => fmt(v, METRIC_BY_ID[id].unit, METRIC_BY_ID[id].digits);

/** Several metrics of the same unit by hospital, as grouped (or stacked) bars. */
export function MetricsByHospital({ ids, title, subtitle, stacked = false }: { ids: string[]; title: string; subtitle?: string; stacked?: boolean }) {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const facs = engine.facilitySet(sel);
  const rows = useMemo(() => ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => ({
    f, vals: ids.map((id) => evaluate(METRIC_BY_ID[id], engine, period, { ...sel, facility: [f.key] }).value),
  })).filter((r) => r.vals.some((v) => v !== null))
    .sort((a, b) => (b.vals.reduce<number>((x, y) => x + (y ?? 0), 0)) - (a.vals.reduce<number>((x, y) => x + (y ?? 0), 0))), [engine, period, sel, ds, facs, ids]);
  const fm = fmtOf(ids[0]);
  return (
    <Visual title={title} subtitle={subtitle ?? `${period.label} · click a hospital to filter`}
      noData={rows.length ? null : 'No data for the current filters.'}
      table={{ columns: ['Hospital', ...ids.map(metricLabel)], rows: rows.map((r) => [r.f.short, ...r.vals.map((v, i) => fmtOf(ids[i])(v))]) }}
      spec={{ type: stacked ? 'Stacked bar chart (horizontal)' : 'Grouped bar chart (horizontal)', metrics: ids, dimensions: ['Hospital'], interactions: 'Click filters the hospital' }}>
      <Chart height={Math.max(200, rows.length * (stacked ? 24 : 12 * ids.length + 14) + 44)} ariaLabel={`${title} by hospital`}
        option={barOption({ labels: rows.map((r) => r.f.short), horizontal: true, stacked, fmt: (v) => fm(v), labels_on: false,
          series: ids.map((id, i) => ({ name: metricLabel(id), data: rows.map((r) => r.vals[i]), color: SERIES[i] })) })}
        onClick={(i) => selectOnly('facility', [rows[i].f.key])} />
    </Visual>
  );
}

/** One value per group and series (for example completion rate by team, same day vs 1 day out). */
export function MetricGroups({ title, subtitle, groups, series }: {
  title: string; subtitle?: string; groups: { label: string; ids: string[] }[]; series: string[];
}) {
  const { engine, period, sel } = useApp();
  const vals = useMemo(() => groups.map((g) => g.ids.map((id) => evaluate(METRIC_BY_ID[id], engine, period, sel).value)), [engine, period, sel, groups]);
  const first = groups[0].ids[0];
  const fm = fmtOf(first);
  return (
    <Visual title={title} subtitle={subtitle ?? period.label}
      table={{ columns: ['Group', ...series], rows: groups.map((g, gi) => [g.label, ...vals[gi].map((v) => fm(v))]) }}
      spec={{ type: 'Grouped column chart', metrics: groups.flatMap((g) => g.ids), dimensions: ['Team'] }}>
      <Chart height={230} ariaLabel={title}
        option={barOption({ labels: groups.map((g) => g.label), fmt: (v) => fm(v), labels_on: true,
          series: series.map((name, si) => ({ name, data: vals.map((v) => v[si] ?? null), color: SERIES[si] })) })} />
    </Visual>
  );
}

/** Amounts by days-from-discharge bucket: cash posted, write-offs or bad debt transfers. */
export function AgeBucketsVisual({ kind, title, subtitle }: { kind: 'cash' | 'writeoffs' | 'baddebt'; title: string; subtitle?: string }) {
  const { engine, period, sel } = useApp();
  const buckets = kind === 'cash' ? CASH_AGE : WO_AGE;
  const vals = useMemo(() => (kind === 'cash' ? cashByAge(engine, period.startDay, period.endDay, sel, CASH_AGE)
    : kind === 'writeoffs' ? amountByAge(engine, 'woD', 'woAmt', period.startDay, period.endDay, sel, WO_AGE)
      : amountByAge(engine, 'bdD', 'bdAmt', period.startDay, period.endDay, sel, WO_AGE)), [engine, period, sel, kind]);
  const total = vals.reduce((a, b) => a + b, 0);
  const usd = (v: number | null) => fmt(v, 'usd');
  const metric = kind === 'cash' ? 'cash' : kind === 'writeoffs' ? 'denial_writeoffs' : 'bad_debt';
  return (
    <Visual title={title} metricId={metric} subtitle={subtitle ?? `${period.label} · days from discharge`}
      noData={total ? null : 'No data for the current filters.'}
      table={{ columns: ['Days from discharge', 'Amount', 'Share'], rows: buckets.map((b, i) => [b.name, usd(vals[i]), fmt(total ? vals[i] / total : null, 'pct')]) }}
      spec={{ type: 'Column chart (ordered buckets)', metrics: [metric], dimensions: ['Days from discharge'] }}>
      <Chart height={230} ariaLabel={title}
        option={barOption({ labels: buckets.map((b) => b.name), fmt: (v) => usd(v), labels_on: true, series: [{ name: period.short, data: vals, color: SERIES[0] }], colorBy: (i) => ORDINAL[Math.min(ORDINAL.length - 1, i + 1)] })} />
    </Visual>
  );
}

/** DNFB dollars aged 4+ (or 11+) days by workbook owner (Front End, Mid Cycle, Back End, Other), by hospital. */
export function DnfbByOwner({ title = 'DNFB $ by owner', ageMin = 1 }: { title?: string; ageMin?: number }) {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const day = engine.snapshotDayOnOrBefore('dnfb', period.endDay);
  const facs = engine.facilitySet(sel);
  const owners = ds.dims.dnfbOwners;
  const holdsOf = (g: number) => ds.dims.dnfbHolds.filter((h) => h.group === g).map((h) => h.key);
  const data = useMemo(() => ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => ({
    f, vals: owners.map((_, g) => (day === null ? 0 : engine.snapshot('dnfb', 'amount', day, { ...sel, facility: [f.key], dnfbHold: holdsOf(g) } as Selections, { stage: 0, ageMin }))),
  })).sort((a, b) => b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0)), [engine, day, sel, ds, facs, ageMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const usd = (v: number | null) => fmt(v, 'usd');
  return (
    <Visual title={title} metricId="dnfb_dollars" subtitle={`${ageMin === 1 ? 'Aged 4+ days from discharge' : 'All ages'}, by hospital at ${snapshotLabel(day)} · workbook "Aged by Owner" · click a hospital to filter`}
      table={{ columns: ['Hospital', ...owners], rows: data.map((d) => [d.f.short, ...d.vals.map(usd)]) }}
      spec={{ type: 'Stacked bar chart (horizontal)', metrics: ['dnfb_dollars'], dimensions: ['Hospital', 'DNFB owner'], interactions: 'Click filters the hospital' }}>
      <Chart height={Math.max(200, data.length * 24 + 44)} ariaLabel={`${title} by hospital`}
        option={barOption({ labels: data.map((d) => d.f.short), horizontal: true, stacked: true, fmt: (v) => usd(v), series: owners.map((o, i) => ({ name: o, data: data.map((d) => d.vals[i]), color: SERIES[i] })) })}
        onClick={(i) => selectOnly('facility', [data[i].f.key])} />
    </Visual>
  );
}

/** POS collections by the workbook's service split (ED, Inpatient, SDC, Other). */
export function PosByService() {
  const { engine, period, sel, ds } = useApp();
  const groups = ds.dims.posServices;
  const vals = useMemo(() => groups.map((g) => {
    const svc = ds.dims.serviceLines.filter((s) => s.posService === g).map((s) => s.key);
    const use = sel.serviceLine?.length ? svc.filter((k) => sel.serviceLine!.includes(k)) : svc;
    return use.length ? engine.sum('acc', 'pos', 'dd', period.startDay, period.endDay, { ...sel, serviceLine: use }) : 0;
  }), [engine, period, sel, ds, groups]);
  const usd = (v: number | null) => fmt(v, 'usd');
  return (
    <Visual title="POS collections by service" metricId="pos_collections" subtitle={`${period.label} · workbook split: ED, Inpatient, SDC, Other`}
      table={{ columns: ['Service', 'POS collections'], rows: groups.map((g, i) => [g, usd(vals[i])]) }}
      spec={{ type: 'Column chart', metrics: ['pos_collections'], dimensions: ['POS service'] }}>
      <Chart height={230} ariaLabel="POS collections by service"
        option={barOption({ labels: groups, fmt: (v) => usd(v), labels_on: true, series: [{ name: period.short, data: vals, color: SERIES[0] }] })} />
    </Visual>
  );
}

/** Denial write-offs by the workbook's write-off reason (mapped from the denial reason). */
export function WriteoffsByReason() {
  const { engine, period, sel, ds } = useApp();
  const reasons = ds.dims.writeoffReasons;
  const vals = useMemo(() => reasons.map((_, ri) => {
    const cats = ds.dims.denialCategories.filter((c) => c.woReason === ri).map((c) => c.key);
    const use = sel.denialCategory?.length ? cats.filter((k) => sel.denialCategory!.includes(k)) : cats;
    return use.length ? engine.sum('acc', 'woAmt', 'woD', period.startDay, period.endDay, { ...sel, denialCategory: use }, { detail: 'denial' }) : 0;
  }), [engine, period, sel, ds, reasons]);
  const usd = (v: number | null) => fmt(v, 'usd');
  const order = reasons.map((r, i) => ({ r, v: vals[i] })).sort((a, b) => b.v - a.v);
  return (
    <Visual title="Denial write-offs by reason" metricId="denial_writeoffs" subtitle={`${period.label} · workbook "Write offs by Reason"`}
      table={{ columns: ['Write-off reason', 'Denial write-offs'], rows: order.map((o) => [o.r, usd(o.v)]) }}
      spec={{ type: 'Bar chart (horizontal, sorted)', metrics: ['denial_writeoffs'], dimensions: ['Write-off reason'] }}>
      <Chart height={Math.max(200, order.length * 26 + 30)} ariaLabel="Denial write-offs by reason"
        option={barOption({ labels: order.map((o) => o.r), horizontal: true, fmt: (v) => usd(v), labels_on: true, series: [{ name: period.short, data: order.map((o) => o.v), color: SERIES[0] }] })} />
    </Visual>
  );
}

/** DNSP (billed, not sent to payor) by days from import into the scrubber, at the period-end snapshot. */
export function DnspByAge() {
  const { engine, period, sel, ds } = useApp();
  const day = engine.snapshotDayOnOrBefore('dnfb', period.endDay);
  const by = useMemo(() => (day === null ? new Map<number, number>() : engine.snapshotBy('dnfb', 'amount', 'age', day, sel, { stage: 1 })), [engine, day, sel]);
  const vals = ds.dims.dnfbAge.map((a) => by.get(a.key) ?? 0);
  const usd = (v: number | null) => fmt(v, 'usd');
  return (
    <Visual title="DNSP by age" metricId="dnsp_dollars" subtitle={`Snapshot at ${snapshotLabel(day)} · days from import into the scrubber (workbook "DNSP by Age")`}
      noData={vals.some((v) => v > 0) ? null : 'No DNSP for the current filters.'}
      table={{ columns: ['Days from import', 'DNSP $'], rows: ds.dims.dnfbAge.map((a, i) => [a.name, usd(vals[i])]) }}
      spec={{ type: 'Column chart (ordered buckets)', metrics: ['dnsp_dollars'], dimensions: ['DNSP age'] }}>
      <Chart height={230} ariaLabel="DNSP by age"
        option={barOption({ labels: ds.dims.dnfbAge.map((a) => a.name), fmt: (v) => usd(v), labels_on: true, series: [{ name: snapshotLabel(day), data: vals }], colorBy: (i) => ORDINAL[Math.min(ORDINAL.length - 1, i * 2)] })} />
    </Visual>
  );
}

/** ePars (R1 assigned tasks) open dollars by owner (HIM, PT Access, Other), by hospital, at period end. */
export function EparsByOwner() {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const facs = engine.facilitySet(sel);
  const day = Math.min(period.endDay, engine.lastDay);
  const cols = [['eparsHim', 'HIM'], ['eparsPtAccess', 'PT Access'], ['eparsOther', 'Other']] as const;
  const data = useMemo(() => ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => ({
    f, vals: cols.map(([c]) => engine.snapshot('fe', c, day, { ...sel, facility: [f.key] })),
  })).sort((a, b) => b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0)), [engine, day, sel, ds, facs]); // eslint-disable-line react-hooks/exhaustive-deps
  const usd = (v: number | null) => fmt(v, 'usd');
  return (
    <Visual title="ePars by owner" metricId="epars_total" subtitle={`Open R1 assigned task $ at period end, by hospital · workbook "ePars by Owner" · click a hospital to filter`}
      table={{ columns: ['Hospital', ...cols.map(([, l]) => l)], rows: data.map((d) => [d.f.short, ...d.vals.map(usd)]) }}
      spec={{ type: 'Stacked bar chart (horizontal)', metrics: ['epars_total', 'epars_him'], dimensions: ['Hospital', 'ePars owner'], interactions: 'Click filters the hospital' }}>
      <Chart height={Math.max(200, data.length * 24 + 44)} ariaLabel="ePars by owner by hospital"
        option={barOption({ labels: data.map((d) => d.f.short), horizontal: true, stacked: true, fmt: (v) => usd(v), series: cols.map(([, l], i) => ({ name: l, data: data.map((d) => d.vals[i]), color: SERIES[i] })) })}
        onClick={(i) => selectOnly('facility', [data[i].f.key])} />
    </Visual>
  );
}
