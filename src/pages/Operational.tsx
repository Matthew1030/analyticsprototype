import { useEffect, useMemo } from 'react';
import type { Engine, Selections } from '../engine/engine';
import { missingFields } from '../engine/engine';
import { METRIC_BY_ID, evaluate, type Range } from '../engine/metrics';
import { trailing } from '../engine/periods';
import { CONFIG, statusOf, type TaskConfig } from '../engine/status';
import { fmt } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, comboOption, SERIES } from '../ui/charts';
import { InfoIcon, Panel, StatusChip } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';
import { KpiTile, weekLabel, weeksEnding } from '../ui/widgets';

const GROUPS = ['Front End', 'Mid Cycle', 'Back End'] as const;

/** Volume from a task source: "fe:<column>" or "wq:<task>:assigned|completed". */
function volume(engine: Engine, src: string, r: Range, sel: Selections): number | null {
  const parts = src.split(':');
  if (parts[0] === 'fe') {
    if (missingFields('fe', sel).length || !engine.feHasCol(parts[1], sel)) return null;
    return engine.sum('fe', parts[1], 'day', r.startDay, r.endDay, sel);
  }
  if (missingFields('wq', sel).length) return null;
  return engine.sum('wq', parts[2], 'day', r.startDay, r.endDay, sel, { task: Number(parts[1]) });
}

interface TaskRow {
  t: TaskConfig;
  given: number | null;
  performed: number | null;
  kpi: number | null;
  noData?: string;
}

