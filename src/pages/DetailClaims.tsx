import { useEffect, useMemo } from 'react';
import { METRIC_BY_ID, evaluate } from '../engine/metrics';
import { quarterOfMonth, quarterPeriod, trailing } from '../engine/periods';
import { fmt, usd } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, lineOption, SERIES } from '../ui/charts';
import { InfoIcon, Panel } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';
import { DrillChart, KpiTile, weekLabel, weeksEnding } from '../ui/widgets';

export function DetailClaims() {
  const { engine, period, sel, ds, registerExport, toggle, selectOnly } = useApp();
  const d = ds.dims;
  const M05 = METRIC_BY_ID.M05;
  const M07 = METRIC_BY_ID.M07;

  // Clean claim rate by facility: prior full quarter vs selected period.
  const baseQ = quarterPeriod(quarterOfMonth(period.startMi) - 1);
  const facs = sel.facility?.length ? d.facilities.filter((f) => sel.facility!.includes(f.key)) : d.facilities;
  const cleanRows = facs.map((f) => ({
    f,
    base: evaluate(M05, engine, baseQ, { ...sel, facility: [f.key] }).value,
    cur: evaluate(M05, engine, period, { ...sel, facility: [f.key] }).value,
  })).sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0));

  // Rework by edit category.
  const edits = d.editCategories.map((c) => ({ ...c, value: evaluate(METRIC_BY_ID.M06, engine, period, { ...sel, editCategory: [c.key] }).value }));

  // Weekly denial rate: selection vs all facilities (26 weeks).
  const weeks = weeksEnding(period.endDay, 26);
  const facSelected = (sel.facility?.length ?? 0) > 0;
  const wkSel = weeks.map((w) => evaluate(M07, engine, w, sel).value);
  const wkAll = facSelected ? weeks.map((w) => evaluate(M07, engine, w, { ...sel, facility: [] }).value) : null;

  // Denial share by category and write-offs by reason.
  const totalDenied = engine.sum('claims', 'denAmt', 'denD', period.startDay, period.endDay, { ...sel, denialCategory: [] });
  const cats = d.denialCategories.map((n, i) => ({ key: i, name: n, value: totalDenied > 0 ? evaluate(METRIC_BY_ID.M08, engine, period, { ...sel, denialCategory: [i] }).value! / totalDenied : null }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const wos = d.writeOffReasons.map((r) => ({ ...r, value: evaluate(METRIC_BY_ID.M20, engine, period, { ...sel, writeOffReason: [r.key] }).value }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  // Pivot: denials by reason x last 6 periods.
  const pPeriods = trailing(period, 6);
  type PRow = { key: number; name: string; vals: (number | null)[]; dim: 'reason' | 'fc' };
  const pivot: PRow[] = useMemo(() => [
    ...d.denialReasons.map((r) => ({ key: r.key, name: `Reason: ${r.name}`, dim: 'reason' as const, vals: pPeriods.map((p) => denialsByReason(r.key, p)) })),
    ...d.financialClasses.filter((_, i) => i !== 6).map((n, i) => ({ key: i, name: `Payer class: ${n}`, dim: 'fc' as const, vals: pPeriods.map((p) => evaluate(METRIC_BY_ID.M08, engine, p, { ...sel, financialClass: [i] }).value) })),
  ], [engine, period, sel, ds]);

  function denialsByReason(reason: number, p: { startDay: number; endDay: number }) {
    // Denial reason is finer than category: sum rows for this reason only.
    const c = ds.claims;
    let s = 0;
    const fac = sel.facility?.length ? new Set(sel.facility) : null;
    const pay = sel.payer?.length ? new Set(sel.payer) : null;
    const fc = sel.financialClass?.length ? new Set(sel.financialClass) : null;
    const svc = sel.serviceLine?.length ? new Set(sel.serviceLine) : null;
    for (let i = 0; i < c.n; i++) {
      if (c.denR[i] !== reason || c.denD[i] < p.startDay || c.denD[i] > p.endDay) continue;
      if ((fac && !fac.has(c.fac[i])) || (pay && !pay.has(c.payer[i])) || (fc && !fc.has(d.payers[c.payer[i]].fc)) || (svc && !svc.has(c.svc[i]))) continue;
      s += c.denAmt[i];
    }
    return s;
  }
  const pCols: Column<PRow>[] = [
    { key: 'n', label: 'Initial denials ($)', value: (r) => r.name, metricId: 'M08' },
    ...pPeriods.map((p, i) => ({ key: `p${i}`, label: p.short, align: 'right' as const, value: (r: PRow) => r.vals[i], text: (r: PRow) => fmt(r.vals[i], 'usd') })),
  ];

  useEffect(() => {
    registerExport({ title: `Initial denials by reason and payer class`, ...tableToExport(pCols, pivot) });
    return () => registerExport(null);
  });

  return (
    <div className="page">
      <div className="kpi-row">
        {['M05', 'M06', 'M07', 'M08', 'M19'].map((id) => <KpiTile key={id} id={id} page="claims" />)}
      </div>
      <div className="grid-2">
        <Panel title={`Clean claim rate by facility: ${baseQ.label} vs ${period.label}`} qlik="Bar chart (grouped)" metricId="M05">
          <Chart
            option={barOption({ labels: cleanRows.map((r) => r.f.name), series: [{ name: baseQ.label, data: cleanRows.map((r) => r.base), color: '#9ec5f4' }, { name: period.label, data: cleanRows.map((r) => r.cur), color: SERIES[0] }], fmt: (v) => fmt(v, 'pct', 0), horizontal: true, target: 0.9 })}
            height={Math.max(220, cleanRows.length * 34 + 40)}
            ariaLabel="Clean claim rate by facility"
            onClick={(i) => selectOnly('facility', [cleanRows[i].f.key])}
          />
        </Panel>
        <Panel title="Rework claims by edit category" qlik="Bar chart" metricId="M06" info="Click a bar to select the edit category.">
          <Chart
            option={barOption({ labels: edits.map((e) => e.name), series: [{ name: 'Rework claims', data: edits.map((e) => e.value) }], fmt: (v) => fmt(v, 'count'),
              highlight: sel.editCategory?.length ? edits.map((e, i) => (sel.editCategory!.includes(e.key) ? i : -1)).filter((i) => i >= 0) : undefined })}
            height={240}
            ariaLabel="Rework claims by edit category"
            onClick={(i) => toggle('editCategory', edits[i].key)}
          />
        </Panel>
      </div>
      <Panel title="Initial denial rate, weekly" qlik="Line chart" metricId="M07">
        <Chart
          option={lineOption({ labels: weeks.map(weekLabel), series: [{ name: facSelected ? 'Selected facilities' : 'All facilities', data: wkSel }, ...(wkAll ? [{ name: 'All facilities', data: wkAll, color: '#898781' }] : [])], fmt: (v) => fmt(v, 'pct', 0), target: 0.1, min: 0 })}
          height={260}
          ariaLabel="Weekly initial denial rate"
        />
      </Panel>
      <div className="grid-2">
        <Panel title="Denial share by category" qlik="Bar chart" metricId="M09" info="Click a bar to select the denial category. The selection applies to denial measures.">
          <Chart
            option={barOption({ labels: cats.map((c) => c.name), series: [{ name: 'Share of denied $', data: cats.map((c) => c.value) }], fmt: (v) => fmt(v, 'pct', 0), horizontal: true,
              highlight: sel.denialCategory?.length ? cats.map((c, i) => (sel.denialCategory!.includes(c.key) ? i : -1)).filter((i) => i >= 0) : undefined })}
            height={300}
            ariaLabel="Denial share by category"
            onClick={(i) => toggle('denialCategory', cats[i].key)}
          />
        </Panel>
        <Panel title="Denial write-offs by reason" qlik="Bar chart" metricId="M20" info="Click a bar to select the write-off reason.">
          <Chart
            option={barOption({ labels: wos.map((w) => w.name), series: [{ name: 'Write-offs', data: wos.map((w) => w.value), color: SERIES[1] }], fmt: usd, horizontal: true,
              highlight: sel.writeOffReason?.length ? wos.map((w, i) => (sel.writeOffReason!.includes(w.key) ? i : -1)).filter((i) => i >= 0) : undefined })}
            height={300}
            ariaLabel="Denial write-offs by reason"
            onClick={(i) => toggle('writeOffReason', wos[i].key)}
          />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Initial denials by reason and payer class" qlik="Pivot table">
          <DataTable caption="Initial denials by reason and payer class" columns={pCols} rows={pivot} pageSize={20} />
        </Panel>
        <DrillChart metricId="M07" title="Initial denial rate: drill down" />
      </div>
      <p className="small muted">
        Detail selections (denial category, edit category, write-off reason) apply only to the measures that carry that field.
        <InfoIcon title="Detail selections" text="In Qlik, a selection on a denial field filters every object through the associative model. This prototype applies it only to denial, edit or write-off measures. See the known gaps list." />
      </p>
    </div>
  );
}
