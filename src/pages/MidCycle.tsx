// Mid-Cycle: charge capture, coding and clinical documentation (CDI). One tab per stage (the stage
// numbers match the Revenue Cycle Overview), each in the standard order: Performance, Trend, Where,
// Why, Act. Act opens the DNFB worklist filtered to the stage's hold reason.

import { useApp } from '../state/AppState';
import { Icon } from '../ui/icons';
import { CanvasHeader } from '../ui/Shell';
import { Band, Bands, TabBox, useGroupStatus, useTab, type TabDef } from '../ui/TabBox';
import { BreakdownVisual, KpiStrip, TrendVisual } from '../ui/widgets';
import { DnfbByOwner, WriteoffsByReason } from '../ui/workbook';

interface MidTab { id: string; label: string; num: number; kpis: string[]; hold: number; holdName: string }

/** hold = the DNFB hold reason the stage owns (Charge reconciliation, Awaiting coding, Physician query). */
const TABS: MidTab[] = [
  { id: 'charge', label: 'Charge Capture', num: 2, hold: 3, holdName: 'charge reconciliation',
    kpis: ['charge_lag', 'late_charge_pct', 'late_charges_dollars', 'missing_charges', 'missed_charge_rate', 'charges_posted'] },
  { id: 'coding', label: 'Coding', num: 3, hold: 1, holdName: 'awaiting coding',
    kpis: ['coding_denial_rate', 'dnfb_mid_cycle_4plus', 'epars_him', 'coding_tat', 'coding_tat_ip', 'final_coded_volume', 'dnfb_coding'] },
  { id: 'cdi', label: 'Clinical Documentation (CDI)', num: 4, hold: 2, holdName: 'physician query',
    kpis: ['documentation_denial_rate', 'denial_writeoffs', 'denial_wo_pct_npsr', 'cdi_query_rate', 'dnfb_query'] },
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
        <TrendVisual id="coding_denial_rate" months={18} height={220} />,
        <TrendVisual id="epars_him" alt={['dnfb_mid_cycle_4plus']} months={18} height={220} />,
      ]}
      where={[
        <BreakdownVisual id="coding_denial_rate" dim="facility" onDrill={drill} />,
        <BreakdownVisual id="dnfb_mid_cycle_4plus" alt={['epars_him']} dim="facility" onDrill={drill} />,
        <BreakdownVisual id="coding_tat" dim="facility" title="Coding turnaround by hospital" onDrill={drill} />,
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
        <BreakdownVisual id="documentation_denial_rate" dim="facility" onDrill={drill} />,
        <BreakdownVisual id="cdi_query_rate" dim="facility" onDrill={drill} />,
      ]}
      why={[
        <BreakdownVisual id="denial_dollars" dim="denialCategory" title="Denied $ by reason" subtitle="Documentation reasons: Lacks Information/Med Records and Medical Necessity · click to filter" />,
        <WriteoffsByReason />,
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
      <DnfbByOwner />
    </>
  );
}