export function Operational() {
  const { engine, period, sel, registerExport } = useApp();
  const tasks = CONFIG.tasks;

  const rows: TaskRow[] = useMemo(() => tasks.map((t) => {
    const m = METRIC_BY_ID[t.metric];
    const res = evaluate(m, engine, period, sel);
    return { t, given: volume(engine, t.given, period, sel), performed: volume(engine, t.performed, period, sel), kpi: res.value, noData: res.noData };
  }), [tasks, engine, period, sel]);

  const columns: Column<TaskRow>[] = [
    { key: 'group', label: 'Group', value: (r) => r.t.group },
    { key: 'task', label: 'Task', value: (r) => r.t.name },
    { key: 'given', label: 'Volume given', value: (r) => r.given, align: 'right', text: (r) => fmt(r.given, 'count'),
      info: 'Work items that arrived for this task in the period (orders, accounts, calls or queue items).' },
    { key: 'performed', label: 'Volume performed', value: (r) => r.performed, align: 'right', text: (r) => fmt(r.performed, 'count'),
      info: 'Work items completed for this task in the period.' },
    { key: 'kpiName', label: 'Primary KPI', value: (r) => METRIC_BY_ID[r.t.metric].name,
      render: (r) => <span className="metric-cell">{METRIC_BY_ID[r.t.metric].short ?? METRIC_BY_ID[r.t.metric].name}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={r.t.metric} /></span></span> },
    { key: 'kpi', label: 'KPI value', value: (r) => r.kpi, align: 'right', text: (r) => fmt(r.kpi, METRIC_BY_ID[r.t.metric].unit),
      render: (r) => (r.kpi === null ? <span className="muted small" title={r.noData}>No data</span> : fmt(r.kpi, METRIC_BY_ID[r.t.metric].unit)) },
    { key: 'target', label: 'Target', value: (r) => r.t.target, align: 'right',
      text: (r) => (r.t.target === null ? 'None' : fmt(r.t.target, METRIC_BY_ID[r.t.metric].unit)),
      render: (r) => (r.t.target === null ? <span className="muted">None</span> : `${METRIC_BY_ID[r.t.metric].direction === 'up' ? '≥' : '≤'} ${fmt(r.t.target, METRIC_BY_ID[r.t.metric].unit)}`) },
    { key: 'type', label: 'Target type', value: (r) => r.t.targetType ?? 'None',
      render: (r) => (r.t.targetType ? <span className={`badge ${r.t.targetType === 'Contractual' ? 'badge-contract' : 'badge-internal'}`}>{r.t.targetType === 'Contractual' ? 'Contractual SLA' : 'Internal measure'}</span> : <span className="muted">None</span>),
      info: 'Contractual SLA: a service level in the client agreement. Internal measure: an operational target that is not contractual. The flags in this prototype are illustrative.' },
    { key: 'status', label: 'Status', value: (r) => statusOf(r.kpi, r.t.target, METRIC_BY_ID[r.t.metric].direction) ?? 'Not applicable',
      render: (r) => <StatusChip status={statusOf(r.kpi, r.t.target, METRIC_BY_ID[r.t.metric].direction)} na /> },
  ];

  // Volume performed by group, at least 6 periods (12 shown for months).
  const trendPeriods = trailing(period, period.kind === 'month' ? 12 : 8);
  const byGroup = GROUPS.map((g) => ({
    name: g,
    data: trendPeriods.map((p) => {
      const vals = tasks.filter((t) => t.group === g).map((t) => volume(engine, t.performed, p, sel));
      return vals.every((v) => v === null) ? null : vals.reduce<number>((a, b) => a + (b ?? 0), 0);
    }),
  }));

  // Weekly open orders and scheduled rate (13 weeks ending at period end).
  const weeks = weeksEnding(period.endDay, 13);
  const sched = METRIC_BY_ID.M32;
  const openOrders = weeks.map((w) => evaluate(METRIC_BY_ID.M33, engine, w, sel).value);
  const schedRate = weeks.map((w) => evaluate(sched, engine, w, sel).value);
  const feNoData = evaluate(sched, engine, period, sel).noData;

  // Front-end detail: metric by month (pivot).
  const pivotPeriods = trailing(period, 6);
  const pivotIds = ['M30', 'M31', 'M32', 'M33', 'M34', 'M35', 'M36', 'M37', 'M38', 'M39', 'M40', 'M41', 'M42', 'M43', 'M44', 'M45', 'M46', 'M47', 'M49'];
  const pivotRows = pivotIds.map((id) => ({ id, vals: pivotPeriods.map((p) => evaluate(METRIC_BY_ID[id], engine, p, sel).value) }));
  const pivotCols: Column<{ id: string; vals: (number | null)[] }>[] = [
    { key: 'm', label: 'Front-end metric', value: (r) => METRIC_BY_ID[r.id].name,
      render: (r) => <span className="metric-cell">{METRIC_BY_ID[r.id].name}<InfoIcon metricId={r.id} /></span> },
    ...pivotPeriods.map((p, i) => ({ key: `p${i}`, label: p.short, align: 'right' as const, value: (r: { id: string; vals: (number | null)[] }) => r.vals[i], text: (r: { id: string; vals: (number | null)[] }) => fmt(r.vals[i], METRIC_BY_ID[r.id].unit) })),
  ];

  useEffect(() => {
    registerExport({ title: `Operational tasks ${period.label}`, ...tableToExport(columns, rows) });
    return () => registerExport(null);
  });

  return (
    <div className="page">
      <div className="kpi-row">
        {['M30', 'M32', 'M33', 'M39', 'M41'].map((id) => <KpiTile key={id} id={id} page="operational" />)}
      </div>
      <Panel title="Operational tasks" qlik="Table" info="Tasks for the client's in-scope functions, grouped Front End, Mid Cycle and Back End. The task list, KPI and target per task are configuration data for each client.">
        <DataTable caption="Operational tasks" columns={columns} rows={rows} groupBy={(r) => r.t.group} pageSize={20} searchable={false} />
        <p className="small muted">Target types are illustrative until the contractual service levels are confirmed. This view does not count consecutive misses and does not show breach status.</p>
      </Panel>
      <div className="grid-2">
        <Panel title="Volume performed by group" qlik="Stacked bar chart" info="Sum of volume performed for the tasks in each group. Follows the facility and period selections."
          noData={byGroup.every((g) => g.data.every((v) => v === null)) ? 'No data is available for this selection.' : null}>
          <Chart option={barOption({ labels: trendPeriods.map((p) => p.short), series: byGroup.map((g, i) => ({ ...g, color: SERIES[i] })), fmt: (v) => fmt(v, 'count'), stacked: true })} height={280} ariaLabel="Volume performed by group" />
        </Panel>
        <Panel title="Open orders and scheduled rate, weekly" qlik="Combo chart" metricId="M32" noData={feNoData ?? null}>
          <Chart
            option={comboOption({
              labels: weeks.map(weekLabel),
              bars: [{ name: 'Open orders', data: openOrders }],
              line: { name: 'Scheduled rate', data: schedRate },
              barFmt: (v) => fmt(v, 'count'), lineFmt: (v) => fmt(v, 'pct', 0), lineTarget: 0.95,
            })}
            height={280}
            ariaLabel="Weekly open orders and scheduled rate"
          />
          <p className="small muted">13 weeks ending {weekLabel(weeks[weeks.length - 1])}. Open orders are counted at the end of each week.</p>
        </Panel>
      </div>
      <Panel title="Front-end detail by period" qlik="Pivot table">
        <DataTable caption="Front-end detail" columns={pivotCols} rows={pivotRows} pageSize={25} searchable={false}
          rowClass={() => ''} />
      </Panel>
    </div>
  );
}
