// ELT Summary ("See"): the executive view of revenue cycle performance.
//
// Built from standard BI components only: KPI cards, trend charts, a metric table with
// conditional formatting, ranked variance tables, slicers, tooltips and drill-through. The page
// carries no explanatory prose: actual, target, variance and trend carry the message.
//
// Sections: Key Performance Indicators · Performance Trends · Performance vs. Target (the full
// P1–P13 framework) · Areas of Focus · Performance Highlights. Every metric drills into Analytics.

import { useMemo } from 'react';
import { FIELD_LABEL, type SelField } from '../engine/engine';
import { FRAMEWORK, FRAMEWORK_BY_ID } from '../engine/framework';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { availablePeriods, PERIOD_KIND_LABEL, type PeriodKind } from '../engine/periods';
import { changeOf, type Status } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { metricValue } from '../services/analytics';
import type { MetricValue } from '../services/contracts';
import { scopeText, useApp, type PageId } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { eltTrendOption } from '../ui/charts';
import { fmtMetric, InfoIcon, Sparkline, StatusMark } from '../ui/common';
import { Icon } from '../ui/icons';

/** Headline KPIs and trend charts (framework codes P1, P4, P5, P8, P10). */
export const ELT_KPIS = ['gross_ar_days', 'cash_pct_npsr', 'denial_dollar_rate', 'dnfb_days', 'ar_gt90_pct'];
const ELT_TRENDS = ['gross_ar_days', 'cash_pct_npsr', 'denial_dollar_rate'];
const ALL_IDS = FRAMEWORK.flatMap((g) => g.metrics.map((m) => m.id));

/** Drill-through target: the analytical page for the metric, or Metric Analysis. */
const DRILL: Record<string, PageId> = {
  gross_ar_days: 'ar', ar_gt90_pct: 'ar', credit_balance_days: 'ar', dnfb_days: 'billing', cash_pct_npsr: 'cash',
  denial_dollar_rate: 'denials', avoidable_wo_pct_net: 'denials', avoidable_wo_unrealized_pct: 'denials',
};

/** A change smaller than this (per unit) is shown as flat. */
const FLAT = { days: 0.3, pct: 0.0005, usd: 0, count: 0, ratio: 0.01, sec: 1 } as const;

interface Row { id: string; v: MetricValue; d3: number | null; varPct: number | null }

const label = (id: string) => {
  const f = FRAMEWORK_BY_ID[id];
  return f ? <><span className="elt-code">{f.code}</span>{f.label}</> : METRIC_BY_ID[id].name;
};
const tone = (s: Status) => (s === 'On target' ? 'ok' : s === 'Watch' ? 'watch' : s ? 'off' : 'none');

function row(id: string, v: MetricValue): Row {
  const t = v.trend;
  const cur = t[t.length - 1]?.value ?? null;
  const prev = t.length >= 4 ? t[t.length - 4].value : null;
  const m = METRIC_BY_ID[id];
  // Relative variance, signed so that positive = unfavorable.
  const varPct = v.value !== null && v.target ? ((v.value - v.target) / Math.abs(v.target)) * (m.direction === 'up' ? -1 : 1) : null;
  return { id, v, d3: cur !== null && prev !== null ? cur - prev : null, varPct };
}

