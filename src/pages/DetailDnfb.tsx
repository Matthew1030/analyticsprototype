import { useEffect, useMemo } from 'react';
import { missingFields } from '../engine/engine';
import { METRIC_BY_ID, evaluate } from '../engine/metrics';
import { fmt, usd } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, comboOption, SERIES } from '../ui/charts';
import { Panel } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';
import { DrillChart, KpiTile, weekLabel, weeksEnding } from '../ui/widgets';

interface FacRow { key: number; name: string; days: number | null; dnfb: number | null; aged: number | null; share: number | null }

export function DetailDnfb() {
  const { engine, period, sel, ds, registerExport, toggle } = useApp();
  const missing = missingFields('dnfb', sel);
  const blocked = missing.length ? evaluate(METRIC_BY_ID.M01, engine, period, sel).noData! : null;

  // Weekly unbilled balance by age bucket, with DNFB days.
  const weeks = weeksEnding(period.endDay, 13);
  // Bucket value = DNFB aged >= this bucket minus DNFB aged >= the next bucket.
  const bucketSeries = ds.dims.dnfbAge.map((a) => ({
    name: a.name,
    data: weeks.map((w) => {
      if (blocked) return null;
      const ge = engine.snapshot('dnfb', 'amount', w.endDay, sel, { stage: 0, ageMin: a.key });
      const gt = a.key < 3 ? engine.snapshot('dnfb', 'amount', w.endDay, sel, { stage: 0, ageMin: a.key + 1 }) : 0;
      return ge - gt;
    }),
  }));
  const daysLine = weeks.map((w) => evaluate(METRIC_BY_ID.M01, engine, w, sel).value);

  const facRows: FacRow[] = useMemo(() => {
    if (blocked) return [];
    const day = engine.snapshotDayOnOrBefore('dnfb', period.endDay)!;
    const sysAged = engine.snapshot('dnfb', 'amount', day, { ...sel, facility: [] }, { stage: 0, ageMin: 3 });
    const list = (sel.facility?.length ? ds.dims.facilities.filter((f) => sel.facility!.includes(f.key)) : ds.dims.facilities);
    return list.map((f) => {
      const s = { ...sel, facility: [f.key] };
      const aged = engine.snapshot('dnfb', 'amount', day, s, { stage: 0, ageMin: 3 });
      return { key: f.key, name: f.name, days: evaluate(METRIC_BY_ID.M01, engine, period, s).value, dnfb: evaluate(METRIC_BY_ID.M02, engine, period, s).value, aged, share: sysAged > 0 ? aged / sysAged : null };
    });
  }, [engine, period, sel, ds, blocked]);

  const cols: Column<FacRow>[] = [
    { key: 'name', label: 'Facility', value: (r) => r.name },
    { key: 'days', label: 'DNFB days', value: (r) => r.days, align: 'right', metricId: 'M01', text: (r) => fmt(r.days, 'days') },
    { key: 'dnfb', label: 'DNFB $', value: (r) => r.dnfb, align: 'right', metricId: 'M02', text: (r) => fmt(r.dnfb, 'usd') },
    { key: 'aged', label: '11+ days $', value: (r) => r.aged, align: 'right', text: (r) => fmt(r.aged, 'usd'), info: 'DNFB dollars aged 11 or more days past discharge at the period-end snapshot.' },
    { key: 'share', label: 'Share of 11+', value: (r) => r.share, align: 'right', text: (r) => fmt(r.share, 'pct', 0), info: 'Share of all 11+ day DNFB dollars across facilities (ignores the facility selection).' },
  ];

  // Hold reason (owner) at the period-end snapshot.
  const holds = ds.dims.dnfbHolds.map((h) => ({
    ...h,
    value: blocked ? null : engine.snapshot('dnfb', 'amount', engine.snapshotDayOnOrBefore('dnfb', period.endDay)!, { ...sel, dnfbHold: [h.key] }, { stage: 0 }),
  })).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  useEffect(() => {
    registerExport({ title: `DNFB by facility ${period.label}`, ...tableToExport(cols, facRows) });
    return () => registerExport(null);
  });

  return (
    <div className="page">
      <div className="kpi-row">
        {['M02', 'M01', 'M03', 'M04'].map((id) => <KpiTile key={id} id={id} page="dnfb" />)}
      </div>
      <div className="grid-2">
        <Panel title="Unbilled balance by age, with DNFB days (weekly)" qlik="Combo chart (stacked bars: verify; fallback stacked bar + line)" metricId="M02" noData={blocked}>
          <Chart
            option={comboOption({
              labels: weeks.map(weekLabel), bars: bucketSeries, stacked: true,
              line: { name: 'DNFB days', data: daysLine, color: SERIES[1] },
              barFmt: usd, lineFmt: (v) => fmt(v, 'days'), lineTarget: 4,
            })}
            height={300}
            ariaLabel="Weekly unbilled balance by age bucket with DNFB days"
          />
        </Panel>
        <Panel title="DNFB by hold reason and owner" qlik="Bar chart" info="DNFB dollars at the period-end snapshot by hold reason. Click a bar to select the hold reason." noData={blocked}>
          <Chart
            option={barOption({ labels: holds.map((h) => `${h.name} (${h.owner})`), series: [{ name: 'DNFB $', data: holds.map((h) => h.value) }], fmt: usd, horizontal: true,
              highlight: sel.dnfbHold?.length ? holds.map((h, i) => (sel.dnfbHold!.includes(h.key) ? i : -1)).filter((i) => i >= 0) : undefined })}
            height={300}
            ariaLabel="DNFB by hold reason"
            onClick={(i) => toggle('dnfbHold', holds[i].key)}
          />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="DNFB by facility" qlik="Table" noData={blocked}>
          <DataTable caption="DNFB by facility" columns={cols} rows={facRows} initialSort={{ key: 'aged', dir: 'desc' }} searchable={false}
            onRowClick={(r) => toggle('facility', r.key)} rowClass={(r) => (sel.facility?.includes(r.key) ? 'row-on' : '')} />
        </Panel>
        <DrillChart metricId="M01" title="DNFB days: drill down" />
      </div>
    </div>
  );
}
