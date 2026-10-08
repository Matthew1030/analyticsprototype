// Mid-Cycle: charge capture, coding and clinical documentation (CDI).

import { useMemo } from 'react';
import { useApp } from '../state/AppState';
import { usd } from '../format';
import { Chart } from '../ui/Chart';
import { barOption, SERIES } from '../ui/charts';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, Scorecard, TrendVisual } from '../ui/widgets';

const MID_IDS = ['charge_lag', 'late_charge_pct', 'missing_charges', 'charges_posted', 'coding_tat', 'coding_tat_ip', 'coding_denial_rate', 'dnfb_coding', 'cdi_query_rate', 'documentation_denial_rate', 'dnfb_query'];

export function MidCycle() {
  const { go } = useApp();
  const drill = (k: number) => go('facility', { id: String(k) }, { drill: true });
  return (
    <div className="page">
      <CanvasHeader />
      <KpiStrip ids={['charge_lag', 'late_charge_pct', 'missing_charges', 'coding_tat', 'coding_tat_ip', 'cdi_query_rate', 'documentation_denial_rate']} />
      <div className="row cols-7-5">
        <Scorecard ids={MID_IDS} title="Mid-cycle scorecard" />
        <div className="stack">
          <TrendVisual id="coding_tat" months={18} height={200} />
          <TrendVisual id="late_charge_pct" months={18} height={200} />
        </div>
      </div>
      <div className="row cols-3">
        <BreakdownVisual id="charge_lag" dim="serviceLine" title="Charge lag by service line" />
        <BreakdownVisual id="late_charge_pct" dim="facility" title="Late charges by hospital" onDrill={drill} />
        <BreakdownVisual id="coding_tat" dim="facility" title="Coding turnaround by hospital" onDrill={drill} />
      </div>
      <div className="row cols-2">
        <MidCycleHolds />
        <BreakdownVisual id="documentation_denial_rate" dim="payer" title="Documentation-related denial rate by payer" top={11} />
      </div>
    </div>
  );
}

/** DNFB dollars held by mid-cycle reasons, by hospital (stacked). */
function MidCycleHolds() {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const day = engine.snapshotDayOnOrBefore('dnfb', period.endDay);
  const holds = [1, 2, 3];
  const facs = engine.facilitySet(sel);
  const data = useMemo(() => ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => ({
    f, vals: holds.map((h) => (day === null ? 0 : engine.snapshot('dnfb', 'amount', day, { ...sel, facility: [f.key], dnfbHold: [h] }, { stage: 0 }))),
  })).sort((a, b) => b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0)), [engine, day, sel, ds, facs]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Visual title="DNFB held by mid-cycle reasons" subtitle={`By hospital at ${period.short} month end · click a hospital to filter`}
      table={{ columns: ['Hospital', ...holds.map((h) => ds.dims.dnfbHolds[h].name)], rows: data.map((d) => [d.f.short, ...d.vals.map((v) => usd(v))]) }}
      spec={{ type: 'Stacked bar chart (horizontal)', metrics: ['dnfb_coding', 'dnfb_query'], dimensions: ['Hospital', 'DNFB hold reason'], interactions: 'Click filters the hospital' }}>
      <Chart height={Math.max(200, data.length * 24 + 40)} ariaLabel="DNFB held by mid-cycle reasons by hospital"
        option={barOption({ labels: data.map((d) => d.f.short), horizontal: true, stacked: true, fmt: usd, series: holds.map((h, i) => ({ name: ds.dims.dnfbHolds[h].name, data: data.map((d) => d.vals[i]), color: SERIES[i] })) })}
        onClick={(i) => selectOnly('facility', [data[i].f.key])} />
    </Visual>
  );
}
