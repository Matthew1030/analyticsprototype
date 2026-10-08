// Hospital Profile (drill-through): one hospital's revenue cycle performance against target,
// its peer group and the system. Drilling through applies the hospital filter, as in a BI
// drill-through, so every visual (and every page) follows it until the user clears it.

import { useEffect, useMemo } from 'react';
import { FACILITY_TYPES, type Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { changeOf, statusOf, type Status } from '../engine/status';
import { useApp } from '../state/AppState';
import { Delta, fmtMetric, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual, KpiStrip, TrendVisual } from '../ui/widgets';
import { EXEC_KPIS } from './ExecutiveOverview';
import { STAGES } from './RevenueCycle';

export function FacilityProfile() {
  const { route, ds, sel, selectOnly, go } = useApp();
  const key = Number(route.params.id);
  const f = ds.dims.facilities[key] ?? ds.dims.facilities[0];
  useEffect(() => {
    if (sel.facility?.length !== 1 || sel.facility[0] !== f.key) selectOnly('facility', [f.key]);
  }, [f.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const systemSel: Selections = useMemo(() => ({ ...sel, facility: [], region: [], facilityType: [] }), [sel]);
  const ready = sel.facility?.length === 1 && sel.facility[0] === f.key;
  return (
    <div className="page">
      <CanvasHeader title={f.name} question={`${ds.dims.regions[f.region]} · ${f.type} · ${f.beds} beds · ${f.city}`}
        right={(
          <label className="fld inline">Hospital
            <select value={f.key} onChange={(e) => go('facility', { id: e.target.value })}>
              {ds.dims.facilities.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </label>
        )} />
      {ready && (
        <>
          <KpiStrip ids={['npsr', 'cash_pct_npsr', 'net_ar_days', 'denial_rate', 'clean_claim_rate', 'dnfb_days', 'cost_to_collect']} />
          <div className="row cols-7-5">
            <VsSystem facKey={f.key} />
            <div className="stack">
              <TrendVisual id="net_ar_days" months={18} height={200} compareSel={systemSel} compareLabel="System" title="Net A/R days: hospital vs system" />
              <TrendVisual id="denial_rate" months={18} height={200} compareSel={systemSel} compareLabel="System" title="Denial rate: hospital vs system" />
            </div>
          </div>
          <div className="row cols-3">
            <BreakdownVisual id="net_ar" dim="arAge" sortBy="natural" title="Net A/R aging" />
            <BreakdownVisual id="net_ar" dim="payer" title="Net A/R by payer" top={10} />
            <BreakdownVisual id="denial_dollars" dim="denialCategory" title="Denied $ by category" />
          </div>
        </>
      )}
    </div>
  );
}

interface VRow { id: string; label: string; isArea?: boolean; v: number | null; t: number | null; st: Status; peer: number | null; sys: number | null }

/** Every key metric: hospital vs target, peer group and system, grouped by RCM stage. */
function VsSystem({ facKey }: { facKey: number }) {
  const { engine, period, sel, ds, go } = useApp();
  const f = ds.dims.facilities[facKey];
  const rows: GridRow<VRow>[] = useMemo(() => {
    const sys: Selections = { ...sel, facility: [], region: [], facilityType: [] };
    const peer: Selections = { ...sys, facilityType: [FACILITY_TYPES.indexOf(f.type)] };
    const mk = (id: string): VRow => {
      const m = METRIC_BY_ID[id];
      const r = evaluate(m, engine, period, sel);
      return { id, label: m.name, v: r.value, t: r.target, st: statusOf(r.value, r.target, m.direction, r.watch), peer: evaluate(m, engine, period, peer).value, sys: evaluate(m, engine, period, sys).value };
    };
    const groups = [{ name: 'Enterprise', ids: EXEC_KPIS.filter((id) => METRIC_BY_ID[id].unit !== 'usd') }, ...STAGES.map((s) => ({ name: s.name, ids: s.metrics.filter((id) => METRIC_BY_ID[id].unit !== 'usd') }))];
    return groups.map((g) => ({ id: g.name, kind: 'subtotal' as const, data: { id: '', label: g.name, isArea: true, v: null, t: null, st: null, peer: null, sys: null }, children: g.ids.map((id) => ({ id: `${g.name}-${id}`, data: mk(id) })) }));
  }, [engine, period, sel, f, ds]);
  const unit = (r: VRow) => METRIC_BY_ID[r.id]?.unit ?? 'count';
  const cols: GridColumn<VRow>[] = [
    { key: 'label', label: 'Metric', value: (r) => r.label, width: 210, render: (r) => (r.isArea ? <b>{r.label}</b> : r.label) },
    { key: 'v', label: 'Hospital', value: (r) => r.v, render: (r) => (r.isArea ? null : <b>{fmtMetric(r.id, r.v)}</b>), status: (r) => r.st, exportText: (r) => (r.isArea ? '' : fmtMetric(r.id, r.v)) },
    { key: 't', label: 'Target', value: (r) => r.t, render: (r) => (r.isArea ? null : fmtMetric(r.id, r.t)), exportText: (r) => (r.isArea ? '' : fmtMetric(r.id, r.t)) },
    { key: 'st', label: 'Status', value: (r) => r.st ?? '', align: 'left', render: (r) => (r.isArea ? null : <StatusMark status={r.st} />) },
    { key: 'peer', label: `Peer (${f.type})`, value: (r) => r.peer, render: (r) => (r.isArea ? null : fmtMetric(r.id, r.peer)), exportText: (r) => (r.isArea ? '' : fmtMetric(r.id, r.peer)) },
    { key: 'sys', label: 'System', value: (r) => r.sys, render: (r) => (r.isArea ? null : fmtMetric(r.id, r.sys)), exportText: (r) => (r.isArea ? '' : fmtMetric(r.id, r.sys)) },
    { key: 'gap', label: 'vs system', value: (r) => (r.v !== null && r.sys !== null ? r.v - r.sys : null), sortable: false,
      render: (r) => (r.isArea ? null : <Delta d={r.v !== null && r.sys !== null ? r.v - r.sys : null} unit={unit(r)} digits={METRIC_BY_ID[r.id]?.digits} kind={changeOf(r.v, r.sys, METRIC_BY_ID[r.id]?.direction ?? 'none')} />), exportText: () => '' },
  ];
  return (
    <Visual title="Hospital vs target, peers and system" subtitle={`${period.label} · grouped by revenue cycle stage · click a metric to analyze it`}
      table={gridExport(cols, rows)}
      spec={{ type: 'Grouped comparison table', dimensions: ['RCM stage', 'Metric'], interactions: 'Row click opens Metric Analysis with the hospital filter' }}>
      <Grid caption="Hospital vs target, peers and system" columns={cols} rows={rows} defaultExpanded dense maxHeight={520}
        onRowClick={(r) => { if (!r.isArea) go('metric', { id: r.id }, { drill: true }); }} />
    </Visual>
  );
}
