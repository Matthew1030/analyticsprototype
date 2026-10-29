// Revenue Cycle Overview: the analytical entry point. One tabbed container is the center of the
// page: an Overview tab (headline KPIs, the stages at a glance, where to look first, stage status by
// hospital, then the full scorecard and hospital matrix), and one tab per lifecycle stage from
// patient access to cash (its KPIs, trend and hospital breakdown, and a clear path to the stage's
// analysis page). Each tab label carries the stage status, so the tab bar itself shows where to look.

import { useMemo } from 'react';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { statusOf, STATUS_RANK, type Status } from '../engine/status';
import { useApp, type PageId } from '../state/AppState';
import { fmtMetric, PageSection, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { CanvasHeader, PAGE_BY_ID } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, Scorecard, TrendVisual } from '../ui/widgets';
import { AttentionList, EXEC_KPIS, FacilityMatrix } from './EnterpriseOverview';

export interface Stage { id: string; name: string; page: PageId; metrics: string[] }

export const STAGES: Stage[] = [
  { id: 'access', name: 'Patient Access', page: 'access', metrics: ['eligibility_rate', 'auth_rate', 'registration_accuracy', 'front_end_denial_rate'] },
  { id: 'charge', name: 'Charge Capture', page: 'midcycle', metrics: ['charge_lag', 'late_charge_pct', 'missing_charges'] },
  { id: 'coding', name: 'Coding', page: 'midcycle', metrics: ['coding_tat', 'coding_denial_rate', 'dnfb_coding'] },
  { id: 'cdi', name: 'Clinical Documentation', page: 'midcycle', metrics: ['documentation_denial_rate', 'cdi_query_rate', 'dnfb_query'] },
  { id: 'billing', name: 'Billing', page: 'billing', metrics: ['clean_claim_rate', 'dnfb_days', 'billing_lag'] },
  { id: 'denials', name: 'Denials', page: 'denials', metrics: ['denial_rate', 'denial_dollars', 'appeal_success'] },
  { id: 'ar', name: 'A/R', page: 'ar', metrics: ['net_ar_days', 'ar_gt90_pct', 'net_ar'] },
  { id: 'cash', name: 'Cash', page: 'cash', metrics: ['cash_pct_npsr', 'cash', 'net_collection_rate'] },
];

/** Worst status among a stage's metrics that have targets. */
function stageStatus(e: Parameters<typeof evaluate>[1], st: Stage, r: Parameters<typeof evaluate>[2], sel: Selections): { status: Status; off: number; watch: number } {
  let worst: Status = null;
  let off = 0, watch = 0;
  for (const id of st.metrics) {
    const m = METRIC_BY_ID[id];
    const v = evaluate(m, e, r, sel);
    const s = statusOf(v.value, v.target, m.direction, v.watch);
    if (s === 'Off target') off++;
    if (s === 'Watch') watch++;
    if (s && (worst === null || STATUS_RANK[s] < STATUS_RANK[worst])) worst = s;
  }
  return { status: worst, off, watch };
}

type Summary = { s: Stage; status: Status; off: number; watch: number };

const statusText = (off: number, watch: number) => (off ? `${off} off target` : watch ? `${watch} on watch` : 'On target');

export function RevenueCycle() {
  const { engine, period, sel, route, setParams, specMode } = useApp();
  const summaries = useMemo(() => STAGES.map((s) => ({ s, ...stageStatus(engine, s, period, sel) })), [engine, period, sel]);
  const tab = STAGES.some((x) => x.id === route.params.stage) ? route.params.stage : 'overview';
  const open = (id: string) => setParams(id === 'overview' ? {} : { stage: id });
  const current = summaries.find((x) => x.s.id === tab);
  return (
    <div className="page">
      <CanvasHeader />
      <section className="tabbox" aria-label="Revenue cycle">
        <div className="tabbox-bar" role="tablist" aria-label="Revenue cycle: overview and stages">
          <button type="button" role="tab" id="rc-tab-overview" aria-selected={tab === 'overview'} aria-controls="rc-panel"
            className={`tabbox-tab tabbox-tab-home ${tab === 'overview' ? 'on' : ''}`} onClick={() => open('overview')}>
            <Icon name="chart" size={12} /> Overview
          </button>
          {summaries.map(({ s, status, off, watch }, i) => (
            <button key={s.id} type="button" role="tab" id={`rc-tab-${s.id}`} aria-selected={tab === s.id} aria-controls="rc-panel"
              className={`tabbox-tab ${tab === s.id ? 'on' : ''}`} title={`${s.name}: ${statusText(off, watch)}`} onClick={() => open(s.id)}>
              <span className="tabbox-num">{i + 1}</span>{s.name.replace('Clinical Documentation', 'CDI')}<StatusMark status={status} compact />
            </button>
          ))}
        </div>
        <div className="tabbox-panel" role="tabpanel" id="rc-panel" aria-labelledby={`rc-tab-${tab}`}>
          {current ? <StageTab key={current.s.id} sum={current} index={STAGES.indexOf(current.s)} onPick={open} /> : <OverviewTab summaries={summaries} onPick={open} />}
        </div>
        {specMode && (
          <footer className="spec-note">
            <b>Container (tabbed)</b> · 9 tabs: Overview, then one per stage in cycle order · Tab label: stage name with its status
            (worst status of the stage metrics) · Interaction: stage cards and status-matrix cells switch the tab · The stage action is a navigation button to the analysis sheet
          </footer>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- overview tab

function OverviewTab({ summaries, onPick }: { summaries: Summary[]; onPick: (id: string) => void }) {
  const { areas } = useApp();
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
      <PageSection title="Detail" note="The full enterprise scorecard and every hospital against the key metrics" />
      <Scorecard ids={ids.length ? ids : EXEC_KPIS} title="Enterprise scorecard" groupByArea={false} showPy={false} />
      <FacilityMatrix />
    </>
  );
}

// ---------------------------------------------------------------- stage tab

function StageTab({ sum, index, onPick }: { sum: Summary; index: number; onPick: (id: string) => void }) {
  const { go } = useApp();
  const { s, status, off, watch } = sum;
  const dest: PageId = s.page;
  const destLabel = PAGE_BY_ID[dest].label;
  const first = s.metrics[0];
  const rest = s.metrics.slice(1);
  const next = STAGES[index + 1];
  const prev = STAGES[index - 1];
  const analyze = () => go(dest, {}, { drill: true });
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
            <b>Find the cause in {destLabel} analysis</b>
            <span>{PAGE_BY_ID[dest].question}</span>
          </div>
          <button type="button" className="btn btn-primary btn-cta" onClick={analyze}>Open {destLabel} analysis <Icon name="chevronRight" size={11} /></button>
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
        <button type="button" className="btn btn-primary btn-cta" onClick={analyze}>Open {destLabel} analysis <Icon name="chevronRight" size={11} /></button>
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
    key: f.key, name: f.short, st: STAGES.map((s) => stageStatus(engine, s, period, { ...sel, facility: [f.key] })),
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
