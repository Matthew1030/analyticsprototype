// Patient Access (front end): registration, eligibility, authorization and scheduling.

import { useMemo } from 'react';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { fmt } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, lineOption, SERIES } from '../ui/charts';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { weekLabel, weeksEnding } from '../ui/weekly';
import { BreakdownVisual, KpiStrip, Scorecard, TrendVisual } from '../ui/widgets';

const ACCESS_IDS = [
  'eligibility_rate', 'auth_rate', 'preservice_auth_rate', 'registration_accuracy', 'fin_clearance_rate', 'prereg_rate',
  'scheduled_rate', 'scheduled_volume', 'open_orders', 'pos_collections', 'pos_rate', 'call_abandon_rate', 'asa',
  'coverage_found_rate', 'front_end_denial_rate',
];

export function PatientAccess() {
  const { go } = useApp();
  const drill = (k: number) => go('facility', { id: String(k) }, { drill: true });
  return (
    <div className="page">
      <CanvasHeader />
      <KpiStrip ids={['eligibility_rate', 'auth_rate', 'preservice_auth_rate', 'registration_accuracy', 'fin_clearance_rate', 'pos_rate', 'front_end_denial_rate']} />
      <div className="row cols-7-5">
        <Scorecard ids={ACCESS_IDS} title="Patient access scorecard" groupByArea={false} />
        <div className="stack">
          <TrendVisual id="front_end_denial_rate" months={18} title="Front-end denial rate trend" height={200} />
          <WeeklyScheduling />
        </div>
      </div>
      <div className="row cols-3">
        <BreakdownVisual id="eligibility_rate" dim="facility" title="Eligibility rate by hospital" onDrill={drill} />
        <BreakdownVisual id="preservice_auth_rate" dim="facility" title="Pre-service authorization by hospital" onDrill={drill} />
        <BreakdownVisual id="registration_accuracy" dim="facility" title="Registration accuracy by hospital" onDrill={drill} />
      </div>
      <div className="row cols-3">
        <BreakdownVisual id="front_end_denial_rate" dim="payer" title="Front-end denial rate by payer" top={11} />
        <BreakdownVisual id="fin_clearance_rate" dim="facility" title="Financial clearance by hospital" onDrill={drill} />
        <BreakdownVisual id="pos_collections" dim="facility" title="POS collections by hospital" onDrill={drill} />
      </div>
    </div>
  );
}

/** Weekly scheduled rate and volume (13 weeks). Two charts, one axis each. */
function WeeklyScheduling() {
  const { engine, period, sel } = useApp();
  const weeks = weeksEnding(period.endDay, 13);
  const rate = useMemo(() => weeks.map((w) => evaluate(METRIC_BY_ID.scheduled_rate, engine, w, sel).value), [engine, period.endDay, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const vol = useMemo(() => weeks.map((w) => evaluate(METRIC_BY_ID.scheduled_volume, engine, w, sel).value), [engine, period.endDay, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = evaluate(METRIC_BY_ID.scheduled_rate, engine, period, sel).target;
  const noData = rate.every((v) => v === null) ? evaluate(METRIC_BY_ID.scheduled_rate, engine, period, sel).noData ?? 'No scheduling data.' : null;
  return (
    <Visual title="Scheduling, weekly" metricId="scheduled_rate" noData={noData}
      subtitle={`13 weeks to ${weekLabel(weeks[weeks.length - 1])} · scheduled rate (top) and appointments scheduled (bottom)`}
      table={{ columns: ['Week ending', 'Scheduled rate', 'Scheduled volume'], rows: weeks.map((w, i) => [weekLabel(w), fmt(rate[i], 'pct'), fmt(vol[i], 'count')]) }}
      spec={{ type: 'Two aligned charts (line + columns), shared week axis', metrics: ['scheduled_rate', 'scheduled_volume'], dimensions: ['Week'] }}>
      <Chart height={120} ariaLabel="Weekly scheduled rate" option={lineOption({ labels: weeks.map(weekLabel), series: [{ name: 'Scheduled rate', data: rate }], fmt: (v) => fmt(v, 'pct', 0), target })} />
      <Chart height={100} ariaLabel="Weekly scheduled volume" option={barOption({ labels: weeks.map(weekLabel), series: [{ name: 'Scheduled', data: vol, color: SERIES[0] }], fmt: (v) => fmt(v, 'count'), labels_on: false })} />
    </Visual>
  );
}