export function EltSummary() {
  const { engine, period, compare, sel, go } = useApp();
  const rows = useMemo(() => Object.fromEntries(ALL_IDS.map((id) => [id, row(id, metricValue(engine, id, period, compare, sel, 13))])) as Record<string, Row>,
    [engine, period, compare, sel]);
  const open = (id: string) => (DRILL[id] ? go(DRILL[id], {}, { drill: true }) : go('metric', { id }, { drill: true }));

  return (
    <div className="elt">
      <EltHeader />

      <section className="elt-sec" aria-labelledby="elt-kpi">
        <SecHead id="elt-kpi" title="Key Performance Indicators" meta={period.label} />
        <div className="elt-kpis">
          {ELT_KPIS.map((id) => <KpiCard key={id} r={rows[id]} onOpen={() => open(id)} />)}
        </div>
      </section>

      <section className="elt-sec" aria-labelledby="elt-trend">
        <SecHead id="elt-trend" title="Performance Trends" meta={`12 months ending ${period.short}`} />
        <div className="elt-trends">
          {ELT_TRENDS.map((id) => <TrendCard key={id} r={rows[id]} onOpen={() => go('metric', { id }, { drill: true })} />)}
        </div>
      </section>

      <div className="elt-split">
        <section className="elt-sec" aria-labelledby="elt-target">
          <SecHead id="elt-target" title="Performance vs. Target" meta={period.label} />
          <TargetTable rows={rows} onOpen={open} />
        </section>
        <div className="elt-stack">
          <section className="elt-sec" aria-labelledby="elt-focus">
            <SecHead id="elt-focus" title="Areas of Focus" meta="Largest unfavorable variance" />
            <Focus rows={rows} onOpen={open} />
          </section>
          <section className="elt-sec" aria-labelledby="elt-good">
            <SecHead id="elt-good" title="Performance Highlights" meta="Largest favorable variance" />
            <Highlights rows={rows} onOpen={open} />
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- header and slicers

function EltHeader() {
  const { ds, sel, valueLabel, period, periodStatus } = useApp();
  return (
    <header className="elt-head">
      <div className="elt-title">
        <h1>ELT Summary</h1>
        <p>Revenue Cycle Performance · {scopeText(sel, valueLabel, ds.dims.organization.name, ds.dims.facilities.length)} · {period.label}
          {periodStatus(period) === 'Preliminary' && <span className="pill pill-prelim">Preliminary</span>}</p>
      </div>
      <EltSlicers />
    </header>
  );
}

function EltSlicers() {
  const { ds, period, setPeriod, setPeriodKind, sel, selectOnly, clearField, valueLabel, toast } = useApp();
  const periods = availablePeriods(period.kind, ds.meta.windowStartMonth, ds.meta.endMonth);
  const scope = sel.facility?.length === 1 ? `f${sel.facility[0]}` : sel.region?.length === 1 && !sel.facility?.length ? `r${sel.region[0]}` : sel.facility?.length || sel.region?.length ? 'custom' : 'all';
  const setScope = (v: string) => {
    clearField('facility');
    clearField('region');
    if (v.startsWith('f')) selectOnly('facility', [Number(v.slice(1))]);
    if (v.startsWith('r')) selectOnly('region', [Number(v.slice(1))]);
  };
  const other = (Object.keys(sel) as SelField[]).filter((f) => f !== 'facility' && f !== 'region' && (sel[f]?.length ?? 0) > 0);
  return (
    <div className="elt-slicers no-print">
      {other.length > 0 && (
        <span className="elt-other" title={other.map((f) => `${FIELD_LABEL[f]}: ${sel[f]!.map((k) => valueLabel(f, k)).join(', ')}`).join('\n')}>
          Filtered: {other.map((f) => FIELD_LABEL[f]).join(', ')}
          <button type="button" className="icon-btn xs" aria-label="Clear additional filters" onClick={() => other.forEach(clearField)}><Icon name="close" size={9} /></button>
        </span>
      )}
      <label className="elt-slicer"><span>Period type</span>
        <select value={period.kind} onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}>
          {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="elt-slicer"><span>Period</span>
        <select value={period.key} onChange={(e) => setPeriod(period.kind, Number(e.target.value))}>
          {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <label className="elt-slicer"><span>Hospital</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All hospitals</option>
          {scope === 'custom' && <option value="custom">Multiple selected</option>}
          <optgroup label="Region">{ds.dims.regions.map((r, i) => <option key={r} value={`r${i}`}>{r}</option>)}</optgroup>
          <optgroup label="Hospital">{ds.dims.facilities.map((f) => <option key={f.key} value={`f${f.key}`}>{f.short}</option>)}</optgroup>
        </select>
      </label>
      <span className="elt-actions">
        <button type="button" className="icon-btn" title="Copy link" onClick={() => {
          try { void navigator.clipboard?.writeText(location.href); } catch { /* clipboard blocked */ }
          toast('Link copied.');
        }}><Icon name="share" /></button>
        <button type="button" className="icon-btn" title="Export to PDF" onClick={() => window.print()}><Icon name="download" /></button>
      </span>
    </div>
  );
}

function SecHead({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div className="elt-sec-head">
      <h2 id={id}>{title}</h2>
      {meta && <span className="elt-meta">{meta}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- shared cells

/** Change over three months, colored by whether the metric's direction makes it favorable. */
function Change3({ r }: { r: Row }) {
  const m = METRIC_BY_ID[r.id];
  if (r.d3 === null) return <span className="muted">–</span>;
  const flat = Math.abs(r.d3) <= FLAT[m.unit];
  const kind = flat ? null : changeOf(r.d3, 0, m.direction);
  return (
    <span className={`elt-chg ${kind === 'Favorable' ? 'fav' : kind === 'Unfavorable' ? 'unfav' : ''}`}>
      <span aria-hidden="true">{flat ? '▶' : r.d3 > 0 ? '▲' : '▼'}</span> {fmtDelta(r.d3, m.unit, m.digits)}
    </span>
  );
}

function Variance({ r }: { r: Row }) {
  const m = METRIC_BY_ID[r.id];
  return <span className={`elt-var v-${tone(r.v.status)}`}>{fmtDelta(r.v.variance_to_target, m.unit, m.digits)}</span>;
}

// ---------------------------------------------------------------- KPI cards

function KpiCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const m = METRIC_BY_ID[r.id];
  const v = r.v;
  return (
    <div role="button" tabIndex={0} className={`elt-kpi st-${tone(v.status)}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} title={`Analyze ${m.name}`}>
      <div className="elt-kpi-name"><span>{label(r.id)}</span><span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={r.id} /></span></div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value">{fmtMetric(r.id, v.value)}</span>
        <Sparkline values={v.trend.slice(-12).map((t) => t.value)} target={v.target} width={88} height={30} />
      </div>
      <dl className="elt-kpi-grid">
        <div><dt>Target</dt><dd>{fmtMetric(r.id, v.target)}</dd></div>
        <div><dt>Variance</dt><dd><Variance r={r} /></dd></div>
        <div><dt>3M change</dt><dd><Change3 r={r} /></dd></div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- trends

function TrendCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const m = METRIC_BY_ID[r.id];
  const t = r.v.trend.slice(-12);
  const fm = (x: number) => fmt(x, m.unit, m.digits);
  const option = useMemo(() => eltTrendOption({ labels: t.map((x) => x.label), values: t.map((x) => x.value), target: r.v.target, fmt: fm, direction: m.direction }), [r]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="elt-trend">
      <div className="elt-trend-head">
        <span className="elt-trend-name">{label(r.id)}</span>
        <span className="elt-trend-kv"><span>Actual <b>{fmtMetric(r.id, r.v.value)}</b></span><span>Target <b>{fmtMetric(r.id, r.v.target)}</b></span></span>
      </div>
      <Chart height={150} ariaLabel={`${m.name}, monthly, 12 months`} option={option} onClick={onOpen} />
      <div className="elt-legend" aria-hidden="true"><i className="lg-line" />Actual<i className="lg-target" />Target<i className="lg-zone" />Off-target range</div>
    </div>
  );
}

// ---------------------------------------------------------------- performance vs. target

function TargetTable({ rows, onOpen }: { rows: Record<string, Row>; onOpen: (id: string) => void }) {
  return (
    <div className="elt-table">
      <table>
        <thead>
          <tr>
            <th className="al-left">Metric</th><th>Actual</th><th>Target</th><th>Variance</th>
            <th className="al-center">Status</th><th>3M change</th><th className="al-center">12-month trend</th><th className="al-left">Benchmark</th>
          </tr>
        </thead>
        <tbody>
          {FRAMEWORK.map((g) => [
            <tr key={g.name} className="elt-group"><td colSpan={8}>{g.name}</td></tr>,
            ...g.metrics.map((f) => {
              const r = rows[f.id];
              return (
                <tr key={f.id} className="clickable" tabIndex={0} onClick={() => onOpen(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f.id); }} title={`Analyze ${METRIC_BY_ID[f.id].name}`}>
                  <td className="al-left elt-mname">{label(f.id)}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={f.id} /></span></td>
                  <td><b>{fmtMetric(f.id, r.v.value)}</b></td>
                  <td className="muted">{fmtMetric(f.id, r.v.target)}</td>
                  <td><Variance r={r} /></td>
                  <td className="al-center"><StatusMark status={r.v.status} compact /></td>
                  <td><Change3 r={r} /></td>
                  <td className="al-center"><Sparkline values={r.v.trend.slice(-12).map((t) => t.value)} target={r.v.target} width={72} height={20} /></td>
                  <td className="al-left muted">{f.benchmark}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- focus and highlights

interface Fac { key: number; label: string; value: number }

/** Key driver and leading hospital per metric: distance from target, weighted by hospital size. */
function useFacilityExtremes(ids: string[]): Record<string, { worst: Fac | null; best: Fac | null }> {
  const { engine, period, sel, ds } = useApp();
  return useMemo(() => {
    const facs = engine.facilitySet(sel);
    const list = ds.dims.facilities.filter((f) => !facs || facs.has(f.key));
    const out: Record<string, { worst: Fac | null; best: Fac | null }> = {};
    const size = new Map(list.map((f) => [f.key, evaluate(METRIC_BY_ID.npsr, engine, period, { ...sel, facility: [f.key] }).value ?? 0]));
    const avg = [...size.values()].reduce((a, b) => a + b, 0) / Math.max(1, list.length) || 1;
    for (const id of ids) {
      const m = METRIC_BY_ID[id];
      let worst: (Fac & { s: number }) | null = null;
      let best: (Fac & { s: number }) | null = null;
      if (list.length > 1) {
        for (const f of list) {
          const r = evaluate(m, engine, period, { ...sel, facility: [f.key] });
          // A rate of exactly zero at one facility usually means too little volume to judge.
          if (r.value === null || r.target === null || (m.unit === 'pct' && r.value === 0)) continue;
          const gap = ((r.value - r.target) / Math.abs(r.target)) * (m.direction === 'up' ? -1 : 1);
          const w = Math.sqrt((size.get(f.key) ?? 0) / avg);
          if (gap > 0 && (!worst || gap * w > worst.s)) worst = { key: f.key, label: f.short, value: r.value, s: gap * w };
          if (gap <= 0 && (!best || -gap * w > best.s)) best = { key: f.key, label: f.short, value: r.value, s: -gap * w };
        }
      }
      out[id] = { worst, best };
    }
    return out;
  }, [engine, period, sel, ds, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
}

function VarianceTable({ list, facility, facLabel, onOpen, empty }: {
  list: Row[]; facility: (id: string) => Fac | null; facLabel: string; onOpen: (id: string) => void; empty: string;
}) {
  const { selectOnly, go } = useApp();
  if (!list.length) return <div className="elt-table elt-none">{empty}</div>;
  return (
    <div className="elt-table">
      <table>
        <thead><tr><th className="al-left">Metric</th><th>Actual</th><th>Target</th><th>Variance</th><th className="al-left">{facLabel}</th></tr></thead>
        <tbody>
          {list.map((r) => {
            const f = facility(r.id);
            return (
              <tr key={r.id} className="clickable" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.id); }} title={`Analyze ${METRIC_BY_ID[r.id].name}`}>
                <td className="al-left elt-mname">{label(r.id)}</td>
                <td><b>{fmtMetric(r.id, r.v.value)}</b></td>
                <td className="muted">{fmtMetric(r.id, r.v.target)}</td>
                <td><Variance r={r} /></td>
                <td className="al-left">
                  {f ? (
                    <button type="button" className="link" title={`${f.label}: ${fmtMetric(r.id, f.value)}. Analyze ${METRIC_BY_ID[r.id].name} for this hospital.`}
                      onClick={(e) => { e.stopPropagation(); selectOnly('facility', [f.key]); go(DRILL[r.id] ?? 'metric', DRILL[r.id] ? {} : { id: r.id }, { drill: true }); }}>
                      {f.label}
                    </button>
                  ) : <span className="muted">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Focus({ rows, onOpen }: { rows: Record<string, Row>; onOpen: (id: string) => void }) {
  const list = Object.values(rows).filter((r) => r.v.status === 'Off target' && r.varPct !== null)
    .sort((a, b) => b.varPct! - a.varPct!).slice(0, 5);
  const ext = useFacilityExtremes(list.map((r) => r.id));
  return <VarianceTable list={list} facility={(id) => ext[id]?.worst ?? null} facLabel="Key driver" onOpen={onOpen} empty="No metric off target." />;
}

function Highlights({ rows, onOpen }: { rows: Record<string, Row>; onOpen: (id: string) => void }) {
  const list = Object.values(rows).filter((r) => r.v.status === 'On target' && r.varPct !== null)
    .sort((a, b) => a.varPct! - b.varPct!).slice(0, 3);
  const ext = useFacilityExtremes(list.map((r) => r.id));
  return <VarianceTable list={list} facility={(id) => ext[id]?.best ?? null} facLabel="Top hospital" onOpen={onOpen} empty="No metric at target." />;
}
