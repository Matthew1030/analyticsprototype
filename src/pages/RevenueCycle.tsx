// Revenue Cycle Overview: the lifecycle from patient access to cash, stage by stage.
// Select a stage to see its metrics, trend and hospital breakdown.

import { useMemo, useState } from 'react';
import type { Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { statusOf, STATUS_RANK, type Status } from '../engine/status';
import { useApp, type PageId } from '../state/AppState';
import { fmtMetric, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, Scorecard, TrendVisual } from '../ui/widgets';

export interface Stage { id: string; name: string; page: PageId; metrics: string[] }

export const STAGES: Stage[] = [
  { id: 'access', name: 'Patient Access', page: 'access', metrics: ['eligibility_rate', 'auth_rate', 'registration_accuracy', 'front_end_denial_rate'] },
  { id: 'charge', name: 'Charge Capture', page: 'midcycle', metrics: ['charge_lag', 'late_charge_pct', 'missing_charges'] },
  { id: 'coding', name: 'Coding', page: 'midcycle', metrics: ['coding_tat', 'coding_denial_rate', 'dnfb_coding'] },
  { id: 'cdi', name: 'Clinical Documentation', page: 'midcycle', metrics: ['documentation_denial_rate', 'cdi_query_rate', 'dnfb_query'] },
  { id: 'billing', name: 'Billing', page: 'billing', metrics: ['clean_claim_rate', 'dnfb_days', 'billing_lag'] },
  { id: 'ar', name: 'A/R', page: 'ar', metrics: ['net_ar_days', 'ar_gt90_pct', 'net_ar'] },
  { id: 'denials', name: 'Denials', page: 'denials', metrics: ['denial_rate', 'denial_dollars', 'appeal_success'] },
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

export function RevenueCycle() {
  const { engine, period, sel, go } = useApp();
  const summaries = useMemo(() => STAGES.map((s) => ({ s, ...stageStatus(engine, s, period, sel) })), [engine, period, sel]);
  const worst = [...summaries].sort((a, b) => b.off * 10 + b.watch - (a.off * 10 + a.watch))[0];
  const [stageId, setStageId] = useState(worst?.s.id ?? 'billing');
  const stage = STAGES.find((x) => x.id === stageId)!;
  return (
    <div className="page">
      <CanvasHeader />
      <div className="flow" role="tablist" aria-label="Revenue cycle stages">
        {summaries.map(({ s, status, off, watch }, i) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === stageId} className={`flow-stage ${s.id === stageId ? 'on' : ''}`} onClick={() => setStageId(s.id)}>
            <span className="flow-head"><span className="flow-num">{i + 1}</span><span className="flow-name">{s.name}</span><StatusMark status={status} compact /></span>
            {s.metrics.slice(0, 3).map((id) => <FlowMetric key={id} id={id} />)}
            <span className="flow-foot">{off ? `${off} off target` : watch ? `${watch} on watch` : 'On target'}</span>
          </button>
        ))}
      </div>
      <div className="row cols-7-5">
        <Scorecard ids={stage.metrics} title={`${stage.name}: metrics`} groupByArea={false} />
        <TrendVisual key={stage.id} id={stage.metrics[0]} months={18} />
      </div>
      <div className="row cols-5-7">
        <BreakdownVisual key={`b-${stage.id}`} id={stage.metrics[0]} dim="facility" title={`${METRIC_BY_ID[stage.metrics[0]].short ?? METRIC_BY_ID[stage.metrics[0]].name} by hospital`} onDrill={(k) => go('facility', { id: String(k) }, { drill: true })} />
        <StageHospitalGrid onPick={setStageId} />
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => go(stage.page, {}, { drill: true })}>Open {stage.name} analysis <Icon name="chevronRight" size={10} /></button>
      </div>
    </div>
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
    <Visual title="Stage status by hospital" subtitle="Worst status among each stage's metrics · click a cell to filter the hospital and open the stage"
      table={gridExport(cols, g)}
      spec={{ type: 'Status matrix (hospital × stage)', dimensions: ['Hospital', 'RCM stage'], interactions: 'Cell click filters hospital and selects stage' }}>
      <Grid caption="Stage status by hospital" columns={cols} rows={g} dense />
      <div className="legend-row"><StatusMark status="On target" /><StatusMark status="Watch" /><StatusMark status="Off target" /></div>
    </Visual>
  );
}
