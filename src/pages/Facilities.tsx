// Facility Comparison: how hospitals compare, and which need attention.

import { useMemo, useState } from 'react';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { staticTarget, statusOf, type Status } from '../engine/status';
import { fmt } from '../format';
import { trend } from '../services/analytics';
import { useApp } from '../state/AppState';
import { fmtMetric, Sparkline, StatusMark } from '../ui/common';
import { Grid, gridExport, type GridColumn, type GridRow } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';
import { BreakdownVisual } from '../ui/widgets';
import { overallStatus } from './ExecutiveOverview';

const COMPARE_IDS = ['net_ar_days', 'cash_pct_npsr', 'denial_rate', 'dnfb_days', 'clean_claim_rate'];
const RANK_IDS = ['net_ar_days', 'cash_pct_npsr', 'denial_rate', 'dnfb_days', 'clean_claim_rate', 'ar_gt90_pct', 'cost_to_collect', 'coding_tat', 'eligibility_rate'];

interface FRow {
  key: number; name: string; region: string; type: string; beds: number; isRegion?: boolean;
  vals: Record<string, { v: number | null; st: Status }>; ar: number | null; npsr: number | null; spark: (number | null)[]; off: number; watch: number;
}

export function Facilities() {
  const { go } = useApp();
  const [rankId, setRankId] = useState('net_ar_days');
  return (
    <div className="page">
      <CanvasHeader />
      <ComparisonTable />
      <div className="row cols-2">
        <BreakdownVisual key={rankId} id={rankId} dim="facility" title={`Hospital ranking: ${METRIC_BY_ID[rankId].name}`}
          onDrill={(k) => go('facility', { id: String(k) }, { drill: true })}
          spec={{ type: 'Ranked bar chart with metric selector', metrics: RANK_IDS, dimensions: ['Hospital'], interactions: 'Choose metric; click filters; Drill mode opens Hospital Profile' }} />
        <Visual title="Ranking metric" subtitle="Choose the metric used to rank hospitals">
          <div className="radio-list">
            {RANK_IDS.map((id) => (
              <label key={id} className={`radio-item ${rankId === id ? 'on' : ''}`}>
                <input type="radio" name="rank" checked={rankId === id} onChange={() => setRankId(id)} />
                <span>{METRIC_BY_ID[id].name}</span><span className="muted small">{METRIC_BY_ID[id].area}</span>
              </label>
            ))}
          </div>
        </Visual>
      </div>
    </div>
  );
}

function ComparisonTable() {
  const { engine, period, sel, ds, go } = useApp();
  const facs = engine.facilitySet(sel);
  const rows: GridRow<FRow>[] = useMemo(() => {
    const calc = (s: typeof sel, base: Omit<FRow, 'vals' | 'ar' | 'npsr' | 'spark' | 'off' | 'watch'>): FRow => {
      const vals = Object.fromEntries(COMPARE_IDS.map((id) => {
        const m = METRIC_BY_ID[id];
        const r = evaluate(m, engine, period, s);
        return [id, { v: r.value, st: statusOf(r.value, r.target, m.direction, r.watch) }];
      }));
      const sts = Object.values(vals).map((x) => x.st);
      return {
        ...base, vals, ar: evaluate(METRIC_BY_ID.net_ar, engine, period, s).value, npsr: evaluate(METRIC_BY_ID.npsr, engine, period, s).value,
        spark: trend(engine, 'net_ar_days', period.endMi, 13, s).map((t) => t.value),
        off: sts.filter((x) => x === 'Off target').length, watch: sts.filter((x) => x === 'Watch').length,
      };
    };
    return ds.dims.regions.map((rg, ri) => {
      const kids = ds.dims.facilities.filter((f) => f.region === ri && (!facs || facs.has(f.key)));
      if (!kids.length) return null;
      return {
        id: `r${ri}`, kind: 'subtotal' as const,
        data: calc({ ...sel, facility: kids.map((k) => k.key) }, { key: -1 - ri, name: rg, region: rg, type: '', beds: kids.reduce((a, k) => a + k.beds, 0), isRegion: true }),
        children: kids.map((f) => ({ id: `f${f.key}`, data: calc({ ...sel, facility: [f.key] }, { key: f.key, name: f.name, region: rg, type: f.type, beds: f.beds }) })),
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [engine, period, sel, ds, facs]);
  const cols: GridColumn<FRow>[] = [
    { key: 'name', label: 'Hospital', value: (r) => r.name, width: 250, render: (r) => (r.isRegion ? <b>{r.name}</b> : <span>{r.name}</span>) },
    { key: 'type', label: 'Type', value: (r) => r.type, align: 'left', render: (r) => <span className="muted">{r.type}</span> },
    { key: 'beds', label: 'Beds', value: (r) => r.beds, format: (v) => fmt(v, 'count') },
    ...COMPARE_IDS.map((id) => ({
      key: id, label: METRIC_BY_ID[id].short ?? METRIC_BY_ID[id].name, metricId: id, value: (r: FRow) => r.vals[id].v,
      format: (v: number | null) => fmtMetric(id, v), status: (r: FRow) => r.vals[id].st,
    })),
    { key: 'ar', label: 'Net A/R', value: (r) => r.ar, format: (v) => fmt(v, 'usd') },
    { key: 'npsr', label: 'NPSR', value: (r) => r.npsr, format: (v) => fmt(v, 'usd'), bar: true },
    { key: 'trend', label: 'Net A/R days, 13 mo', value: () => null, sortable: false, align: 'center', render: (r) => <Sparkline values={r.spark} target={staticTarget('net_ar_days')} />, exportText: () => '' },
    { key: 'overall', label: 'Overall status', align: 'left', value: (r) => r.off * 10 + r.watch, render: (r) => <span className="overall"><StatusMark status={overallStatus(r.off, r.watch)} /> <span className="muted small">{r.off}/{r.watch}</span></span>,
      exportText: (r) => overallStatus(r.off, r.watch) ?? '', info: 'Off target if three or more of the five metrics are off target; Watch if one or two are off target or three or more are on watch. Numbers = off / watch count.' },
  ];
  return (
    <Visual title="Hospital comparison" subtitle={`${period.label} · grouped by region with subtotals · sort any column · click a hospital to open its profile`}
      table={gridExport(cols, rows)}
      spec={{ type: 'Sortable comparison table: region groups, status text, data bars, sparklines', metrics: [...COMPARE_IDS, 'net_ar', 'npsr'], dimensions: ['Region', 'Hospital'], interactions: 'Row click drills through to Hospital Profile; sort; expand/collapse' }}>
      <Grid caption="Hospital comparison" columns={cols} rows={rows} defaultExpanded
        onRowClick={(r) => { if (!r.isRegion) go('facility', { id: String(r.key) }, { drill: true }); }} />
    </Visual>
  );
}
