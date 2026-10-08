import { useEffect, useRef, useState, type ReactNode } from 'react';
import { METRIC_BY_ID, type MetricDef, type Unit } from '../engine/metrics';
import { CONFIG, staticTarget, watchFor, type Change, type Status } from '../engine/status';
import { fmt, fmtDelta } from '../format';
import { FRAMEWORK_BY_ID } from '../engine/framework';
import { Icon } from './icons';

/** Info button: opens the definition and calculation of a metric, or a free text note. */
export function InfoIcon({ metricId, text, title }: { metricId?: string; text?: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const m = metricId ? METRIC_BY_ID[metricId] : undefined;
  return (
    <span className="info" ref={ref}>
      <button type="button" className="icon-btn info-btn" aria-label={`About ${m?.name ?? title ?? 'this item'}`} title="Definition"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <Icon name="info" size={13} />
      </button>
      {open && (
        <span className="info-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
          {m ? <MetricInfo m={m} /> : (<><strong>{title}</strong><span className="info-row">{text}</span></>)}
        </span>
      )}
    </span>
  );
}

export function MetricInfo({ m }: { m: MetricDef }) {
  const t = staticTarget(m.id);
  const w = watchFor(m.id, t);
  const g = CONFIG.governance;
  return (
    <>
      <strong>{m.code ? `${m.code} · ` : ''}{m.name}</strong>
      <span className="tagline">{m.area} · {m.type === 'balance' ? 'Point in time (period end)' : 'Flow (sum over period)'} · <code>{m.id}</code></span>
      <span className="info-row">{m.definition}</span>
      <span className="info-label">Calculation</span>
      <code className="info-code">{m.calculation}</code>
      <span className="info-label">Direction and target</span>
      <span className="info-row">
        {m.direction === 'up' ? 'Higher is better' : m.direction === 'down' ? 'Lower is better' : 'No preferred direction'}
        {t !== null && <> · Target {m.direction === 'up' ? '≥' : '≤'} {fmt(t, m.unit, m.digits)} · Watch to {fmt(w, m.unit, m.digits)}</>}
        {m.target && <> · Target is calculated (cash goal)</>}
      </span>
      {FRAMEWORK_BY_ID[m.id] && <><span className="info-label">ELT framework</span><span className="info-row">{FRAMEWORK_BY_ID[m.id].code} · {FRAMEWORK_BY_ID[m.id].name} · Benchmark {FRAMEWORK_BY_ID[m.id].benchmark}</span></>}
      {m.multiDef && <span className="info-row note">More than one definition is common in the industry. Confirm this one with Finance.</span>}
      <span className="info-label">Source fields</span>
      <span className="info-row small mono">{m.sourceFields.join(', ')}</span>
      <span className="info-row small muted">Draft definition · {g.owner} · v{g.version}</span>
    </>
  );
}

/** Status: small shape + label. Color is never the only cue. */
export function StatusMark({ status, compact }: { status: Status; compact?: boolean }) {
  if (!status) return <span className="status status-none">{compact ? '' : 'No target'}</span>;
  const cls = status === 'On target' ? 'ok' : status === 'Watch' ? 'watch' : 'off';
  return (
    <span className={`status status-${cls}`} title={status}>
      <span className="status-shape" aria-hidden="true" />{compact ? <span className="sr-only">{status}</span> : status}
    </span>
  );
}

/** Change value with favorable / unfavorable coloring by metric direction. */
export function Delta({ d, unit, kind, digits, suffix }: { d: number | null; unit: Unit; kind: Change; digits?: number; suffix?: string }) {
  const cls = kind === 'Favorable' ? 'fav' : kind === 'Unfavorable' ? 'unfav' : 'neutral';
  const arrow = d === null || Math.abs(d) < 1e-12 ? '' : d > 0 ? '▲' : '▼';
  return (
    <span className={`delta ${cls}`} title={kind ?? undefined}>
      {arrow && <span className="delta-arrow" aria-hidden="true">{arrow}</span>}{fmtDelta(d, unit, digits)}{suffix ? <span className="muted"> {suffix}</span> : null}
    </span>
  );
}

/** Inline SVG sparkline with optional target line and an emphasized last point. */
export function Sparkline({ values, target, width = 84, height = 22, color = '#2a78d6' }: {
  values: (number | null)[]; target?: number | null; width?: number; height?: number; color?: string;
}) {
  const vs = values.filter((v): v is number => v !== null);
  if (vs.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (target != null) { min = Math.min(min, target); max = Math.max(max, target); }
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => 1 + (i * (width - 4)) / (values.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    d += `${d && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const li = values.length - 1;
  const last = values[li];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {target != null && <line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke="#9aa2ae" strokeDasharray="2 2" strokeWidth={1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
      {last !== null && <circle cx={x(li)} cy={y(last)} r={2.2} fill={color} />}
    </svg>
  );
}

/** Horizontal in-cell data bar. */
export function DataBar({ value, max, color = '#2a78d6' }: { value: number | null; max: number; color?: string }) {
  if (value === null || max <= 0) return null;
  return <span className="databar" style={{ width: `${Math.max(1, (100 * Math.max(0, value)) / max)}%`, background: color }} aria-hidden="true" />;
}

export function NoData({ msg, action }: { msg: string; action?: ReactNode }) {
  return <div className="state state-empty" role="status"><Icon name="filter" size={16} /><span>{msg}</span>{action}</div>;
}

export function metricLabel(id: string) {
  return METRIC_BY_ID[id]?.short ?? METRIC_BY_ID[id]?.name ?? id;
}

export function fmtMetric(id: string, v: number | null) {
  const m = METRIC_BY_ID[id];
  return fmt(v, m.unit, m.digits);
}
