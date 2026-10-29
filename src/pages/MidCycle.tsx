// Mid-Cycle: charge capture, coding and clinical documentation (CDI). One tab per stage (the stage
// numbers match the Revenue Cycle Overview), each in the standard order: Performance, Trend, Where,
// Why, Act. Act opens the DNFB worklist filtered to the stage's hold reason.

import { useMemo } from 'react';
import { useApp } from '../state/AppState';
import { usd } from '../format';
import { Chart } from '../ui/Chart';
import { barOption, SERIES } from '../ui/charts';
import { snapshotLabel } from '../ui/common';
import { Icon } from '../ui/icons';
import { CanvasHeader } from '../ui/Shell';
import { Band, Bands, TabBox, useGroupStatus, useTab, type TabDef } from '../ui/TabBox';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, TrendVisual } from '../ui/widgets';

interface MidTab { id: string; label: string; num: number; kpis: string[]; hold: number; holdName: string }

/** hold = the DNFB hold reason the stage owns (Charge reconciliation, Awaiting coding, Physician query). */
const TABS: MidTab[] = [
  { id: 'charge', label: 'Charge Capture', num: 2, hold: 3, holdName: 'charge reconciliation',
    kpis: ['charge_lag', 'late_charge_pct', 'late_charges_dollars', 'missing_charges', 'missed_charge_rate', 'charges_posted'] },
  { id: 'coding', label: 'Coding', num: 3, hold: 1, holdName: 'awaiting coding',
    kpis: ['coding_tat', 'coding_tat_ip', 'final_coded_volume', 'coding_denial_rate', 'dnfb_coding'] },
  { id: 'cdi', label: 'Clinical Documentation (CDI)', num: 4, hold: 2, holdName: 'physician query',
    kpis: ['cdi_query_rate', 'documentation_denial_rate', 'dnfb_query'] },
];
const TAB_KPIS = TABS.map((t) => t.kpis);

export function MidCycle() {
  const status = useGroupStatus(TAB_KPIS);
  const tabs: TabDef[] = TABS.map((t, i) => ({ id: t.id, label: t.label, num: t.num, status: status[i] }));
  const [tab, open] = useTab(tabs);
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <div className="page">
      <CanvasHeader />
      <TabBox id="mid" tabs={tabs} current={tab} onOpen={open} label="Mid-cycle stages"
        spec={<><b>Container (tabbed)</b> · 3 tabs, one per mid-cycle stage · Tab label: stage name with its status · Each tab: Performance, Trend, Where, Why, Act</>}>
        <KpiBand ids={t.kpis} />
        {tab === 'charge' && <ChargeCapture />}
        {tab === 'coding' && <Coding />}
        {tab === 'cdi' && <Cdi />}
        <ActBand t={t} />
      </TabBox>
    </div>
  );
}

function KpiBand({ ids }: { ids: string[] }) {
  return <><Band type="kpi" /><KpiStrip ids={ids} /></>;
}

function useDrill() {
  const { go } = useApp();
  return (k: number) => go('facility', { id: String(k) }, { drill: true });
}

function ChargeCapture() {
  const drill = useDrill();
  return (
    <Bands
      trend={[
        <TrendVisual id="late_charge_pct" alt={['late_charges_dollars']} months={18} height={220} />,
        <TrendVisual id="charge_lag" months={18} height={220} />,
      ]}
      where={[
        <BreakdownVisual id="late_charge_pct" alt={['late_charges_dollars']} dim="facility" title="Late charges by hospital" onDrill={drill} />,
        <BreakdownVisual id="missed_charge_rate" alt={['missing_charges']} dim="facility" onDrill={drill} />,
      ]}
      why={[
        <BreakdownVisual id="charge_lag" dim="serviceLine" title="Charge lag by service line" />,
        <BreakdownVisual id="charges_posted" dim="serviceLine" dims={['serviceLine', 'patientType']} title="Charges posted by service line" />,
      ]} />
  );
}

function Coding() {
  const drill = useDrill();
  return (
    <Bands
      trend={[
        <TrendVisual id="coding_tat" alt={['coding_tat_ip']} months={18} height={220} />,
        <TrendVisual id="coding_denial_rate" months={18} height={220} />,
      ]}
      where={[
        <BreakdownVisual id="coding_tat" dim="facility" title="Coding turnaround by hospital" onDrill={drill} />,
        <BreakdownVisual id="coding_denial_rate" dim="facility" onDrill={drill} />,
      ]}
      why={[
        <BreakdownVisual id="coding_tat" dim="patientType" dims={['patientType', 'serviceLine', 'payer']} title="Coding turnaround by type" />,
        <BreakdownVisual id="final_coded_volume" dim="patientType" dims={['patientType', 'facility', 'serviceLine']} title="Final coded accounts" />,
      ]} />
  );
}

function Cdi() {
  const drill = useDrill();
  return (
    <Bands
      trend={[
        <TrendVisual id="documentation_denial_rate" months={18} height={220} />,
        <TrendVisual id="cdi_query_rate" months={18} height={220} />,
      ]}
      where={[
        <BreakdownVisual id="cdi_query_rate" dim="facility" onDrill={drill} />,
        <BreakdownVisual id="documentation_denial_rate" dim="facility" onDrill={drill} />,
      ]}
      why={[
        <BreakdownVisual id="documentation_denial_rate" dim="payer" title="Documentation-related denial rate by payer" top={11} />,
        <BreakdownVisual id="cdi_query_rate" dim="serviceLine" dims={['serviceLine', 'patientType']} title="CDI query rate by service line" />,
      ]} />
  );
}

function ActBand({ t }: { t: MidTab }) {
  const { go, selectOnly } = useApp();
  const work = () => { selectOnly('dnfbHold', [t.hold]); go('wl-dnfb', {}, { drill: true }); };
  return (
    <>
      <Band type="act" actions={<button type="button" className="btn btn-primary btn-cta" onClick={work}>Work {t.holdName} accounts in the DNFB worklist <Icon name="chevronRight" size={11} /></button>} />
      <MidCycleHolds />
    </>
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
    <Visual title="DNFB held by mid-cycle reasons" subtitle={`By hospital at ${snapshotLabel(day)} · click a hospital to filter`}
      table={{ columns: ['Hospital', ...holds.map((h) => ds.dims.dnfbHolds[h].name)], rows: data.map((d) => [d.f.short, ...d.vals.map((v) => usd(v))]) }}
      spec={{ type: 'Stacked bar chart (horizontal)', metrics: ['dnfb_coding', 'dnfb_query'], dimensions: ['Hospital', 'DNFB hold reason'], interactions: 'Click filters the hospital' }}>
      <Chart height={Math.max(200, data.length * 24 + 40)} ariaLabel="DNFB held by mid-cycle reasons by hospital"
        option={barOption({ labels: data.map((d) => d.f.short), horizontal: true, stacked: true, fmt: usd, series: holds.map((h, i) => ({ name: ds.dims.dnfbHolds[h].name, data: data.map((d) => d.vals[i]), color: SERIES[i] })) })}
        onClick={(i) => selectOnly('facility', [data[i].f.key])} />
    </Visual>
  );
}
