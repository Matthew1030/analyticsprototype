// Patient Access (front end): contact center, scheduling, pre-registration and financial clearance,
// point-of-service collections, eligibility and enrollment, and registration quality.

import { useMemo } from 'react';
import { evaluate, METRIC_BY_ID, ORDER_OUTCOMES } from '../engine/metrics';
import { fmt } from '../format';
import { useApp } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, lineOption, SERIES } from '../ui/charts';
import { metricLabel, PageSection } from '../ui/common';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { weekLabel, weeksEnding } from '../ui/weekly';
import { BreakdownVisual, KpiStrip, Scorecard, TrendVisual } from '../ui/widgets';

const ACCESS_IDS = [
  'eligibility_rate', 'auth_rate', 'preservice_auth_rate', 'registration_accuracy', 'registration_edits',
  'call_volume_total', 'call_abandon_rate_all', 'call_abandon_rate', 'cbo_call_abandon_rate', 'asa',
  'scheduled_rate', 'scheduled_rate_final', 'scheduled_volume', 'open_orders', 'open_orders_24h_pct', 'lead_time_3plus_pct',
  'prereg_rate', 'prereg_rate_72h', 'fin_clearance_rate', 'fin_clearance_rate_72h', 'scheduled_under_72h_pct',
  'pos_collections', 'pos_rate', 'pos_yield', 'pos_estimate_accuracy', 'pos_missed_residual_pct',
  'medicaid_in_scope', 'medicaid_screening_rate', 'medicaid_eligible_completion', 'coverage_found_rate', 'front_end_denial_rate',
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

      <PageSection title="Contact center" note="Patient access line (front end) and business office customer service line (back end)" />
      <KpiStrip ids={['call_volume_total', 'call_volume', 'calls_outbound', 'call_abandon_rate_all', 'call_abandon_rate', 'cbo_call_abandon_rate', 'asa']} />
      <div className="row cols-2">
        <BreakdownVisual id="call_abandon_rate_all" alt={['call_abandon_rate', 'cbo_call_abandon_rate']} dim="facility" onDrill={drill} />
        <TrendVisual id="call_volume_total" alt={['call_abandon_rate_all']} months={18} title="Call volume and abandonment, all lines" />
      </div>

      <PageSection title="Scheduling" note="Order inflow, open inventory and lead time" />
      <KpiStrip ids={['scheduled_rate', 'scheduled_rate_final', 'orders_received', 'open_orders', 'open_orders_24h_pct', 'lead_time_3plus_pct', 'schedule_lead_time']} />
      <div className="row cols-3">
        <OrderOutcomes />
        <BreakdownVisual id="open_orders_24h_pct" alt={['open_orders']} dim="facility" title="Open orders in process > 24 hours by hospital" onDrill={drill} />
        <BreakdownVisual id="lead_time_3plus_pct" alt={['schedule_lead_time']} dim="facility" onDrill={drill} />
      </div>

      <PageSection title="Pre-registration and financial clearance" note="72-hour and before-service windows" />
      <KpiStrip ids={['prereg_rate', 'prereg_rate_72h', 'fin_clearance_rate', 'fin_clearance_rate_72h', 'scheduled_under_72h_pct']} />
      <div className="row cols-3">
        <BreakdownVisual id="prereg_rate_72h" alt={['prereg_rate']} dim="facility" onDrill={drill} />
        <BreakdownVisual id="fin_clearance_rate_72h" alt={['fin_clearance_rate']} dim="facility" onDrill={drill} />
        <BreakdownVisual id="scheduled_under_72h_pct" dim="facility" onDrill={drill} />
      </div>

      <PageSection title="Point-of-service collections" note="Collections against the patient liability estimate" />
      <KpiStrip ids={['pos_collections', 'pos_rate', 'pos_yield', 'pos_estimate_accuracy', 'pos_missed_residual_pct', 'pos_pct_net']} />
      <div className="row cols-3">
        <BreakdownVisual id="pos_collections" dim="facility" title="POS collections by hospital" onDrill={drill} />
        <BreakdownVisual id="pos_yield" alt={['pos_missed_residual_pct']} dim="facility" title="POS yield by hospital" onDrill={drill} />
        <BreakdownVisual id="pos_estimate_accuracy" dim="facility" title="Estimate accuracy by hospital" onDrill={drill} />
      </div>

      <PageSection title="Eligibility and enrollment" note="Insurance verification and Medicaid eligibility for uninsured patients" />
      <KpiStrip ids={['eligibility_rate', 'medicaid_in_scope', 'medicaid_screening_rate', 'coverage_found_rate', 'medicaid_eligible_completion']} />
      <div className="row cols-3">
        <BreakdownVisual id="eligibility_rate" dim="facility" title="Eligibility rate by hospital" onDrill={drill} />
        <BreakdownVisual id="medicaid_screening_rate" alt={['medicaid_in_scope']} dim="facility" onDrill={drill} />
        <BreakdownVisual id="medicaid_eligible_completion" alt={['coverage_found_rate']} dim="facility" onDrill={drill} />
      </div>

      <PageSection title="Registration quality and authorization" />
      <div className="row cols-3">
        <BreakdownVisual id="registration_accuracy" alt={['registration_edits']} dim="facility" onDrill={drill} />
        <BreakdownVisual id="preservice_auth_rate" dim="facility" onDrill={drill} />
        <BreakdownVisual id="front_end_denial_rate" dim="payer" title="Front-end denial rate by payer" top={11} />
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
      <Chart height={100} ariaLabel="Weekly scheduled volume" option={barOption({ labels: weeks.map(weekLabel), series: [{ name: metricLabel('scheduled_volume'), data: vol, color: SERIES[0] }], fmt: (v) => fmt(v, 'count'), labels_on: false })} />
    </Visual>
  );
}

