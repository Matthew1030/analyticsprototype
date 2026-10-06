// Qlik: Table (straight table). Sort by header, page, and search each column.

import { useMemo, useState, type ReactNode } from 'react';
import { InfoIcon } from './common';

export interface Column<R> {
  key: string;
  label: string;
  /** Value used for sort, search and export. */
  value: (r: R) => string | number | null;
  /** Cell content. Defaults to the value. */
  render?: (r: R) => ReactNode;
  align?: 'left' | 'right' | 'center';
  metricId?: string;
  info?: string;
  /** Text shown in export and search. Defaults to value. */
  text?: (r: R) => string;
}

interface Props<R> {
  columns: Column<R>[];
  rows: R[];
  pageSize?: number;
  onRowClick?: (r: R) => void;
  rowClass?: (r: R) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  searchable?: boolean;
  caption: string;
  groupBy?: (r: R) => string;
}

export function DataTable<R>({ columns, rows, pageSize = 10, onRowClick, rowClass, initialSort, searchable = true, caption, groupBy }: Props<R>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const active = Object.entries(search).filter(([, v]) => v.trim());
    let out = rows;
    if (active.length) {
      out = rows.filter((r) => active.every(([k, q]) => {
        const c = columns.find((x) => x.key === k)!;
        const t = (c.text ? c.text(r) : String(c.value(r) ?? '')).toLowerCase();
        return t.includes(q.trim().toLowerCase());
      }));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) {
        const dir = sort.dir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = c.value(a);
          const vb = c.value(b);
          if (va === null) return 1;
          if (vb === null) return -1;
          return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
        });
      }
    }
    return out;
  }, [rows, columns, search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, p * pageSize + pageSize);

  const clickSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    setPage(0);
  };

  let lastGroup = '';
  return (
    <div className="table-wrap">
      <table className="dt">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`al-${c.align ?? 'left'}`} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="th-btn" onClick={() => clickSort(c.key)}>
                  {c.label}
                  <span className="sort-ind" aria-hidden="true">{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                </button>
                {(c.metricId || c.info) && <InfoIcon metricId={c.metricId} text={c.info} title={c.label} />}
              </th>
            ))}
          </tr>
          {searchable && (
            <tr className="search-row no-print">
              {columns.map((c) => (
                <th key={c.key}>
                  <input
                    type="search"
                    aria-label={`Search ${c.label}`}
                    placeholder="Search"
                    value={search[c.key] ?? ''}
                    onChange={(e) => { setSearch((s) => ({ ...s, [c.key]: e.target.value })); setPage(0); }}
                  />
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr><td colSpan={columns.length} className="nodata-cell">No data is available for this selection.</td></tr>
          )}
          {shown.map((r, i) => {
            const g = groupBy && !sort ? groupBy(r) : '';
            const header = g && g !== lastGroup ? g : '';
            lastGroup = g || lastGroup;
            return [
              header && <tr key={`g-${header}-${i}`} className="group-row"><td colSpan={columns.length}>{header}</td></tr>,
              <tr
                key={i}
                className={`${onRowClick ? 'clickable' : ''} ${rowClass?.(r) ?? ''}`}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`al-${c.align ?? 'left'}`}>{c.render ? c.render(r) : c.text ? c.text(r) : String(c.value(r) ?? '–')}</td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
      {filtered.length > pageSize && (
        <div className="pager no-print">
          <button type="button" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button>
          <span>Page {p + 1} of {pages} · {filtered.length.toLocaleString('en-US')} rows</span>
          <button type="button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

/** Rows for export: the column text of every row (not only the current page). */
export function tableToExport<R>(columns: Column<R>[], rows: R[]): { columns: string[]; rows: (string | number)[][] } {
  return {
    columns: columns.map((c) => c.label),
    rows: rows.map((r) => columns.map((c) => {
      const v = c.text ? c.text(r) : c.value(r);
      return v === null ? '' : v;
    })),
  };
}
