// Revenue Cycle Overview: the analytical entry point. One tabbed container is the center of the
// page: an Overview tab (headline KPIs, the stages at a glance, where to look first, stage status by
// hospital, then the full scorecard) and one tab per lifecycle stage from patient access to cash
// (its KPIs, trend and hospital breakdown, and a clear path to the stage's analysis view). Each tab
// label carries the stage status, so the tab bar itself shows where to look.

import { useMemo } from 'react';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { statusOf, STATUS_RANK, type Status } from '../engine/status';
import { useApp, type PageId } from '../state/AppState';
import { fmtMetric, PageSection, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { CanvasHeader, PAGE_BY_ID } from '../ui/Shell';
import { groupStatus, statusText, TabBox, useGroupStatus, useTab, type GroupStatus, type TabDef } from '../ui/TabBox';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, Scorecard, TrendVisual } from '../ui/widgets';
import { AttentionList, EXEC_KPIS } from './EnterpriseOverview';

export interface Stage {
  id: string; name: string; page: PageId; metrics: string[];
  /** Tab of the analysis page that covers the stage (pages that cover more than one stage). */
  tab?: string;
}

export const STAGES: Stage[] = [
  { id: 'access', name: 'Patient Access', page: 'access', metrics: ['eligibility_rate', 'auth_rate', 'registration_accuracy', 'front_end_denial_rate'] },
  { id: 'charge', name: 'Charge Capture', page: 'midcycle', tab: 'charge', metrics: ['charge_lag', 'late_charge_pct', 'missing_charges'] },
  { id: 'coding', name: 'Coding', page: 'midcycle', tab: 'coding', metrics: ['coding_tat', 'coding_denial_rate', 'dnfb_coding'] },
  { id: 'cdi', name: 'Clinical Documentation', page: 'midcycle', tab: 'cdi', metrics: ['documentation_denial_rate', 'cdi_query_rate', 'dnfb_query'] },
  { id: 'billing', name: 'Billing', page: 'billing', metrics: ['clean_claim_rate', 'dnfb_days', 'billing_lag'] },
  { id: 'denials', name: 'Denials', page: 'denials', metrics: ['denial_rate', 'denial_dollars', 'appeal_success'] },
  { id: 'ar', name: 'A/R', page: 'ar', metrics: ['net_ar_days', 'ar_gt90_pct', 'net_ar'] },
  { id: 'cash', name: 'Cash', page: 'cash', metrics: ['cash_pct_npsr', 'cash', 'net_collection_rate'] },
];
const STAGE_METRICS = STAGES.map((s) => s.metrics);

type Summary = GroupStatus & { s: Stage };

export function RevenueCycle() {
  const status = useGroupStatus(STAGE_METRICS);
  const summaries: Summary[] = STAGES.map((s, i) => ({ s, ...status[i] }));
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview', home: true },
    ...STAGES.map((s, i) => ({ id: s.id, label: s.name.replace('Clinical Documentation', 'CDI'), num: i + 1, status: status[i] })),
  ];
  const [tab, open] = useTab(tabs, 'stage');
  const current = summaries.find((x) => x.s.id === tab);
  return (
    <div className="page">
      <CanvasHeader />
      <TabBox id="rc" tabs={tabs} current={tab} onOpen={open} label="Revenue cycle: overview and stages"
        spec={<><b>Container (tabbed)</b> · 9 tabs: Overview, then one per stage in cycle order · Tab label: stage name with its status
          (worst status of the stage metrics) · Interaction: stage cards and status-matrix cells switch the tab · The stage action is a navigation button to the analysis sheet (and its tab)</>}>
        {current ? <StageTab key={current.s.id} sum={current} index={STAGES.indexOf(current.s)} onPick={open} /> : <OverviewTab summaries={summaries} onPick={open} />}
      </TabBox>
    </div>
  );
}

// ---------------------------------------------------------------- overview tab

