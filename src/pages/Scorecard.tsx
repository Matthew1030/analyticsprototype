import { useEffect, useMemo, useState } from 'react';
import { METRICS, METRIC_BY_ID, evaluate, type MetricDef } from '../engine/metrics';
import { priorPeriod, trailing } from '../engine/periods';
import { changeOf, statusOf, targetFor, type Status } from '../engine/status';
import { fmt, fmtChange } from '../format';
import { useApp, type PageId } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { barOption, lineOption, SERIES } from '../ui/charts';
import { ChangeText, InfoIcon, Panel, StatusChip } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';
import { rankFacilities, RANK_METRICS, type RankRow } from '../engine/ranking';
import { KpiTile } from '../ui/widgets';

const SCORECARD_GROUPS = ['Balance Sheet', 'Income Statement'] as const;

interface Row {
  m: MetricDef;
  cur: number | null;
  prior: number | null;
  target: number | null;
  status: Status;
  noData?: string;
}

export function Scorecard() {
  const { engine, period, sel, ds, registerExport, setPage, selectOnly, toggle } = useApp();
  const [trendId, setTrendId] = useState('M01');
  const prior = priorPeriod(period);

  const rows: Row[] = useMemo(() => METRICS.filter((m) => (SCORECARD_GROUPS as readonly string[]).includes(m.group)).map((m) => {
    const c = evaluate(m, engine, period, sel);
    const p = evaluate(m, engine, prior, sel);
    const target = targetFor(m.id);
    return { m, cur: c.value, prior: p.value, target, status: statusOf(c.value, target, m.direction), noData: c.noData };
  }), [engine, period, prior, sel]);

  const columns: Column<Row>[] = [
    { key: 'metric', label: 'Metric', value: (r) => r.m.name, render: (r) => <span>{r.m.name}</span>, text: (r) => r.m.name },
    { key: 'cur', label: period.label, value: (r) => r.cur, align: 'right', text: (r) => fmt(r.cur, r.m.unit), render: (r) => (r.cur === null ? <span className="muted small" title={r.noData}>No data</span> : fmt(r.cur, r.m.unit)) },
    { key: 'prior', label: prior.label, value: (r) => r.prior, align: 'right', text: (r) => fmt(r.prior, r.m.unit), render: (r) => fmt(r.prior, r.m.unit) },
    { key: 'chg', label: 'Change', value: (r) => (r.cur !== null && r.prior !== null ? r.cur - r.prior : null), align: 'right',
      text: (r) => `${fmtChange(r.cur, r.prior, r.m.unit)} ${changeOf(r.cur, r.prior, r.m.direction) ?? ''}`.trim(),
      render: (r) => <ChangeText text={fmtChange(r.cur, r.prior, r.m.unit)} kind={changeOf(r.cur, r.prior, r.m.direction)} />,
      info: 'Current period minus prior period. Rates show the change in percentage points. Favorable or unfavorable follows the direction of the metric.' },
    { key: 'target', label: 'Target', value: (r) => r.target, align: 'right', text: (r) => (r.target === null ? 'None' : fmt(r.target, r.m.unit)),
      render: (r) => (r.target === null ? <span className="muted">None</span> : `${r.m.direction === 'up' ? '≥' : '≤'} ${fmt(r.target, r.m.unit)}`),
      info: 'Target configured for this client and metric (configuration data).' },
    { key: 'status', label: 'Status', value: (r) => r.status ?? 'No target', render: (r) => <StatusChip status={r.status} />,
      info: 'On Track meets the target. At Risk misses it by 10% or less (relative). Off Track misses it by more. The band is configuration data.' },
    { key: 'go', label: 'Detail', value: () => '', text: () => '', render: (r) => (r.m.detailPage
      ? <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setPage(r.m.detailPage as PageId); }}>Open ›</button> : null) },
  ];
  const withInfo = columns.map((c) => (c.key === 'metric' ? { ...c, render: (r: Row) => <span className="metric-cell">{r.m.name}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={r.m.id} /></span></span> } : c));

  // Trend of the selected metric. FR: at least 12 periods where the window allows.
  const trendM = METRIC_BY_ID[trendId];
  const n = period.kind === 'month' ? 24 : 8;
  const trendPeriods = trailing(period, n).filter((p) => p.startMi >= ds.meta.windowStartMonth);
  const facSelected = (sel.facility?.length ?? 0) > 0;
  const trendSel = trendPeriods.map((p) => evaluate(trendM, engine, p, sel).value);
  const trendAll = facSelected ? trendPeriods.map((p) => evaluate(trendM, engine, p, { ...sel, facility: [] }).value) : null;

  // Facility ranking.
  const ranking = useMemo(() => rankFacilities(engine, period, sel, ds.dims.facilities), [engine, period, sel, ds]);
  const rankCols: Column<RankRow>[] = [
    { key: 'rank', label: 'Rank', value: (r) => r.rank, align: 'right' },
    { key: 'name', label: 'Facility', value: (r) => r.name },
    { key: 'score', label: 'Score', value: (r) => r.score, align: 'right', metricId: 'M28', text: (r) => fmt(r.score, 'score'), render: (r) => <b>{fmt(r.score, 'score')}</b> },
    ...RANK_METRICS.map((id, i) => ({
      key: id, label: METRIC_BY_ID[id].short ?? METRIC_BY_ID[id].name, metricId: id, align: 'right' as const,
      value: (r: RankRow) => r.values[i],
      text: (r: RankRow) => `${fmt(r.values[i], METRIC_BY_ID[id].unit)} (${r.ranks[i] ?? '–'})`,
      render: (r: RankRow) => {
        const st = statusOf(r.values[i], targetFor(id), METRIC_BY_ID[id].direction);
        return <span className={st === 'On Track' ? 'txt-good' : st ? 'txt-bad' : ''}>{fmt(r.values[i], METRIC_BY_ID[id].unit)} <span className="muted small">({r.ranks[i] ?? '–'})</span></span>;
      },
    })),
    { key: 'share', label: 'Gross rev share', value: (r) => r.share, align: 'right', metricId: 'M17', text: (r) => fmt(r.share, 'pct', 0), render: (r) => fmt(r.share, 'pct', 0) },
  ];

  useEffect(() => {
    const t = tableToExport(columns.filter((c) => c.key !== 'go'), rows);
    registerExport({ title: `Scorecard ${period.label}`, ...t });
    return () => registerExport(null);
  });

  const scored = ranking.filter((r) => r.score !== null);
  return (
    <div className="page">
      <div className="kpi-row">
        {['M01', 'M05', 'M11', 'M07', 'M22'].map((id) => <KpiTile key={id} id={id} />)}
      </div>
      <div className="grid-2">
        <Panel title="Scorecard" qlik="Table" info="Metrics grouped as Balance Sheet (point-in-time balances) and Income Statement (period flows). Click a row to show its trend.">
          <DataTable
            caption="Scorecard metrics"
            columns={withInfo}
            rows={[...rows].sort((a, b) => SCORECARD_GROUPS.indexOf(a.m.group as never) - SCORECARD_GROUPS.indexOf(b.m.group as never))}
            groupBy={(r) => `${r.m.group} Metrics`}
            pageSize={20}
            searchable={false}
            onRowClick={(r) => setTrendId(r.m.id)}
            rowClass={(r) => (r.m.id === trendId ? 'row-on' : '')}
          />
        </Panel>
        <Panel title={`Trend: ${trendM.name}`} metricId={trendId} qlik="Line chart"
          noData={trendSel.every((v) => v === null) ? evaluate(trendM, engine, period, sel).noData ?? 'No data is available for this selection.' : null}>
          <Chart
            option={lineOption({
              labels: trendPeriods.map((p) => p.short),
              series: [
                { name: facSelected ? 'Selected facilities' : 'All facilities', data: trendSel, color: SERIES[0] },
                ...(trendAll ? [{ name: 'All facilities', data: trendAll, color: '#898781' }] : []),
              ],
              fmt: (v) => fmt(v, trendM.unit), target: targetFor(trendId),
            })}
            height={300}
            ariaLabel={`Trend of ${trendM.name}`}
          />
          <p className="small muted">{trendPeriods.length} {period.kind === 'month' ? 'months' : 'quarters (all complete quarters in the 24-month window)'} ending {period.label}. Click a scorecard row to change the metric.</p>
        </Panel>
      </div>
      <div className="grid-2 wide-left">
        <Panel title="Facility ranking" qlik="Table" metricId="M28">
          <DataTable caption="Facility ranking" columns={rankCols} rows={ranking} pageSize={10} searchable={false}
            onRowClick={(r) => toggle('facility', r.key)} rowClass={(r) => (sel.facility?.includes(r.key) ? 'row-on' : '')} />
          <p className="small muted">Ranks (in brackets) are among the facilities in view; 1 = best. Green or red text: meets or misses target. Click a row to select the facility.</p>
        </Panel>
        <Panel title="Composite score" qlik="Bar chart" metricId="M28" noData={scored.length < 2 ? 'Select two or more facilities, or clear the facility selection, to compare scores.' : null}>
          <Chart
            option={barOption({ labels: scored.map((r) => r.name), series: [{ name: 'Composite score', data: scored.map((r) => r.score) }], fmt: (v) => fmt(v, 'score'), horizontal: true, highlight: sel.facility?.length ? scored.map((r, i) => (sel.facility!.includes(r.key) ? i : -1)).filter((i) => i >= 0) : undefined })}
            height={Math.max(200, scored.length * 30 + 30)}
            ariaLabel="Composite score by facility"
            onClick={(i) => selectOnly('facility', [scored[i].key])}
          />
        </Panel>
      </div>
    </div>
  );
}
