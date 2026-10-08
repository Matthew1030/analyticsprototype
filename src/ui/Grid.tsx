// Analytical grid. Sort by any column (within each level of a hierarchy), sticky header,
// totals and subtotals, expand/collapse of grouped rows, conditional formatting (heat,
// data bars, status), paging, and row click for drill-through.

import { useMemo, useState, type ReactNode } from 'react';
import type { Status } from '../engine/status';
import { DataBar, InfoIcon } from './common';
import { Icon } from './icons';

export interface GridColumn<R> {
  key: string;
  label: ReactNode;
  /** Plain-text header for export. */
  text?: string;
  value: (r: R) => number | string | null;
  format?: (v: number | null, r: R) => ReactNode;
  /** Text for export (defaults to the formatted value as a string or the raw value). */
  exportText?: (r: R) => string | number;
  align?: 'left' | 'right' | 'center';
  width?: number;
  /** Heat background: 'high' = higher is worse (red ramp), 'low' = lower is worse, 'magnitude' = blue ramp. */
  heat?: 'high' | 'low' | 'magnitude';
  /** In-cell data bar, scaled to the column maximum. */
  bar?: boolean;
  /** Status coloring of the cell text. */
  status?: (r: R) => Status;
  info?: ReactNode;
  metricId?: string;
  sortable?: boolean;
  /** Column group label (two-row header). */
  group?: string;
  render?: (r: R) => ReactNode;
}

export interface GridRow<R> {
  id: string;
  data: R;
  children?: GridRow<R>[];
  /** Row style: subtotal rows are bold. */
  kind?: 'detail' | 'subtotal';
}

interface Props<R> {
  columns: GridColumn<R>[];
  rows: GridRow<R>[];
  total?: R;
  caption: string;
  onRowClick?: (r: R, row: GridRow<R>) => void;
  selected?: (r: R) => boolean;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  maxHeight?: number;
  defaultExpanded?: boolean;
  dense?: boolean;
  footnote?: ReactNode;
}

