import { useMemo } from 'react';
import { weekEndingDay, monthIndexOfDay, shortDayLabel } from '../data/dates';
import type { SelField, Selections } from '../engine/engine';
import { missingFields } from '../engine/engine';
import { METRIC_BY_ID, evaluate, type Range } from '../engine/metrics';
import { priorPeriod, trailing } from '../engine/periods';
import { changeOf, statusOf, targetFor } from '../engine/status';
import { fmt, fmtChange } from '../format';
import { useApp, type PageId } from '../state/AppState';
import { Chart } from './Chart';
import { barOption, SERIES, sparkOption } from './charts';
import { ChangeText, InfoIcon, NoData, Panel, StatusChip } from './common';

export function KpiTile({ id, page }: { id: string; page?: PageId }) {
  const { engine, period, sel, setPage } = useApp();
  const m = METRIC_BY_ID[id];
  const cur = evaluate(m, engine, period, sel);
  const prior = evaluate(m, engine, priorPeriod(period), sel);
  const target = targetFor(id);
  const trend = useMemo(() => trailing(period, 12).map((p) => evaluate(m, engine, p, sel).value), [m, engine, period, sel]);
  const target2 = page ?? m.detailPage;
  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-name">{m.short ?? m.name}</span>
        <InfoIcon metricId={id} />
      </div>
      {cur.value === null ? <NoData msg={cur.noData ?? 'No data is available for this selection.'} /> : (
        <>
          <div className="kpi-value">{fmt(cur.value, m.unit)}</div>
          <div className="kpi-sub">
            {target !== null ? <span>Target {m.direction === 'up' ? '≥' : '≤'} {fmt(target, m.unit)}</span> : <span className="muted">No target</span>}
            <StatusChip status={statusOf(cur.value, target, m.direction)} />
          </div>
          <div className="kpi-sub">
            <span className="muted small">vs prior</span>
            <ChangeText text={fmtChange(cur.value, prior.value, m.unit)} kind={changeOf(cur.value, prior.value, m.direction)} />
          </div>
          <Chart option={sparkOption(trend)} height={36} ariaLabel={`${m.name} trend, last 12 periods`} />
        </>
      )}
      {target2 && (
        <button type="button" className="link no-print" onClick={() => setPage(target2 as PageId)}>Open detail ›</button>
      )}
    </div>
  );
}

/** The n weeks (Sunday to Saturday) that end on or before the period end. */
export function weeksEnding(endDay: number, n: number): Range[] {
  let last = weekEndingDay(endDay);
  if (last > endDay) last -= 7;
  const out: Range[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const e = last - i * 7;
    out.push({ startDay: e - 6, endDay: e, startMi: monthIndexOfDay(e - 6), endMi: monthIndexOfDay(e) });
  }
  return out;
}

export const weekLabel = (r: Range) => shortDayLabel(r.endDay);

const DRILL_LEVELS: { field: SelField; label: string }[] = [
  { field: 'facility', label: 'Facility' },
  { field: 'serviceLine', label: 'Service line' },
  { field: 'financialClass', label: 'Financial class' },
  { field: 'payer', label: 'Payer' },
];

/**
 * Qlik: Bar chart on a drill-down dimension (Facility > Service line > Financial class > Payer).
 * Selecting one value moves down one level. The breadcrumb moves back up.
 */
export function DrillChart({ metricId, title }: { metricId: string; title: string }) {
  const { engine, period, sel, selectOnly, clearField, ds, valueLabel, claimListEnabled, setPage } = useApp();
  const m = METRIC_BY_ID[metricId];
  const levels = DRILL_LEVELS.filter((l) => !missingFields(m.fact, { [l.field]: [0] } as Selections).length);
  let depth = 0;
  while (depth < levels.length && (sel[levels[depth].field]?.length ?? 0) === 1) depth++;
  const atEnd = depth >= levels.length;
  const level = levels[Math.min(depth, levels.length - 1)];

  const members = useMemo(() => {
    const d = ds.dims;
    let list: { key: number; label: string }[];
    switch (level.field) {
      case 'facility': list = d.facilities.map((f) => ({ key: f.key, label: f.name })); break;
      case 'serviceLine': list = d.serviceLines.map((s) => ({ key: s.key, label: s.name })); break;
      case 'financialClass': list = d.financialClasses.map((n, i) => ({ key: i, label: n })); break;
      default: {
        const fc = sel.financialClass ?? [];
        list = d.payers.filter((p) => !fc.length || fc.includes(p.fc)).map((p) => ({ key: p.key, label: p.name }));
      }
    }
    const chosen = sel[level.field] ?? [];
    if (chosen.length > 1) list = list.filter((x) => chosen.includes(x.key));
    return list
      .map((x) => ({ ...x, value: evaluate(m, engine, period, { ...sel, [level.field]: [x.key] }).value }))
      .filter((x) => x.value !== null)
      .sort((a, b) => (b.value as number) - (a.value as number));
  }, [ds, level.field, sel, m, engine, period]);

  const crumbs = [{ label: 'System', depth: 0 }, ...levels.slice(0, depth).map((l, i) => ({ label: valueLabel(l.field, sel[l.field]![0]), depth: i + 1 }))];
  const goTo = (d: number) => levels.slice(d).forEach((l) => clearField(l.field));
  const target = targetFor(metricId);
  const f = (v: number) => fmt(v, m.unit);

  return (
    <Panel title={title} metricId={metricId} qlik="Bar chart with drill-down dimension">
      <nav className="crumbs" aria-label="Drill path">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="crumb-sep" aria-hidden="true"> › </span>}
            <button type="button" className={i === crumbs.length - 1 ? 'crumb on' : 'crumb'} onClick={() => goTo(c.depth)}>{c.label}</button>
          </span>
        ))}
        {!atEnd && <span className="muted small"> › {level.label} (click a bar to drill)</span>}
        {atEnd && (
          claimListEnabled
            ? <> <span className="crumb-sep"> › </span><button type="button" className="crumb" onClick={() => setPage('claimlist')}>Claim list</button></>
            : <span className="muted small"> · End of aggregate drill. Account-level records are not in v1.</span>
        )}
      </nav>
      {members.length === 0 ? <NoData msg="No data is available for this selection." /> : (
        <Chart
          option={barOption({ labels: members.map((x) => x.label), series: [{ name: m.name, data: members.map((x) => x.value), color: SERIES[0] }], fmt: f, horizontal: true, target })}
          height={Math.max(180, members.length * 30 + 40)}
          ariaLabel={`${m.name} by ${level.label}`}
          onClick={(i) => { if (!atEnd) selectOnly(level.field, [members[i].key]); }}
        />
      )}
    </Panel>
  );
}
