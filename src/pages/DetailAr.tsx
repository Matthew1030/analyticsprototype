import { useEffect } from 'react';
import { monthStartDay } from '../data/dates';
import { missingFields } from '../engine/engine';
import { METRIC_BY_ID, evaluate } from '../engine/metrics';
import { trailing } from '../engine/periods';
import { fmt, usd } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, comboOption, SERIES } from '../ui/charts';
import { Panel } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';
import { DrillChart, KpiTile } from '../ui/widgets';

export function DetailAr() {
  const { engine, period, sel, ds, registerExport, toggle, selectOnly } = useApp();
  const d = ds.dims;
  const arBlocked = missingFields('ar', sel).length ? 'No data is available for this selection.' : null;

  // Billed insurance > 90 days by facility.
  const facs = sel.facility?.length ? d.facilities.filter((f) => sel.facility!.includes(f.key)) : d.facilities;
  const over90 = facs.map((f) => ({ f, v: evaluate(METRIC_BY_ID.M13, engine, period, { ...sel, facility: [f.key] }).value }))
    .sort((a, b) => (b.v ?? 0) - (a.v ?? 0));

  // Days to collect by financial class.
  const fcs = d.financialClasses.map((n, i) => ({ key: i, name: n, v: evaluate(METRIC_BY_ID.M16, engine, period, { ...sel, financialClass: [i] }).value }))
    .filter((x) => x.v !== null).sort((a, b) => (b.v ?? 0) - (a.v ?? 0));

  // A/R by age bucket at period end.
  const arDay = engine.snapshotDayOnOrBefore('ar', period.endDay);
  const ages = d.arAge.map((a) => ({ ...a, v: arDay === null || arBlocked ? null : engine.snapshot('ar', 'gross', arDay, { ...sel, arAge: [a.key] }) }));

  // Cash posted and cash % NPSR, 12 periods.
  const tp = trailing(period, period.kind === 'month' ? 12 : 8);
  const cash = tp.map((p) => evaluate(METRIC_BY_ID.M21, engine, p, sel).value);
  const cashPct = tp.map((p) => evaluate(METRIC_BY_ID.M22, engine, p, sel).value);

  // Cash % NPSR by facility, year to date.
  const ytdStartMi = Math.max(Math.floor(period.endMi / 12) * 12, ds.meta.windowStartMonth);
  const ytd = { startDay: monthStartDay(ytdStartMi), endDay: period.endDay, startMi: ytdStartMi, endMi: period.endMi };
  const cashFac = facs.map((f) => ({ f, v: evaluate(METRIC_BY_ID.M22, engine, ytd, { ...sel, facility: [f.key] }).value })).sort((a, b) => (a.v ?? 0) - (b.v ?? 0));

  // Pivot: cash by discharge age bucket x 6 periods.
  const pp = trailing(period, 6);
  type CRow = { name: string; vals: (number | null)[] };
  const byAge = pp.map((p) => engine.cashByAge(p.startDay, p.endDay, sel));
  const cashRows: CRow[] = [
    ...d.arAge.map((a) => ({ name: `Cash, ${a.name} days from discharge`, vals: byAge.map((b) => b[a.key]) })),
    { name: 'Cash posted, total', vals: byAge.map((b) => b.reduce((x, y) => x + y, 0)) },
    ...d.financialClasses.map((n, i) => ({ name: `Cash, ${n}`, vals: pp.map((p) => evaluate(METRIC_BY_ID.M25, engine, p, { ...sel, financialClass: [i] }).value) })),
  ];
  const cCols: Column<CRow>[] = [
    { key: 'n', label: 'Cash posted', value: (r) => r.name, metricId: 'M21' },
    ...pp.map((p, i) => ({ key: `p${i}`, label: p.short, align: 'right' as const, value: (r: CRow) => r.vals[i], text: (r: CRow) => fmt(r.vals[i], 'usd') })),
  ];

  useEffect(() => {
    registerExport({ title: 'Cash posted by discharge age and payer class', ...tableToExport(cCols, cashRows) });
    return () => registerExport(null);
  });

  return (
    <div className="page">
      <div className="kpi-row">
        {['M12', 'M10', 'M11', 'M13', 'M14'].map((id) => <KpiTile key={id} id={id} page="ar" />)}
      </div>
      <div className="grid-3">
        <Panel title="Billed insurance > 90 days by facility" qlik="Bar chart" metricId="M13" noData={arBlocked}>
          <Chart option={barOption({ labels: over90.map((x) => x.f.name), series: [{ name: 'Billed ins > 90 days', data: over90.map((x) => x.v) }], fmt: (v) => fmt(v, 'pct', 0), horizontal: true, target: 0.22 })}
            height={Math.max(220, over90.length * 28 + 40)} ariaLabel="Billed insurance over 90 days by facility"
            onClick={(i) => selectOnly('facility', [over90[i].f.key])} />
        </Panel>
        <Panel title="Days to collect by financial class" qlik="Bar chart" metricId="M16" noData={arBlocked}>
          <Chart option={barOption({ labels: fcs.map((x) => x.name), series: [{ name: 'Days to collect', data: fcs.map((x) => x.v) }], fmt: (v) => fmt(v, 'days', 0), horizontal: true })}
            height={260} ariaLabel="Days to collect by financial class"
            onClick={(i) => toggle('financialClass', fcs[i].key)} />
        </Panel>
        <Panel title="Gross A/R by age bucket" qlik="Bar chart" metricId="M12" info="A/R at the period-end snapshot by days from discharge. Click a bar to select the age bucket." noData={arBlocked}>
          <Chart option={barOption({ labels: ages.map((a) => a.name), series: [{ name: 'Gross A/R', data: ages.map((a) => a.v), color: SERIES[0] }], fmt: usd,
            highlight: sel.arAge?.length ? ages.map((a, i) => (sel.arAge!.includes(a.key) ? i : -1)).filter((i) => i >= 0) : undefined })}
            height={260} ariaLabel="Gross A/R by age bucket" onClick={(i) => toggle('arAge', ages[i].key)} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Cash posted and cash % NPSR" qlik="Combo chart" metricId="M22">
          <Chart option={comboOption({ labels: tp.map((p) => p.short), bars: [{ name: 'Cash posted', data: cash }], line: { name: 'Cash % NPSR', data: cashPct }, barFmt: usd, lineFmt: (v) => fmt(v, 'pct', 0), lineTarget: 1 })}
            height={280} ariaLabel="Cash posted and cash percent of NPSR" />
        </Panel>
        <Panel title={`Cash % NPSR by facility, year to date (to ${period.label})`} qlik="Bar chart" metricId="M22">
          <Chart option={barOption({ labels: cashFac.map((x) => x.f.name), series: [{ name: 'Cash % NPSR', data: cashFac.map((x) => x.v) }], fmt: (v) => fmt(v, 'pct', 0), target: 1 })}
            height={280} ariaLabel="Cash percent of NPSR by facility" onClick={(i) => selectOnly('facility', [cashFac[i].f.key])} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Cash posted by discharge age and payer class" qlik="Pivot table">
          <DataTable caption="Cash posted by discharge age and payer class" columns={cCols} rows={cashRows} pageSize={20} searchable={false} />
        </Panel>
        <DrillChart metricId="M10" title="Gross A/R days: drill down" />
      </div>
    </div>
  );
}