export function Grid<R>({ columns, rows, total, caption, onRowClick, selected, defaultSort, pageSize, maxHeight, defaultExpanded = false, dense, footnote }: Props<R>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultExpanded ? collectIds(rows) : []));
  const hasTree = rows.some((r) => r.children?.length);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    if (!c) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: GridRow<R>, b: GridRow<R>) => {
      const va = c.value(a.data);
      const vb = c.value(b.data);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    };
    const rec = (list: GridRow<R>[]): GridRow<R>[] => [...list].sort(cmp).map((r) => (r.children ? { ...r, children: rec(r.children) } : r));
    return rec(rows);
  }, [rows, columns, sort]);

  // Column ranges for heat and bars, over every visible-level row.
  const ranges = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    const leaves: R[] = [];
    const walk = (l: GridRow<R>[]) => l.forEach((r) => { leaves.push(r.data); if (r.children) walk(r.children); });
    walk(rows);
    for (const c of columns) {
      if (!c.heat && !c.bar) continue;
      const vals = leaves.map((r) => c.value(r)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      out[c.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return out;
  }, [rows, columns]);

  const flat: { row: GridRow<R>; level: number }[] = [];
  const walk = (list: GridRow<R>[], level: number) => {
    for (const r of list) {
      flat.push({ row: r, level });
      if (r.children && open.has(r.id)) walk(r.children, level + 1);
    }
  };
  walk(sorted, 0);
  const pages = pageSize ? Math.max(1, Math.ceil(flat.length / pageSize)) : 1;
  const p = Math.min(page, pages - 1);
  const shown = pageSize ? flat.slice(p * pageSize, p * pageSize + pageSize) : flat;

  const clickSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));
    setPage(0);
  };
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const groups = columns.some((c) => c.group);

  const cellParts = (c: GridColumn<R>, r: R, isTotal = false) => {
    const v = c.value(r);
    const content = c.render ? c.render(r) : c.format ? c.format(typeof v === 'number' ? v : null, r) : v ?? '–';
    const st = c.status?.(r);
    const bg = c.heat && !isTotal && typeof v === 'number' ? heatColor(v, ranges[c.key], c.heat) : undefined;
    const cls = [`al-${c.align ?? (typeof v === 'number' ? 'right' : 'left')}`, st ? `txt-${st === 'On target' ? 'ok' : st === 'Watch' ? 'watch' : 'off'}` : ''].join(' ');
    const body = c.bar && !isTotal && typeof v === 'number'
      ? <span className="bar-cell"><DataBar value={v} max={ranges[c.key]?.max ?? 0} /><span className="bar-val">{content}</span></span>
      : content;
    return { cls, style: bg ? { background: bg } : undefined, body };
  };
  const cell = (c: GridColumn<R>, r: R, isTotal = false) => {
    const x = cellParts(c, r, isTotal);
    return <td key={c.key} className={x.cls} style={x.style}>{x.body}</td>;
  };

  return (
    <div className={`grid-wrap ${dense ? 'dense' : ''}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className="grid">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {groups && (
            <tr className="group-head">
              {groupSpans(columns).map((g, i) => <th key={i} colSpan={g.span} className={g.label ? 'grp' : ''}>{g.label}</th>)}
            </tr>
          )}
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                className={`al-${c.align ?? (i === 0 ? 'left' : 'right')} ${i === 0 ? 'sticky-col' : ''}`}
                aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span className="th-inner">
                  {c.sortable === false ? <span>{c.label}</span> : (
                    <button type="button" className="th-btn" onClick={() => clickSort(c.key)} title="Sort">
                      {c.label}<span className="sort-ind" aria-hidden="true">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  )}
                  {(c.info || c.metricId) && <InfoIcon metricId={c.metricId} text={c.info} title={typeof c.label === 'string' ? c.label : c.text} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={columns.length} className="nodata-cell">No rows match the current filters.</td></tr>}
          {shown.map(({ row, level }) => {
            const hasKids = !!row.children?.length;
            const isSel = selected?.(row.data);
            return (
              <tr key={row.id}
                className={`${onRowClick ? 'clickable' : ''} ${isSel ? 'row-sel' : ''} ${row.kind === 'subtotal' || hasKids ? 'row-sub' : ''} lvl-${level}`}
                onClick={onRowClick ? () => onRowClick(row.data, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row.data, row); } : undefined}>
                {columns.map((c, i) => {
                  if (i > 0) return cell(c, row.data);
                  const x = cellParts(c, row.data);
                  return (
                    <td key={c.key} className={`${x.cls} sticky-col`} style={{ ...x.style, paddingLeft: 8 + level * 16 }}>
                      {hasTree && (hasKids ? (
                        <button type="button" className="tree-btn" aria-expanded={open.has(row.id)} aria-label={open.has(row.id) ? 'Collapse' : 'Expand'}
                          onClick={(e) => { e.stopPropagation(); toggle(row.id); }}>
                          <Icon name={open.has(row.id) ? 'chevronDown' : 'chevronRight'} size={11} />
                        </button>
                      ) : <span className="tree-pad" />)}
                      {x.body}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {total && (
          <tfoot>
            <tr className="row-total">{columns.map((c, i) => (i === 0 ? <td key={c.key} className="sticky-col al-left">{cellParts(c, total, true).body}</td> : cell(c, total, true)))}</tr>
          </tfoot>
        )}
      </table>
      {(pageSize && flat.length > pageSize) || hasTree || footnote ? (
        <div className="grid-foot no-print">
          {hasTree && (
            <span className="grid-tree-actions">
              <button type="button" className="link" onClick={() => setOpen(new Set(collectIds(rows)))}>Expand all</button>
              <button type="button" className="link" onClick={() => setOpen(new Set())}>Collapse all</button>
            </span>
          )}
          {footnote && <span className="muted">{footnote}</span>}
          {pageSize && flat.length > pageSize && (
            <span className="pager">
              <button type="button" className="icon-btn" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={12} /></button>
              <span>{p * pageSize + 1}–{Math.min(flat.length, (p + 1) * pageSize)} of {flat.length.toLocaleString('en-US')}</span>
              <button type="button" className="icon-btn" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page"><Icon name="chevronRight" size={12} /></button>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function collectIds<R>(rows: GridRow<R>[]): string[] {
  const out: string[] = [];
  const walk = (l: GridRow<R>[]) => l.forEach((r) => { if (r.children?.length) { out.push(r.id); walk(r.children); } });
  walk(rows);
  return out;
}

function groupSpans<R>(columns: GridColumn<R>[]) {
  const out: { label: string; span: number }[] = [];
  for (const c of columns) {
    const g = c.group ?? '';
    const last = out[out.length - 1];
    if (last && last.label === g) last.span++;
    else out.push({ label: g, span: 1 });
  }
  return out;
}

/** Restrained heat: light tints only, so text stays readable. */
function heatColor(v: number, r: { min: number; max: number } | undefined, mode: 'high' | 'low' | 'magnitude') {
  if (!r || r.max === r.min) return undefined;
  let t = (v - r.min) / (r.max - r.min);
  if (mode === 'low') t = 1 - t;
  t = Math.max(0, Math.min(1, t));
  if (mode === 'magnitude') return `rgba(42,120,214,${(0.04 + 0.26 * t).toFixed(3)})`;
  if (t < 0.5) return undefined;
  return `rgba(214,72,60,${(0.05 + 0.3 * (t - 0.5) * 2).toFixed(3)})`;
}

/** Export rows of a grid (flattened, all levels). */
export function gridExport<R>(columns: GridColumn<R>[], rows: GridRow<R>[], total?: R) {
  const out: (string | number | null)[][] = [];
  const text = (c: GridColumn<R>, r: R) => {
    if (c.exportText) return c.exportText(r);
    const v = c.value(r);
    if (c.format && typeof v === 'number') { const f = c.format(v, r); return typeof f === 'string' ? f : v; }
    return v;
  };
  const walk = (l: GridRow<R>[], level: number) => l.forEach((r) => {
    out.push(columns.map((c, i) => (i === 0 ? `${'  '.repeat(level)}${text(c, r.data) ?? ''}` : text(c, r.data))));
    if (r.children) walk(r.children, level + 1);
  });
  walk(rows, 0);
  if (total) out.push(columns.map((c) => text(c, total)));
  return { columns: columns.map((c) => c.text ?? (typeof c.label === 'string' ? c.label : c.key)), rows: out };
}
