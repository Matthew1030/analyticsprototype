// Visual container: the standard frame for every chart, table and KPI group.
// Toolbar: definition, show as table, focus mode, export. Handles the non-happy-path states
// (loading, no data, filtered to zero, source unavailable, error) the same way everywhere.

import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppState';
import { InfoIcon } from './common';
import { Icon } from './icons';
import { VisualContext } from './visualContext';

export interface TableData { columns: string[]; rows: (string | number | null)[][] }

export interface VisualSpec {
  /** Visual type, e.g. "Line chart", "Matrix (pivot) table". */
  type: string;
  metrics?: string[];
  dimensions?: string[];
  interactions?: string;
}

interface Props {
  title: string;
  subtitle?: ReactNode;
  metricId?: string;
  info?: ReactNode;
  spec?: VisualSpec;
  table?: TableData;
  actions?: ReactNode;
  /** Shown instead of the content: no data for the current filters (with a reason). */
  noData?: string | null;
  /** Source system this visual depends on (used by the "source delayed" state). */
  source?: 'clearinghouse' | 'scheduling' | 'gl';
  className?: string;
  children: ReactNode;
}

export function Visual({ title, subtitle, metricId, info, spec, table, actions, noData, source, className, children }: Props) {
  const { sim, specMode, clearAll, toast, sel } = useApp();
  const [focus, setFocus] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!focus) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [focus]);

  const doExport = () => {
    if (!table) { toast('This visual has no data to export.'); return; }
    downloadCsv(title, table);
    toast(`Exported "${title}" (${table.rows.length} rows) with the current filters.`);
  };

  const hasFilters = Object.values(sel).some((v) => (v?.length ?? 0) > 0);
  let body: ReactNode = children;
  if (sim === 'loading' || retrying) body = <Skeleton />;
  else if (sim === 'error') body = (
    <div className="state state-error" role="alert">
      <Icon name="warn" size={16} />
      <span><b>This visual could not load.</b> The data service returned an error (request id 7f3c-91a2). Other visuals are not affected.</span>
      <button type="button" className="btn btn-sm" onClick={() => { setRetrying(true); setTimeout(() => setRetrying(false), 900); }}>Retry</button>
    </div>
  );
  else if (sim === 'partial' && source === 'clearinghouse') body = (
    <div className="state state-unavailable" role="status">
      <Icon name="database" size={16} />
      <span><b>Data unavailable.</b> The claims clearinghouse feed has not loaded since Oct 6, 2026 3:30 AM. Values after Oct 5 are missing.</span>
    </div>
  );
  else if (sim === 'empty' || noData) body = (
    <div className="state state-empty" role="status">
      <Icon name="filter" size={16} />
      <span>{sim === 'empty' ? 'No data matches the current filters.' : noData}</span>
      {(sim === 'empty' || hasFilters) && <button type="button" className="btn btn-sm" onClick={clearAll}>Clear filters</button>}
    </div>
  );
  else if (asTable && table) body = <TableView data={table} />;

  return (
    <VisualContext.Provider value={{ focus }}>
      {focus && <div className="focus-backdrop" onClick={() => setFocus(false)} />}
      <section className={`visual ${focus ? 'visual-focus' : ''} ${className ?? ''}`} aria-label={title}>
        <header className="visual-head">
          <div className="visual-titles">
            <h3>{title}</h3>
            {subtitle && <div className="visual-sub">{subtitle}</div>}
          </div>
          <div className="visual-tools no-print">
            {actions}
            {(metricId || info) && <InfoIcon metricId={metricId} text={info} title={title} />}
            {table && (
              <button type="button" className={`icon-btn ${asTable ? 'on' : ''}`} title={asTable ? 'Show as visual' : 'Show as table'} aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
                <Icon name={asTable ? 'chart' : 'table'} />
              </button>
            )}
            <button type="button" className="icon-btn" title={focus ? 'Exit focus mode (Esc)' : 'Focus mode'} onClick={() => setFocus((f) => !f)}>
              <Icon name={focus ? 'close' : 'focus'} />
            </button>
            <button type="button" className="icon-btn" title="Export data (CSV)" onClick={doExport}><Icon name="download" /></button>
          </div>
        </header>
        <div className="visual-body">{body}</div>
        {specMode && spec && (
          <footer className="spec-note">
            <b>{spec.type}</b>
            {spec.metrics && <> · Measures: {spec.metrics.join(', ')}</>}
            {spec.dimensions && <> · Dimensions: {spec.dimensions.join(', ')}</>}
            {spec.interactions && <> · Interaction: {spec.interactions}</>}
          </footer>
        )}
      </section>
    </VisualContext.Provider>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <span key={i} style={{ width: `${92 - i * 11}%` }} />)}
    </div>
  );
}

function TableView({ data }: { data: TableData }) {
  return (
    <div className="tableview">
      <table className="grid compact">
        <thead><tr>{data.columns.map((c, i) => <th key={i} className={i ? 'num' : ''}>{c}</th>)}</tr></thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} className={j ? 'num' : ''}>{v ?? '–'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function downloadCsv(title: string, t: TableData, context: string[][] = []) {
  const lines = [
    ['View', title],
    ['Note', 'Synthetic prototype data. Not for operational use.'],
    ...context,
    [],
    t.columns,
    ...t.rows.map((r) => r.map((v) => (v === null ? '' : v))),
  ];
  const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^a-z0-9]+/gi, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
