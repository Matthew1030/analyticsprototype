import { useEffect, useRef, useState, type ReactNode } from 'react';
import { METRIC_BY_ID, type MetricDef } from '../engine/metrics';
import { CONFIG, targetFor, type Status } from '../engine/status';
import { fmt } from '../format';

/** Info icon: opens the draft definition and calculation of a metric or column. */
export function InfoIcon({ metricId, text, title }: { metricId?: string; text?: string; title?: string }) {
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
      <button
        type="button"
        className="info-btn"
        aria-label={`Definition of ${m?.name ?? title ?? 'this item'}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >i</button>
      {open && (
        <span className="info-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
          {m ? <MetricInfo m={m} /> : (
            <>
              <strong>{title}</strong>
              <span className="info-row">{text}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

function MetricInfo({ m }: { m: MetricDef }) {
  const t = targetFor(m.id);
  const g = CONFIG.metricGovernance;
  return (
    <>
      <strong>{m.name} <span className="tag">{m.id} · Draft</span></strong>
      <span className="info-row">{m.definition}</span>
      <span className="info-label">Calculation</span>
      <span className="info-row">{m.formula}</span>
      <span className="info-label">Unit and direction</span>
      <span className="info-row">
        {unitName(m.unit)} · {m.direction === 'up' ? 'Higher is better' : m.direction === 'down' ? 'Lower is better' : 'No direction'}
        {t !== null && <> · Target {m.direction === 'up' ? '≥' : '≤'} {fmt(t, m.unit)}</>}
      </span>
      {m.multiDef && <span className="info-row note">This metric has more than one common definition in the industry.</span>}
      <span className="info-label">Draft Qlik expression</span>
      <code className="info-code">{m.qlik}</code>
      <span className="info-label">Governance</span>
      <span className="info-row small">Owner: {g.owner} · Version {g.version} · Changed {g.changeDate}: {g.changeReason}</span>
    </>
  );
}

function unitName(u: MetricDef['unit']) {
  return { pct: 'Percent', days: 'Days', usd: 'Dollars', count: 'Count', sec: 'Seconds', score: 'Score 0-100' }[u];
}

export function StatusChip({ status, na }: { status: Status; na?: boolean }) {
  if (!status) return <span className="chip chip-none">{na ? 'Not applicable' : 'No target'}</span>;
  const cls = status === 'On Track' ? 'good' : status === 'At Risk' ? 'warn' : 'crit';
  const icon = status === 'On Track' ? '✓' : status === 'At Risk' ? '!' : '✕';
  return <span className={`chip chip-${cls}`}><span aria-hidden="true">{icon}</span> {status}</span>;
}

export function ChangeText({ text, kind }: { text: string; kind: 'Favorable' | 'Unfavorable' | 'No change' | null }) {
  const cls = kind === 'Favorable' ? 'fav' : kind === 'Unfavorable' ? 'unfav' : 'neutral';
  const arrow = kind === 'Favorable' ? '▲' : kind === 'Unfavorable' ? '▼' : '';
  return (
    <span className={`change ${cls}`}>
      {text}{kind && kind !== 'No change' && <span className="change-label"> {arrow} {kind}</span>}
    </span>
  );
}

/** A Qlik-style object: title, info, object type tag, and content or a no-data message. */
export function Panel({ title, metricId, info, qlik, children, noData, actions, className }: {
  title: string; metricId?: string; info?: string; qlik: string; children: ReactNode;
  noData?: string | null; actions?: ReactNode; className?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header className="panel-head">
        <h3>{title} {(metricId || info) && <InfoIcon metricId={metricId} text={info} title={title} />}</h3>
        <span className="panel-actions">
          {actions}
          <span className="qlik-tag" title="Native Qlik Cloud object type for this visual">Qlik: {qlik}</span>
        </span>
      </header>
      {noData ? <NoData msg={noData} /> : children}
    </section>
  );
}

export function NoData({ msg }: { msg: string }) {
  return <div className="nodata" role="status">{msg}</div>;
}

export function metricLabel(id: string) {
  return METRIC_BY_ID[id]?.short ?? METRIC_BY_ID[id]?.name ?? id;
}
