// Period-over-period change. Neutral wording: the view shows change only and makes no
// claim about its cause. Categories come from one configuration place (client.config.json).

import { useEffect, useMemo } from 'react';
import { METRIC_BY_ID, evaluate } from '../engine/metrics';
import { priorPeriod } from '../engine/periods';
import { CONFIG } from '../engine/status';
import { fmt, usd } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { waterfallOption } from '../ui/charts';
import { Panel } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';

interface Row { label: string; prior: number | null; current: number | null }

export function PeriodChange() {
  const { engine, period, sel, registerExport } = useApp();
  const prior = priorPeriod(period);
  const m = METRIC_BY_ID[CONFIG.bridge.measure];
  const fcSel = sel.financialClass ?? [];

  const rows: Row[] = useMemo(() => CONFIG.bridge.categories
    .filter((c) => !fcSel.length || c.financialClasses.some((f) => fcSel.includes(f)))
    .map((c) => {
      const fcs = fcSel.length ? c.financialClasses.filter((f) => fcSel.includes(f)) : c.financialClasses;
      const s = { ...sel, financialClass: fcs };
      return { label: c.label, prior: evaluate(m, engine, prior, s).value, current: evaluate(m, engine, period, s).value };
    }), [engine, period, prior, sel, m, fcSel]);

  const priorTotal = rows.reduce((a, r) => a + (r.prior ?? 0), 0);
  const curTotal = rows.reduce((a, r) => a + (r.current ?? 0), 0);
  const noData = rows.every((r) => r.current === null && r.prior === null) ? evaluate(m, engine, period, sel).noData ?? 'No data is available for this selection.' : null;
  const pct = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? (a - b) / Math.abs(b) : null);

  const columns: Column<Row>[] = [
    { key: 'cat', label: 'Category', value: (r) => r.label, info: 'Categories are defined in one configuration place and are the same for all clients.' },
    { key: 'prior', label: `Prior period (${prior.label})`, value: (r) => r.prior, align: 'right', text: (r) => fmt(r.prior, 'usd') },
    { key: 'cur', label: `Current period (${period.label})`, value: (r) => r.current, align: 'right', text: (r) => fmt(r.current, 'usd') },
    { key: 'chg', label: 'Change ($)', value: (r) => (r.current ?? 0) - (r.prior ?? 0), align: 'right', text: (r) => signed((r.current ?? 0) - (r.prior ?? 0)) },
    { key: 'pct', label: 'Change (%)', value: (r) => pct(r.current, r.prior), align: 'right', text: (r) => fmtPct(pct(r.current, r.prior)) },
  ];
  const totalRow: Row = { label: 'Total', prior: priorTotal, current: curTotal };

  useEffect(() => {
    registerExport({ title: `Period-over-period change ${period.label} vs ${prior.label}`, ...tableToExport(columns, [...rows, totalRow]) });
    return () => registerExport(null);
  });

  return (
    <div className="page">
      <p className="view-sub">
        {CONFIG.bridge.title}. Comparison period: <b>{prior.label}</b> (the period just before {period.label}). Values show period-over-period change only.
      </p>
      <div className="kpi-row">
        <Stat label={`Prior period total (${prior.label})`} value={usd(priorTotal)} />
        <Stat label={`Current period total (${period.label})`} value={usd(curTotal)} />
        <Stat label="Change ($)" value={signed(curTotal - priorTotal)} />
        <Stat label="Change (%)" value={fmtPct(pct(curTotal, priorTotal))} />
      </div>
      <div className="grid-2">
        <Panel title={`${CONFIG.bridge.title}: ${prior.label} to ${period.label}`} qlik="Waterfall chart" metricId={m.id} noData={noData}>
          <Chart
            option={waterfallOption({
              start: { label: prior.short, value: priorTotal },
              steps: rows.map((r) => ({ label: r.label, value: (r.current ?? 0) - (r.prior ?? 0) })),
              end: { label: period.short, value: curTotal },
              fmt: usd,
            })}
            height={340}
            ariaLabel="Period-over-period change bridge"
          />
        </Panel>
        <Panel title="Change by category" qlik="Table" noData={noData}>
          <DataTable caption="Change by category" columns={columns} rows={[...rows, totalRow]} pageSize={20} searchable={false}
            rowClass={(r) => (r.label === 'Total' ? 'row-total' : '')} />
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-head"><span className="kpi-name">{label}</span></div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${usd(Math.abs(v))}`;
const fmtPct = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`);