/** Orders closed without an appointment, by final outcome and hospital (stacked). */
function OrderOutcomes() {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const facs = engine.facilitySet(sel);
  const data = useMemo(() => ds.dims.facilities
    .filter((f) => (!facs || facs.has(f.key)) && engine.feHasCol('ordersCancelled', { ...sel, facility: [f.key] }))
    .map((f) => ({ f, vals: ORDER_OUTCOMES.map((o) => engine.sum('fe', o.col, 'day', period.startDay, period.endDay, { ...sel, facility: [f.key] })) }))
    .sort((a, b) => b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0)), [engine, period, sel, ds, facs]);
  const noData = data.length ? null : evaluate(METRIC_BY_ID.orders_closed_unscheduled, engine, period, sel).noData ?? 'No scheduling data.';
  return (
    <Visual title="Orders closed without scheduling" metricId="orders_closed_unscheduled" noData={noData}
      subtitle={`${period.label} · final outcome by hospital · click a hospital to filter`}
      table={{ columns: ['Hospital', ...ORDER_OUTCOMES.map((o) => o.name)], rows: data.map((d) => [d.f.short, ...d.vals.map((v) => fmt(v, 'count'))]) }}
      spec={{ type: 'Stacked bar chart (horizontal)', metrics: ['orders_closed_unscheduled'], dimensions: ['Hospital', 'Order outcome'], interactions: 'Click filters the hospital' }}>
      <Chart height={Math.max(180, data.length * 24 + 40)} ariaLabel="Orders closed without scheduling by outcome and hospital"
        option={barOption({ labels: data.map((d) => d.f.short), horizontal: true, stacked: true, fmt: (v) => fmt(v, 'count'), series: ORDER_OUTCOMES.map((o, i) => ({ name: o.name, data: data.map((d) => d.vals[i]), color: SERIES[i] })) })}
        onClick={(i) => selectOnly('facility', [data[i].f.key])} />
    </Visual>
  );
}
