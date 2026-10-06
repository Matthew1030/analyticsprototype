import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../config/brand';
import type { SelField } from '../engine/engine';
import { availablePeriods } from '../engine/periods';
import { FIELD_LABEL, facilityText, useApp, type PageId } from '../state/AppState';

const PAGES: { id: PageId; label: string; group?: string }[] = [
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'operational', label: 'Operational' },
  { id: 'change', label: 'Period-over-Period Change' },
  { id: 'dnfb', label: 'DNFB and DNSP', group: 'Detail' },
  { id: 'claims', label: 'Claims and Denials', group: 'Detail' },
  { id: 'ar', label: 'A/R and Cash', group: 'Detail' },
];

export function refreshText(utc: string) {
  const d = new Date(utc);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function Header({ onSignOut }: { onSignOut: () => void }) {
  const { ds, sel, period, valueLabel, periodStatus, user } = useApp();
  const status = periodStatus(period);
  const avail = ds.meta.availability[String(period.endMi)];
  return (
    <header className="app-header">
      <div className="brand">
        <span className="wordmark" aria-label={BRAND.name}>
          <span className="mark" aria-hidden="true" />{BRAND.name}
        </span>
        <span className="product">{BRAND.product}</span>
      </div>
      <div className="context">
        <div><span className="ctx-label">Client</span> {ds.dims.client.name}</div>
        <div><span className="ctx-label">Facilities</span> {facilityText(sel, valueLabel, ds.dims.facilities.length)}</div>
        <div>
          <span className="ctx-label">Period</span> {period.label}{' '}
          <span className={`period-badge ${status === 'Preliminary' ? 'prelim' : 'closed'}`}>{status}</span>
          {status === 'Preliminary' && avail && <span className="small muted"> · Planned close {avail}</span>}
        </div>
        <div><span className="ctx-label">Data last refreshed</span> {refreshText(ds.meta.lastRefreshUtc)}</div>
      </div>
      <div className="user">
        <span>{user}</span>
        <button type="button" className="btn-ghost no-print" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

function MultiSelect({ field, options }: { field: SelField; options: { key: number; label: string }[] }) {
  const { sel, toggle, clearField, selectOnly } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const chosen = sel[field] ?? [];
  const summary = chosen.length === 0 ? 'All' : chosen.length === 1 ? options.find((o) => o.key === chosen[0])?.label : `${chosen.length} selected`;
  return (
    <div className="filter" ref={ref}>
      <label className="filter-label" id={`lbl-${field}`}>{FIELD_LABEL[field]}</label>
      <button type="button" className={`filter-btn ${chosen.length ? 'active' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`lbl-${field}`} onClick={() => setOpen((o) => !o)}>
        {summary} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="filter-pop" role="listbox" aria-multiselectable="true">
          <div className="filter-pop-actions">
            <button type="button" onClick={() => clearField(field)}>All</button>
            <button type="button" onClick={() => selectOnly(field, options.map((o) => o.key).filter((k) => !chosen.includes(k)))}>Invert</button>
          </div>
          {options.map((o) => (
            <label key={o.key} className="filter-opt">
              <input type="checkbox" checked={chosen.includes(o.key)} onChange={() => toggle(field, o.key)} /> {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBar() {
  const { ds, period, setPeriod, setPeriodKind } = useApp();
  const d = ds.dims;
  const periods = availablePeriods(period.kind, ds.meta.windowStartMonth, ds.meta.endMonth);
  return (
    <div className="filterbar" role="region" aria-label="Filters">
      <div className="filter">
        <span className="filter-label">Period type</span>
        <div className="seg" role="radiogroup" aria-label="Period type">
          {(['month', 'quarter'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={period.kind === k} className={period.kind === k ? 'on' : ''} onClick={() => setPeriodKind(k)}>
              {k === 'month' ? 'Month' : 'Quarter'}
            </button>
          ))}
        </div>
      </div>
      <div className="filter">
        <label className="filter-label" htmlFor="period-select">Period</label>
        <select id="period-select" className="filter-btn" value={period.key} onChange={(e) => setPeriod(period.kind, Number(e.target.value))}>
          {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <MultiSelect field="facility" options={d.facilities.map((f) => ({ key: f.key, label: `${f.name} (${f.type === 'Critical Access' ? 'CAH' : 'Community'})` }))} />
      <MultiSelect field="financialClass" options={d.financialClasses.map((n, i) => ({ key: i, label: n }))} />
      <MultiSelect field="payer" options={d.payers.map((p) => ({ key: p.key, label: p.name }))} />
      <MultiSelect field="serviceLine" options={d.serviceLines.map((s) => ({ key: s.key, label: s.name }))} />
    </div>
  );
}

export function SelectionsBar() {
  const { sel, valueLabel, toggle, clearField, clearAll } = useApp();
  const items = (Object.keys(sel) as SelField[]).filter((f) => (sel[f]?.length ?? 0) > 0);
  return (
    <div className="selbar" role="region" aria-label="Current selections">
      <span className="selbar-title">Selections</span>
      {items.length === 0 && <span className="muted small">None. Click a value in any chart or use the filters to select.</span>}
      {items.map((f) => (
        <span key={f} className="sel-chip">
          <span className="sel-field">{FIELD_LABEL[f]}:</span>
          {sel[f]!.length <= 3 ? sel[f]!.map((k) => (
            <button key={k} type="button" className="sel-val" onClick={() => toggle(f, k)} aria-label={`Remove ${valueLabel(f, k)}`}>
              {valueLabel(f, k)} ✕
            </button>
          )) : <span className="sel-val">{sel[f]!.length} values</span>}
          <button type="button" className="sel-clear" aria-label={`Clear ${FIELD_LABEL[f]}`} onClick={() => clearField(f)}>Clear</button>
        </span>
      ))}
      <button type="button" className="btn-primary clear-all" disabled={items.length === 0} onClick={clearAll}>Clear all selections</button>
    </div>
  );
}

export function Nav() {
  const { page, setPage, claimListEnabled } = useApp();
  const pages = claimListEnabled ? [...PAGES, { id: 'claimlist' as PageId, label: 'Claim list (prototype only)', group: 'Detail' }] : PAGES;
  return (
    <nav className="nav no-print" aria-label="Sheets">
      {pages.map((p, i) => (
        <span key={p.id} className="nav-item">
          {p.group && pages[i - 1]?.group !== p.group && <span className="nav-group">{p.group}:</span>}
          <button type="button" className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

export function ActionBar() {
  const { getExport, ds, sel, period, valueLabel, toast, claimListEnabled, setClaimListEnabled, periodStatus } = useApp();
  const [emailOpen, setEmailOpen] = useState(false);

  const doExport = () => {
    const t = getExport();
    if (!t) { toast('This view has no table to export.'); return; }
    const other = (Object.keys(sel) as SelField[])
      .filter((f) => f !== 'facility' && (sel[f]?.length ?? 0) > 0)
      .map((f) => `${FIELD_LABEL[f]}: ${sel[f]!.map((k) => valueLabel(f, k)).join('; ')}`).join(' | ');
    const lines = [
      ['Client', ds.dims.client.name],
      ['Facility selection', facilityText(sel, valueLabel, ds.dims.facilities.length)],
      ['Other selections', other || 'None'],
      ['Reporting period', `${period.label} (${periodStatus(period)})`],
      ['Data last refreshed', refreshText(ds.meta.lastRefreshUtc)],
      ['View', t.title],
      ['Note', 'Synthetic data. Prototype export (CSV). The Qlik build uses its native Excel download.'],
      [],
      t.columns,
      ...t.rows,
    ];
    const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t.title.replace(/[^a-z0-9]+/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exported "${t.title}" with the active selections (${t.rows.length} rows).`);
  };

  return (
    <div className="actionbar no-print">
      <button type="button" className="btn" onClick={doExport}>Export data (CSV)</button>
      <button type="button" className="btn" onClick={() => window.print()}>Print</button>
      <button type="button" className="btn" onClick={() => setEmailOpen(true)}>Schedule email</button>
      <label className="toggle" title="Account-level records are excluded from version 1. This toggle shows the boundary to stakeholders.">
        <input type="checkbox" checked={claimListEnabled} onChange={(e) => setClaimListEnabled(e.target.checked)} />
        Claim list (prototype only, not in v1)
      </label>
      {emailOpen && <EmailDialog onClose={() => setEmailOpen(false)} />}
    </div>
  );
}

function EmailDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="email-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="email-title">Schedule email (mock)</h2>
        <p className="small">In the Qlik build this uses Qlik subscriptions or reporting (verify the license). Content follows the same facility entitlements as the screen.</p>
        <label className="field">Recipients<input type="text" placeholder="name@example.com" /></label>
        <label className="field">Frequency
          <select defaultValue="monthly"><option value="weekly">Weekly</option><option value="monthly">Monthly, after period close</option></select>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => { toast('Prototype only: no email is scheduled or sent.'); onClose(); }}>Save schedule</button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
    </div>
  );
}
