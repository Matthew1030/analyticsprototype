// ELT Summary ("See"): how is the revenue cycle doing, in under a minute.
//
// Deliberately low density. Four levels, top to bottom:
//   1. Health: five headline measures (current, target, variance, direction).
//   2. Trajectory: three 12-month trends ("are we getting better or worse?").
//   3. Attention: the few areas that need leadership attention, each one click from its analysis.
//   4. Highlights: what is going well, so the page is balanced.
// Everything else (full scorecard, payer and category detail, aging, account lists) lives in
// Analytics and Worklists. Every statement on this page is computed from the data, not written.

import { useMemo, type ReactNode } from 'react';
import type { SelField, Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import { availablePeriods, monthPeriod, PERIOD_KIND_LABEL, type PeriodKind } from '../engine/periods';
import { STATUS_RANK } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { metricValue } from '../services/analytics';
import type { MetricValue } from '../services/contracts';
import { worklist } from '../services/worklists';
import { scopeText, useApp, type PageId } from '../state/AppState';
import { Chart } from '../ui/Chart';
import { eltTrendOption } from '../ui/charts';
import { fmtMetric, InfoIcon, Sparkline, StatusMark } from '../ui/common';
import { Icon } from '../ui/icons';
import { FIELD_LABEL } from '../engine/engine';

/** Level 1: the headline measures. */
export const ELT_KPIS = ['net_ar_days', 'cash_pct_npsr', 'denial_rate', 'dnfb_days', 'clean_claim_rate'];
/** Level 2: the trajectory measures. */
const ELT_TRENDS = ['net_ar_days', 'cash_pct_npsr', 'denial_rate'];
/** Secondary measures: only used to find emerging risks and highlights, never listed in full. */
const WATCHLIST = ['ar_gt90_pct', 'cost_to_collect', 'appeal_success', 'bad_debt_pct', 'net_collection_rate', 'front_end_denial_rate', 'dnfb_15plus_pct'];
/** Analytical page that answers "why" for each measure. */
const PAGE_FOR: Record<string, PageId> = {
  net_ar_days: 'ar', ar_gt90_pct: 'ar', cash_pct_npsr: 'cash', net_collection_rate: 'cash', cost_to_collect: 'cycle', bad_debt_pct: 'cash',
  denial_rate: 'denials', appeal_success: 'denials', front_end_denial_rate: 'access', dnfb_days: 'billing', dnfb_15plus_pct: 'billing', clean_claim_rate: 'billing',
};
const pageFor = (id: string): PageId => PAGE_FOR[id] ?? (METRIC_BY_ID[id].page === 'executive' ? 'cycle' : METRIC_BY_ID[id].page);

/** A change smaller than this (per unit) reads as "stable". */
const STABLE = { days: 0.3, pct: 0.002, usd: 0, count: 0, ratio: 0.01, sec: 1 } as const;

type Direction = 'Improving' | 'Worsening' | 'Stable';

interface Kpi { id: string; v: MetricValue; change3: number | null; dir: Direction | null; from3: number | null; gap: number }

/** Direction over three months, from the monthly values (last point vs three months before). */
function direction(id: string, v: MetricValue): { change3: number | null; from3: number | null; dir: Direction | null } {
  const t = v.trend;
  const cur = t[t.length - 1]?.value ?? null;
  const prev = t.length >= 4 ? t[t.length - 4].value : null;
  if (cur === null || prev === null) return { change3: null, from3: null, dir: null };
  const m = METRIC_BY_ID[id];
  const d = cur - prev;
  if (Math.abs(d) <= STABLE[m.unit] || m.direction === 'none') return { change3: d, from3: prev, dir: 'Stable' };
  const better = m.direction === 'down' ? d < 0 : d > 0;
  return { change3: d, from3: prev, dir: better ? 'Improving' : 'Worsening' };
}

function kpi(id: string, v: MetricValue): Kpi {
  const gap = v.value !== null && v.target ? Math.abs(v.value - v.target) / Math.abs(v.target) : 0;
  return { id, v, gap, ...direction(id, v) };
}

const name = (id: string) => METRIC_BY_ID[id].short ?? METRIC_BY_ID[id].name;

export function EltSummary() {
  const { engine, period, compare, sel, ds, go } = useApp();
  const kpis = useMemo(() => ELT_KPIS.map((id) => kpi(id, metricValue(engine, id, period, compare, sel, 13))), [engine, period, compare, sel]);
  const watch = useMemo(() => WATCHLIST.map((id) => kpi(id, metricValue(engine, id, period, compare, sel, 13))), [engine, period, compare, sel]);
  const open = (id: string) => go(pageFor(id), {}, { drill: true });

  return (
    <div className="elt">
      <EltHeader kpis={kpis} />

      <section className="elt-sec" aria-labelledby="elt-health">
        <SecHead id="elt-health" n={1} title="Revenue cycle health" note={`${period.label} · direction compares the last three months`} />
        <div className="elt-kpis">
          {kpis.map((k) => <KpiTile key={k.id} k={k} onOpen={() => open(k.id)} />)}
        </div>
      </section>

      <section className="elt-sec" aria-labelledby="elt-trend">
        <SecHead id="elt-trend" n={2} title="Are we getting better or worse?" note={`Monthly, 12 months to ${period.short} · dashed line = target · shaded = missing target`} />
        <div className="elt-trends">
          {ELT_TRENDS.map((id) => <TrendCard key={id} k={kpis.find((x) => x.id === id)!} onOpen={() => go('metric', { id }, { drill: true })} />)}
        </div>
      </section>

      <div className="elt-split">
        <section className="elt-sec" aria-labelledby="elt-attn">
          <SecHead id="elt-attn" n={3} title="Where attention is needed" note="Click a row to investigate it" />
          <Attention kpis={kpis} watch={watch} onOpen={open} />
        </section>
        <section className="elt-sec" aria-labelledby="elt-good">
          <SecHead id="elt-good" n={4} title="Performance highlights" note="What is going well" />
          <Highlights kpis={[...kpis, ...watch]} onOpen={open} />
        </section>
      </div>

      <ActStrip />
      <p className="elt-foot">Synthetic data. Targets are illustrative configuration. {ds.dims.facilities.length} hospitals in {ds.dims.organization.name}.</p>
    </div>
  );
}

// ---------------------------------------------------------------- header, scope, headline

function EltHeader({ kpis }: { kpis: Kpi[] }) {
  const { ds, sel, valueLabel, period, periodStatus } = useApp();
  const off = kpis.filter((k) => k.v.status === 'Off target').length;
  const wat = kpis.filter((k) => k.v.status === 'Watch').length;
  const on = kpis.filter((k) => k.v.status === 'On target').length;
  const worse = kpis.filter((k) => k.dir === 'Worsening').map((k) => name(k.id));
  const better = kpis.filter((k) => k.dir === 'Improving').map((k) => name(k.id));
  const tone = off >= 3 ? 'off' : off + wat > 0 ? 'watch' : 'ok';
  return (
    <header className="elt-head">
      <div className="elt-title">
        <h1>ELT Summary</h1>
        <p>{scopeText(sel, valueLabel, ds.dims.organization.name, ds.dims.facilities.length)} · {period.label}
          {periodStatus(period) === 'Preliminary' && <span className="pill pill-prelim">Preliminary</span>}</p>
      </div>
      <EltControls />
      <div className={`elt-headline tone-${tone}`} role="status">
        <span className="elt-headline-mark" aria-hidden="true" />
        <p>
          <b>{off ? `${off} of ${kpis.length} headline measures are off target` : wat ? `No headline measure is off target; ${wat} on watch` : `All ${kpis.length} headline measures meet target`}</b>
          {off > 0 && (wat ? `, ${wat} on watch` : '')}{off > 0 && on ? `, ${on} on target` : ''}.
          {worse.length > 0 && <> Worsening over three months: {list(worse)}.</>}
          {better.length > 0 && <> Improving: {list(better)}.</>}
        </p>
      </div>
    </header>
  );
}

function list(xs: string[]) {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Compact period and scope controls. The full filter pane belongs to Analytics. */
function EltControls() {
  const { ds, period, setPeriod, setPeriodKind, sel, selectOnly, clearField, valueLabel } = useApp();
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
    <div className="elt-controls no-print">
      <label className="elt-ctl">Period
        <span className="elt-ctl-row">
          <select value={period.kind} onChange={(e) => setPeriodKind(e.target.value as PeriodKind)} aria-label="Period type">
            {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>)}
          </select>
          <select value={period.key} onChange={(e) => setPeriod(period.kind, Number(e.target.value))} aria-label="Period">
            {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </span>
      </label>
      <label className="elt-ctl">Scope
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All hospitals</option>
          {scope === 'custom' && <option value="custom">Custom selection</option>}
          <optgroup label="Region">{ds.dims.regions.map((r, i) => <option key={r} value={`r${i}`}>{r}</option>)}</optgroup>
          <optgroup label="Hospital">{ds.dims.facilities.map((f) => <option key={f.key} value={`f${f.key}`}>{f.short}</option>)}</optgroup>
        </select>
      </label>
      {other.length > 0 && (
        <span className="elt-other" title={other.map((f) => `${FIELD_LABEL[f]}: ${sel[f]!.map((k) => valueLabel(f, k)).join(', ')}`).join('\n')}>
          <Icon name="filter" size={11} /> Analytics filters also apply ({other.map((f) => FIELD_LABEL[f]).join(', ')})
          <button type="button" className="link" onClick={() => other.forEach(clearField)}>Clear</button>
        </span>
      )}
    </div>
  );
}

function SecHead({ id, n, title, note }: { id: string; n: number; title: string; note?: ReactNode }) {
  return (
    <div className="elt-sec-head">
      <h2 id={id}><span className="elt-n" aria-hidden="true">{n}</span>{title}</h2>
      {note && <span className="elt-note">{note}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- level 1: KPI tiles

function DirMark({ k, showWindow }: { k: Kpi; showWindow?: boolean }) {
  if (!k.dir) return <span className="muted">–</span>;
  const m = METRIC_BY_ID[k.id];
  const arrow = k.dir === 'Stable' ? '→' : (k.change3 ?? 0) > 0 ? '↑' : '↓';
  return (
    <span className={`elt-dir dir-${k.dir.toLowerCase()}`} title={`${k.dir}: ${fmtDelta(k.change3, m.unit, m.digits)} vs three months ago (${fmtMetric(k.id, k.from3)})`}>
      <span aria-hidden="true">{arrow}</span> {k.dir}{showWindow && <span className="elt-dir-win"> · 3 mo</span>}
    </span>
  );
}

function KpiTile({ k, onOpen }: { k: Kpi; onOpen: () => void }) {
  const m = METRIC_BY_ID[k.id];
  const v = k.v;
  const st = v.status === 'On target' ? 'ok' : v.status === 'Watch' ? 'watch' : v.status ? 'off' : 'none';
  const dnfb = useDnfbDollars(k.id === 'dnfb_days');
  return (
    <div role="button" tabIndex={0} className={`elt-kpi st-${st}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} title={`Investigate ${m.name}`}>
      <span className="elt-kpi-name">{m.short ?? m.name}<span onClick={(e) => e.stopPropagation()}><InfoIcon metricId={k.id} /></span></span>
      <span className="elt-kpi-value">{fmtMetric(k.id, v.value)}{dnfb && <span className="elt-kpi-sub">{dnfb}</span>}</span>
      <span className="elt-kpi-grid">
        <span>Target</span><b>{fmtMetric(k.id, v.target)}</b>
        <span>Variance</span><b className={`txt-${st === 'none' ? '' : st}`}>{fmtDelta(v.variance_to_target, m.unit, m.digits)}</b>
      </span>
      <span className="elt-kpi-foot"><StatusMark status={v.status} /><DirMark k={k} showWindow /></span>
    </div>
  );
}

/** DNFB dollars as context under DNFB days (dollars have no target: they scale with volume). */
function useDnfbDollars(on: boolean) {
  const { engine, period, sel } = useApp();
  return useMemo(() => (on ? `${fmt(evaluate(METRIC_BY_ID.dnfb_dollars, engine, period, sel).value, 'usd')} unbilled` : null), [on, engine, period, sel]);
}

// ---------------------------------------------------------------- level 2: trends

function TrendCard({ k, onOpen }: { k: Kpi; onOpen: () => void }) {
  const m = METRIC_BY_ID[k.id];
  const t = k.v.trend.slice(-12);
  const first = t[0]?.value ?? null;
  const last = t[t.length - 1]?.value ?? null;
  const d12 = first !== null && last !== null ? last - first : null;
  const better = d12 === null || m.direction === 'none' || Math.abs(d12) <= STABLE[m.unit] ? null : m.direction === 'down' ? d12 < 0 : d12 > 0;
  const fm = (v: number) => fmt(v, m.unit, m.digits);
  const option = useMemo(() => eltTrendOption({ labels: t.map((x) => x.label), values: t.map((x) => x.value), target: k.v.target, fmt: fm, direction: m.direction }), [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="elt-trend">
      <div className="elt-trend-head">
        <span className="elt-trend-name">{m.short ?? m.name}</span>
        <span className="elt-trend-val">{fmtMetric(k.id, last)}</span>
      </div>
      <div className={`elt-trend-sub ${better === null ? '' : better ? 'txt-ok' : 'txt-off'}`}>
        {better === null ? 'Stable over 12 months' : `${better ? 'Better' : 'Worse'} by ${fmtDelta(d12, m.unit, m.digits).replace(/^[+−±]/, '')} over 12 months`}
        <span className="muted"> · target {fmtMetric(k.id, k.v.target)}</span>
      </div>
      <Chart height={150} ariaLabel={`${m.name}, 12-month trend`} option={option} onClick={onOpen} />
      <button type="button" className="link elt-more" onClick={onOpen}>Analyze {m.short ?? m.name} <Icon name="chevronRight" size={9} /></button>
    </div>
  );
}

// ---------------------------------------------------------------- level 3: attention

interface Hot { facility: number; label: string; value: number | null }

/** The hospital that contributes most to a miss: gap to target weighted by hospital size. */
function useMostAffected(ids: string[]): Record<string, Hot | null> {
  const { engine, period, sel, ds } = useApp();
  return useMemo(() => {
    const facs = engine.facilitySet(sel);
    const list = ds.dims.facilities.filter((f) => !facs || facs.has(f.key));
    const out: Record<string, Hot | null> = {};
    if (list.length < 2) { ids.forEach((id) => { out[id] = null; }); return out; }
    const size = new Map(list.map((f) => [f.key, evaluate(METRIC_BY_ID.npsr, engine, period, { ...sel, facility: [f.key] }).value ?? 0]));
    const avg = [...size.values()].reduce((a, b) => a + b, 0) / list.length || 1;
    for (const id of ids) {
      const m = METRIC_BY_ID[id];
      let best: (Hot & { score: number }) | null = null;
      for (const f of list) {
        const r = evaluate(m, engine, period, { ...sel, facility: [f.key] });
        // A rate of exactly zero at one hospital usually means too little volume to judge.
        if (r.value === null || r.target === null || (m.unit === 'pct' && r.value === 0)) continue;
        const miss = m.direction === 'down' ? r.value - r.target : r.target - r.value;
        if (miss <= 0) continue;
        const score = (miss / Math.abs(r.target)) * Math.sqrt((size.get(f.key) ?? 0) / avg);
        if (!best || score > best.score) best = { facility: f.key, label: f.short, value: r.value, score };
      }
      out[id] = best;
    }
    return out;
  }, [engine, period, sel, ds, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
}

const severity = (k: Kpi) => (k.v.status ? STATUS_RANK[k.v.status] : 9) * 10 - k.gap;

function Attention({ kpis, watch, onOpen }: { kpis: Kpi[]; watch: Kpi[]; onOpen: (id: string) => void }) {
  const { selectOnly, go } = useApp();
  const missing = kpis.filter((k) => k.v.status === 'Off target' || k.v.status === 'Watch').sort((a, b) => severity(a) - severity(b));
  const top = missing.slice(0, 3);
  const rest = missing.slice(3);
  // Emerging risk: a secondary measure that misses target and got worse over three months.
  const emerging = watch.filter((k) => (k.v.status === 'Off target' || k.v.status === 'Watch') && k.dir === 'Worsening')
    .sort((a, b) => Math.abs((b.change3 ?? 0) / (b.v.target || 1)) - Math.abs((a.change3 ?? 0) / (a.v.target || 1))).slice(0, 1);
  const rows = [...top.map((k) => ({ k, emerging: false })), ...emerging.map((k) => ({ k, emerging: true }))];
  const hot = useMostAffected(rows.map((r) => r.k.id));
  if (!rows.length) return <div className="elt-empty"><StatusMark status="On target" /> No headline measure needs attention for this scope and period.</div>;
  return (
    <div className="elt-attn">
      <table>
        <thead>
          <tr><th className="al-left">Area</th><th>Current</th><th>Target</th><th>Variance</th><th className="al-center">3-month</th><th className="al-left">Most affected hospital</th><th aria-label="Open" /></tr>
        </thead>
        <tbody>
          {rows.map(({ k, emerging }) => {
            const m = METRIC_BY_ID[k.id];
            const h = hot[k.id];
            const st = k.v.status === 'Watch' ? 'watch' : 'off';
            return (
              <tr key={k.id} tabIndex={0} onClick={() => onOpen(k.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(k.id); }} title={`Investigate ${m.name}`}>
                <td className="al-left">
                  <span className={`elt-sev sev-${st}`} aria-hidden="true" />
                  <b>{m.short ?? m.name}</b>{emerging && <span className="elt-tag">Emerging</span>}
                  <span className="elt-attn-status"><StatusMark status={k.v.status} /></span>
                </td>
                <td><b>{fmtMetric(k.id, k.v.value)}</b></td>
                <td className="muted">{fmtMetric(k.id, k.v.target)}</td>
                <td className={`txt-${st}`}>{fmtDelta(k.v.variance_to_target, m.unit, m.digits)}</td>
                <td className="al-center"><span className="elt-attn-trend"><Sparkline values={k.v.trend.slice(-6).map((x) => x.value)} width={54} height={18} color={k.dir === 'Worsening' ? '#bb3328' : '#2a78d6'} /><DirMark k={k} /></span></td>
                <td className="al-left">
                  {h ? (
                    <button type="button" className="link" title={`Filter to ${h.label} and investigate`} onClick={(e) => { e.stopPropagation(); selectOnly('facility', [h.facility]); go(pageFor(k.id), {}, { drill: true }); }}>
                      {h.label} <span className="muted">{fmtMetric(k.id, h.value)}</span>
                    </button>
                  ) : <span className="muted">–</span>}
                </td>
                <td className="elt-go"><Icon name="chevronRight" size={11} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rest.length > 0 && (
        <p className="elt-also">Also on watch: {rest.map((k, i) => (
          <span key={k.id}>{i > 0 && ', '}<button type="button" className="link" onClick={() => onOpen(k.id)}>{name(k.id)} {fmtMetric(k.id, k.v.value)}</button> <span className="muted">(target {fmtMetric(k.id, k.v.target)})</span></span>
        ))}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- level 4: highlights

interface Highlight { key: string; score: number; text: ReactNode; open: () => void }

function Highlights({ kpis, onOpen }: { kpis: Kpi[]; onOpen: (id: string) => void }) {
  const { engine, period, sel, ds, selectOnly, go } = useApp();
  const hospital = useMemo(() => bestHospitalGain(engine, period.endMi, sel, ds.dims.facilities), [engine, period.endMi, sel, ds]);
  const items: Highlight[] = [];
  for (const k of kpis) {
    const m = METRIC_BY_ID[k.id];
    if (k.dir === 'Improving' && k.change3 !== null) {
      items.push({
        key: `imp-${k.id}`, score: 1 + Math.abs(k.change3 / (k.v.target || k.v.value || 1)),
        text: <><b>{m.short ?? m.name}</b> improved {fmtDelta(Math.abs(k.change3), m.unit, m.digits).replace(/^\+/, '')} over three months ({fmtMetric(k.id, k.from3)} → {fmtMetric(k.id, k.v.trend[k.v.trend.length - 1]?.value ?? null)}){k.v.status !== 'On target' && k.v.status ? <span className="muted">; still {k.v.status === 'Watch' ? 'on watch' : 'off target'}</span> : null}.</>,
        open: () => onOpen(k.id),
      });
    } else if (k.v.status === 'On target' && k.v.target !== null) {
      items.push({
        key: `on-${k.id}`, score: 0.5 + k.gap,
        text: <><b>{m.short ?? m.name}</b> is {fmtMetric(k.id, k.v.value)}, better than the {fmtMetric(k.id, k.v.target)} target.</>,
        open: () => onOpen(k.id),
      });
    }
  }
  if (hospital) {
    const m = METRIC_BY_ID[hospital.id];
    items.push({
      key: 'hosp', score: 2,
      text: <><b>{hospital.label}</b> reduced {m.short ?? m.name} by {fmtDelta(Math.abs(hospital.change), m.unit, m.digits).replace(/^\+/, '')} over three months ({fmtMetric(hospital.id, hospital.from)} → {fmtMetric(hospital.id, hospital.to)}).</>,
      open: () => { selectOnly('facility', [hospital.facility]); go('facility', { id: String(hospital.facility) }, { drill: true }); },
    });
  }
  const chosen = items.sort((a, b) => b.score - a.score).slice(0, 3);
  if (!chosen.length) return <div className="elt-empty">No measure improved materially over the last three months for this scope.</div>;
  return (
    <ul className="elt-good">
      {chosen.map((h) => (
        <li key={h.key}>
          <button type="button" onClick={h.open}>
            <span className="elt-check" aria-hidden="true">✓</span>
            <span>{h.text}</span>
            <Icon name="chevronRight" size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The hospital with the largest three-month improvement in net A/R days or denial rate. */
function bestHospitalGain(engine: ReturnType<typeof useApp>['engine'], endMi: number, sel: Selections, facilities: { key: number; short: string }[]) {
  const facs = engine.facilitySet(sel);
  const list = facilities.filter((f) => !facs || facs.has(f.key));
  if (list.length < 2) return null;
  let best: { id: string; facility: number; label: string; change: number; from: number; to: number; rel: number } | null = null;
  for (const id of ['net_ar_days', 'denial_rate']) {
    const m = METRIC_BY_ID[id];
    for (const f of list) {
      const s = { ...sel, facility: [f.key] };
      const to = metricAt(engine, id, endMi, s);
      const from = metricAt(engine, id, endMi - 3, s);
      if (to === null || from === null) continue;
      const change = to - from;
      if (change >= -STABLE[m.unit]) continue;
      const rel = -change / Math.abs(from || 1);
      if (!best || rel > best.rel) best = { id, facility: f.key, label: f.short, change, from, to, rel };
    }
  }
  return best;
}

function metricAt(engine: ReturnType<typeof useApp>['engine'], id: string, mi: number, sel: Selections) {
  if (mi < engine.ds.meta.windowStartMonth) return null;
  return evaluate(METRIC_BY_ID[id], engine, monthPeriod(mi), sel).value;
}

// ---------------------------------------------------------------- see -> understand -> act

function ActStrip() {
  const { engine, sel, ds, go } = useApp();
  const counts = useMemo(() => (['denials', 'ar', 'dnfb'] as const).map((kind) => {
    const items = worklist(engine, { kind, day: ds.meta.asOfDay }, sel);
    return { kind, high: items.filter((x) => x.priority === 'High').length, total: items.length };
  }), [engine, sel, ds]);
  const page = { denials: 'wl-denials', ar: 'wl-ar', dnfb: 'wl-dnfb' } as const;
  const label = { denials: 'Denials', ar: 'A/R follow-up', dnfb: 'DNFB' } as const;
  return (
    <nav className="elt-act no-print" aria-label="Next steps">
      <span className="elt-act-lead">Go deeper</span>
      <button type="button" onClick={() => go('cycle', {}, { drill: true })}><b>Analytics</b><span>Investigate what is happening and why</span><Icon name="chevronRight" size={10} /></button>
      {counts.map((c) => (
        <button key={c.kind} type="button" onClick={() => go(page[c.kind], {}, { drill: true })}>
          <b>{label[c.kind]} worklist</b><span>{c.high.toLocaleString('en-US')} high priority of {c.total.toLocaleString('en-US')} open</span><Icon name="chevronRight" size={10} />
        </button>
      ))}
    </nav>
  );
}