function OverviewTab({ summaries, onPick }: { summaries: Summary[]; onPick: (id: string) => void }) {
  const { areas, go } = useApp();
  const ids = areas.length ? EXEC_KPIS.filter((id) => areas.includes(METRIC_BY_ID[id].area)) : EXEC_KPIS;
  return (
    <>
      <KpiStrip ids={['npsr', 'cash', 'cash_pct_npsr', 'net_ar_days', 'denial_rate', 'clean_claim_rate', 'dnfb_days']} />
      <Visual title="Revenue cycle stages" subtitle="Worst status among each stage's metrics · select a stage to open its tab"
        table={{ columns: ['Stage', 'Status', 'Metrics off target', 'Metrics on watch'], rows: summaries.map(({ s, status, off, watch }) => [s.name, status ?? 'No target', off, watch]) }}
        spec={{ type: 'Stage cards (KPI objects in a row, or a button bar)', metrics: STAGES.flatMap((s) => s.metrics.slice(0, 3)), dimensions: ['RCM stage'], interactions: 'Card click opens the stage tab' }}>
        <div className="flow">
          {summaries.map(({ s, status, off, watch }, i) => (
            <button key={s.id} type="button" className="flow-stage" onClick={() => onPick(s.id)} title={`Open the ${s.name} tab`}>
              <span className="flow-head"><span className="flow-num">{i + 1}</span><span className="flow-name">{s.name}</span><StatusMark status={status} compact /></span>
              {s.metrics.slice(0, 3).map((id) => <FlowMetric key={id} id={id} />)}
              <span className="flow-foot"><span>{statusText(off, watch)}</span><span className="flow-go">View <Icon name="chevronRight" size={9} /></span></span>
            </button>
          ))}
        </div>
      </Visual>
      <div className="row cols-5-7">
        <AttentionList />
        <StageHospitalGrid onPick={onPick} />
      </div>
      <PageSection title="Detail" note="The full enterprise scorecard" />
      <Scorecard ids={ids.length ? ids : EXEC_KPIS} title="Enterprise scorecard" groupByArea={false} showPy={false} />
      <div className="row">
        <button type="button" className="btn" onClick={() => go('facilities', {}, { drill: true })}>Compare all hospitals in Facilities <Icon name="chevronRight" size={10} /></button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- stage tab

function StageTab({ sum, index, onPick }: { sum: Summary; index: number; onPick: (id: string) => void }) {
  const { go } = useApp();
  const { s, status, off, watch } = sum;
  const page = PAGE_BY_ID[s.page];
  const first = s.metrics[0];
  const rest = s.metrics.slice(1);
  const next = STAGES[index + 1];
  const prev = STAGES[index - 1];
  const analyze = () => go(s.page, s.tab ? { tab: s.tab } : {}, { drill: true });
  const cta = <button type="button" className="btn btn-primary btn-cta" onClick={analyze}>Open {s.name} analysis <Icon name="chevronRight" size={11} /></button>;
  return (
    <>
      <div className="stage-head">
        <div className="stage-head-text">
          <span className="stage-kicker">Stage {index + 1} of {STAGES.length}</span>
          <h2>{s.name} <StatusMark status={status} /></h2>
          <span className="muted small">{statusText(off, watch)} · {s.metrics.length} metrics</span>
        </div>
        <div className="stage-cta">
          <div className="stage-cta-text">
            <b>Find the cause in the {s.name} analysis</b>
            <span>{page.question}{s.tab ? ` (${page.label} page)` : ''}</span>
          </div>
          {cta}
        </div>
      </div>
      <KpiStrip ids={s.metrics} />
      <div className="row cols-7-5">
        <TrendVisual id={first} alt={rest} months={18} height={330} pid={`${s.name} stage trend`} />
        <BreakdownVisual id={first} alt={rest} dim="facility" pid={`${s.name} stage by hospital`}
          onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />
      </div>
      <div className="stage-foot">
        <span>{prev && <button type="button" className="btn" onClick={() => onPick(prev.id)}><Icon name="chevronLeft" size={10} /> {prev.name}</button>}</span>
        {cta}
        <span>{next && <button type="button" className="btn" onClick={() => onPick(next.id)}>{next.name} <Icon name="chevronRight" size={10} /></button>}</span>
      </div>
    </>
  );
}

function FlowMetric({ id }: { id: string }) {
  const { engine, period, sel } = useApp();
  const m = METRIC_BY_ID[id];
  const v = evaluate(m, engine, period, sel);
  const st = statusOf(v.value, v.target, m.direction, v.watch);
  return (
    <span className="flow-metric">
      <span className="flow-mname">{m.short ?? m.name}</span>
      <span className={`flow-mval ${st === 'On target' ? 'txt-ok' : st === 'Watch' ? 'txt-watch' : st ? 'txt-off' : ''}`}>{fmtMetric(id, v.value)}</span>
    </span>
  );
}

interface SRow { key: number; name: string; st: { status: Status; off: number; watch: number }[] }

/** Hospitals x stages: worst status per stage. Which stage is failing where. */
function StageHospitalGrid({ onPick }: { onPick: (id: string) => void }) {
  const { engine, period, sel, ds, selectOnly } = useApp();
  const facs = engine.facilitySet(sel);
  const rows = useMemo(() => ds.dims.facilities.filter((f) => !facs || facs.has(f.key)).map((f) => ({
    key: f.key, name: f.short, st: STAGES.map((s) => groupStatus(engine, s.metrics, period, { ...sel, facility: [f.key] })),
  })), [engine, period, sel, ds, facs]);
  const cols: GridColumn<SRow>[] = [
    { key: 'name', label: 'Hospital', value: (r) => r.name, width: 150 },
    ...STAGES.map((s, i) => ({
      key: s.id, label: s.name.replace('Clinical Documentation', 'CDI').replace('Charge Capture', 'Charges').replace('Patient Access', 'Access'), align: 'center' as const,
      value: (r: SRow) => (r.st[i].status ? STATUS_RANK[r.st[i].status!] : null),
      render: (r: SRow) => (
        <button type="button" className={`stcell st-${r.st[i].status === 'On target' ? 'ok' : r.st[i].status === 'Watch' ? 'watch' : r.st[i].status ? 'off' : 'none'}`}
          title={`${r.name} · ${s.name}: ${r.st[i].status ?? 'No target'} (${r.st[i].off} off, ${r.st[i].watch} watch)`}
          onClick={(e) => { e.stopPropagation(); selectOnly('facility', [r.key]); onPick(s.id); }}>
          <span className="status-shape" aria-hidden="true" /><span className="sr-only">{r.st[i].status}</span>
        </button>
      ),
      exportText: (r: SRow) => r.st[i].status ?? '',
    })),
  ];
  const g = rows.map((r) => ({ id: String(r.key), data: r }));
  return (
    <Visual title="Stage status by hospital" subtitle="Worst status among each stage's metrics · click a cell to filter to the hospital and open the stage tab"
      table={gridExport(cols, g)}
      spec={{ type: 'Status matrix (hospital × stage)', dimensions: ['Hospital', 'RCM stage'], interactions: 'Cell click filters the hospital and opens the stage tab' }}>
      <Grid caption="Stage status by hospital" columns={cols} rows={g} dense />
      <div className="legend-row"><StatusMark status="On target" /><StatusMark status="Watch" /><StatusMark status="Off target" /></div>
    </Visual>
  );
}
