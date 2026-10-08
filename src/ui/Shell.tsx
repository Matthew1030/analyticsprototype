// Workspace shell: header, page tabs, filter pane, canvas header (breadcrumb + applied
// filters) and status bar. Vendor-neutral: this is the analytics product, not a BI tool.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '../config/brand';
import { isoDay } from '../data/dates';
import { FIELD_LABEL, type SelField } from '../engine/engine';
import { METRIC_BY_ID, RCM_AREAS } from '../engine/metrics';
import { availablePeriods, COMPARE_LABEL, comparePeriod, PERIOD_KIND_LABEL, type PeriodKind } from '../engine/periods';
import { fmtDate, fmtDateTime } from '../format';
import { DIMENSION_LABEL, members } from '../services/analytics';
import { scopeText, useApp, type PageId, type Route, type SimState } from '../state/AppState';
import { Icon } from './icons';

/** The three product experiences: See (ELT Summary), Understand (Analytics), Act (Worklists). */
export type Section = 'elt' | 'analytics' | 'worklists';

export const SECTIONS: { id: Section; label: string; verb: string; question: string; home: PageId }[] = [
  { id: 'elt', label: 'ELT Summary', verb: 'See', question: 'How are we doing?', home: 'executive' },
  { id: 'analytics', label: 'Analytics', verb: 'Understand', question: 'What is happening, where, and why?', home: 'cycle' },
  { id: 'worklists', label: 'Worklists', verb: 'Act', question: 'What specifically needs to be worked?', home: 'wl-denials' },
];

export interface PageMeta { id: PageId; label: string; title: string; question: string; section: Section; nav?: boolean; pageFilters?: SelField[] }

export const PAGES: PageMeta[] = [
  { id: 'executive', section: 'elt', label: 'ELT Summary', title: 'ELT Summary', question: 'How are we doing?', nav: true },
  { id: 'cycle', section: 'analytics', label: 'Revenue Cycle Overview', title: 'Revenue Cycle Overview', question: 'How is each part of the revenue cycle performing against target, and which stage is causing the problem?', nav: true },
  { id: 'ar', section: 'analytics', label: 'A/R', title: 'A/R Analytics', question: 'Where is A/R accumulating, and why?', nav: true, pageFilters: ['arAge', 'accountStatus'] },
  { id: 'denials', section: 'analytics', label: 'Denials', title: 'Denials Analytics', question: 'Which payers, hospitals and root causes drive denials?', nav: true, pageFilters: ['denialCategory', 'rootCause'] },
  { id: 'cash', section: 'analytics', label: 'Cash', title: 'Cash and Collections', question: 'Are we on track to hit the cash goal?', nav: true },
  { id: 'access', section: 'analytics', label: 'Patient Access', title: 'Patient Access (Front End)', question: 'Are we getting registration, eligibility and authorization right before service?', nav: true },
  { id: 'midcycle', section: 'analytics', label: 'Mid-Cycle', title: 'Mid-Cycle: Charge Capture, Coding and CDI', question: 'Are charges, coding and documentation complete and on time?', nav: true },
  { id: 'billing', section: 'analytics', label: 'Billing / DNFB', title: 'Billing and DNFB', question: 'What is holding claims back from going out the door?', nav: true, pageFilters: ['dnfbHold', 'editCategory'] },
  { id: 'payers', section: 'analytics', label: 'Payers', title: 'Payer Performance', question: 'Which payers pay slowly, deny more, or underpay?', nav: true },
  { id: 'facilities', section: 'analytics', label: 'Facilities', title: 'Facility Comparison', question: 'How do our hospitals compare, and which need attention?', nav: true },
  { id: 'definitions', section: 'analytics', label: 'Definitions', title: 'Metric Definitions and Data', question: 'What does each measure mean, and how current is the data?', nav: true },
  { id: 'metric', section: 'analytics', label: 'Metric Analysis', title: 'Metric Analysis', question: 'What is happening, where is it happening, and why?' },
  { id: 'facility', section: 'analytics', label: 'Hospital Profile', title: 'Hospital Profile', question: 'How is this hospital performing across the revenue cycle?' },
  { id: 'accounts', section: 'analytics', label: 'Account Detail', title: 'Account Detail', question: 'Which accounts make up this balance?' },
  { id: 'wl-denials', section: 'worklists', label: 'Denials', title: 'Denials worklist', question: 'Which denied claims do I appeal, correct or close today?', nav: true },
  { id: 'wl-ar', section: 'worklists', label: 'A/R follow-up', title: 'A/R follow-up worklist', question: 'Which insurance balances do I follow up today?', nav: true },
  { id: 'wl-dnfb', section: 'worklists', label: 'DNFB', title: 'DNFB worklist', question: 'Which unbilled accounts do I release today?', nav: true },
];
export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p])) as Record<PageId, PageMeta>;

export function sectionOf(page: PageId): Section {
  return PAGE_BY_ID[page]?.section ?? 'elt';
}

// ---------------------------------------------------------------- header

export function Header() {
  const { ds, period, periodStatus, sim, sel, valueLabel } = useApp();
  const st = periodStatus(period);
  const stale = sim === 'stale';
  const refreshed = stale ? '2026-10-06T11:00:00Z' : ds.meta.lastRefreshUtc;
  return (
    <header className="app-header">
      <div className="brand">
        <span className="logo" aria-hidden="true"><Icon name="chart" size={14} /></span>
        <span className="product">{BRAND.product}</span>
        <span className="sep" aria-hidden="true" />
        <span className="org">{scopeText(sel, valueLabel, ds.dims.organization.name, ds.dims.facilities.length)}</span>
      </div>
      <SectionNav />
      <div className="header-meta">
        <span title="Reporting period selected in the filter pane">Reporting period <b>{period.label}</b>
          <span className={`pill ${st === 'Preliminary' ? 'pill-prelim' : 'pill-closed'}`} title={st === 'Preliminary' ? `Month not closed. Planned close ${ds.meta.availability[String(period.endMi + 1)] ?? ''}` : 'Closed period'}>{st}</span>
        </span>
        <span>Data through <b>{fmtDate(ds.meta.asOfDay)}</b></span>
        <span className={stale ? 'fresh-warn' : 'fresh-ok'} title="Last successful load of all source systems">
          <span className="dot" aria-hidden="true" />Refreshed {fmtDateTime(refreshed, ds.meta.displayTimeZone)}
        </span>
      </div>
      <div className="header-right">
        <PrototypeMenu />
        <span className="user" title="Signed in through the organization's single sign-on">
          <span className="avatar" aria-hidden="true">JE</span>
          <span className="user-name">Jordan Ellis<span className="user-role">Revenue Cycle Analyst</span></span>
        </span>
      </div>
    </header>
  );
}

/** Top-level product sections. Each remembers the last page the user had open in it. */
function SectionNav() {
  const { route, go } = useApp();
  const current = sectionOf(route.page);
  const last = useRef<Record<Section, PageId>>({ elt: 'executive', analytics: 'cycle', worklists: 'wl-denials' });
  if (PAGE_BY_ID[route.page]?.nav) last.current[current] = route.page;
  return (
    <nav className="sections" aria-label="Product sections">
      {SECTIONS.map((x, i) => (
        <button key={x.id} type="button" className={`section-btn ${current === x.id ? 'on' : ''}`} aria-current={current === x.id ? 'page' : undefined}
          title={`${x.verb}: ${x.question}`} onClick={() => go(current === x.id ? x.home : last.current[x.id])}>
          <span className="section-step" aria-hidden="true">{i + 1}</span>{x.label}
        </button>
      ))}
    </nav>
  );
}

function PrototypeMenu() {
  const { sim, setSim, specMode, setSpecMode } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const opts: { v: SimState; label: string; note: string }[] = [
    { v: 'normal', label: 'Normal', note: 'Happy path' },
    { v: 'loading', label: 'Loading', note: 'Visuals show skeletons' },
    { v: 'stale', label: 'Stale data', note: 'Refresh is more than 24 hours old' },
    { v: 'partial', label: 'Source delayed', note: 'Claims clearinghouse feed missing' },
    { v: 'empty', label: 'Filtered to zero', note: 'No rows match the filters' },
    { v: 'error', label: 'Service error', note: 'Visuals fail to load' },
  ];
  return (
    <div className="proto" ref={ref}>
      <button type="button" className={`proto-btn ${sim !== 'normal' || specMode ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="code" size={13} /> Prototype{sim !== 'normal' ? `: ${opts.find((o) => o.v === sim)?.label}` : ''}
      </button>
      {open && (
        <div className="menu proto-menu" role="menu">
          <div className="menu-title">Simulate state (for developers)</div>
          {opts.map((o) => (
            <button key={o.v} type="button" role="menuitemradio" aria-checked={sim === o.v} className={`menu-item ${sim === o.v ? 'on' : ''}`} onClick={() => setSim(o.v)}>
              <span className="radio" aria-hidden="true" />{o.label}<span className="muted small"> · {o.note}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <label className="menu-item">
            <input type="checkbox" checked={specMode} onChange={(e) => setSpecMode(e.target.checked)} /> Show build annotations on visuals
          </label>
          <div className="menu-note">Synthetic data. All organizations and figures are fictional.</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tabs

export function NavTabs() {
  const { route, go, toast } = useApp();
  const section = sectionOf(route.page);
  const meta = SECTIONS.find((x) => x.id === section)!;
  const active = PAGE_BY_ID[route.page]?.nav ? route.page : null;
  const tabs = PAGES.filter((p) => p.nav && p.section === section && section !== 'elt');
  return (
    <nav className={`tabs no-print tabs-${section}`} aria-label={`${meta.label} pages`}>
      <span className="tabs-lead" title={meta.question}><b>{meta.verb}</b><span className="muted">{meta.question}</span></span>
      <div className="tab-list" role="tablist">
        {tabs.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={active === p.id} className={`tab ${active === p.id ? 'on' : ''} ${p.id === 'definitions' ? 'tab-right' : ''}`} onClick={() => go(p.id)}>
            {p.label}
          </button>
        ))}
        {section === 'elt' && <span className="tabs-note">One-minute view of revenue cycle health. Click any measure to investigate it in Analytics.</span>}
      </div>
      <div className="tab-actions">
        <button type="button" className="icon-btn" title="Copy link to this view (filters persist in the link and in your browser)" onClick={() => {
          try { void navigator.clipboard?.writeText(location.href); } catch { /* clipboard blocked */ }
          toast('Link copied. Filters are saved with the workspace.');
        }}><Icon name="share" /></button>
        <button type="button" className="icon-btn" title="Save as bookmark (prototype: not saved)" onClick={() => toast('Prototype: personal bookmarks would save this page, filters and period.')}><Icon name="bookmark" /></button>
        <button type="button" className="icon-btn" title="Print or save as PDF" onClick={() => window.print()}><Icon name="download" /></button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- filter pane

function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, close]);
  return ref;
}

function Slicer({ field, defaultOpen = false, note }: { field: SelField; defaultOpen?: boolean; note?: string }) {
  const { ds, sel, toggle, clearField, selectOnly } = useApp();
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState('');
  const opts = useMemo(() => members(ds, field, sel), [ds, field, sel]);
  const chosen = sel[field] ?? [];
  const shown = q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts;
  const summary = chosen.length === 0 ? 'All' : chosen.length === 1 ? opts.find((o) => o.key === chosen[0])?.label ?? '1 selected' : `${chosen.length} selected`;
  return (
    <div className={`slicer ${chosen.length ? 'active' : ''}`}>
      <div className="slicer-head">
        <button type="button" className="slicer-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={10} />
          <span className="slicer-name">{FIELD_LABEL[field]}</span>
          <span className="slicer-sum" title={summary}>{summary}</span>
        </button>
        {chosen.length > 0 && <button type="button" className="icon-btn xs" title={`Clear ${FIELD_LABEL[field]}`} onClick={() => clearField(field)}><Icon name="close" size={10} /></button>}
      </div>
      {open && (
        <div className="slicer-body">
          {note && <div className="slicer-note">{note}</div>}
          {opts.length > 7 && (
            <div className="slicer-search"><Icon name="search" size={11} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${FIELD_LABEL[field]}`} /></div>
          )}
          <div className="slicer-actions">
            <button type="button" className="link" onClick={() => selectOnly(field, opts.map((o) => o.key))}>Select all</button>
            <button type="button" className="link" onClick={() => clearField(field)}>Clear</button>
          </div>
          <div className="slicer-list" role="listbox" aria-multiselectable="true" aria-label={FIELD_LABEL[field]}>
            {shown.map((o) => (
              <label key={o.key} className={`slicer-opt ${chosen.includes(o.key) ? 'on' : ''}`} title={o.sub}>
                <input type="checkbox" checked={chosen.includes(o.key)} onChange={() => toggle(field, o.key)} />
                <span className="opt-label">{o.label}</span>
              </label>
            ))}
            {shown.length === 0 && <span className="muted small">No match</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function AreaSlicer() {
  const { areas, setAreas } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className={`slicer ${areas.length ? 'active' : ''}`}>
      <div className="slicer-head">
        <button type="button" className="slicer-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={10} />
          <span className="slicer-name">RCM area</span>
          <span className="slicer-sum">{areas.length === 0 ? 'All' : areas.length === 1 ? areas[0] : `${areas.length} selected`}</span>
        </button>
        {areas.length > 0 && <button type="button" className="icon-btn xs" title="Clear RCM area" onClick={() => setAreas([])}><Icon name="close" size={10} /></button>}
      </div>
      {open && (
        <div className="slicer-body">
          <div className="slicer-note">Limits the metrics listed in scorecards and definitions.</div>
          <div className="slicer-list">
            {RCM_AREAS.map((a) => (
              <label key={a} className={`slicer-opt ${areas.includes(a) ? 'on' : ''}`}>
                <input type="checkbox" checked={areas.includes(a)} onChange={() => setAreas(areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a])} />
                <span className="opt-label">{a}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterPane() {
  const { ds, period, setPeriod, setPeriodKind, compare, setCompare, clearAll, sel, paneOpen, setPaneOpen, route, areas } = useApp();
  const periods = availablePeriods(period.kind, ds.meta.windowStartMonth, ds.meta.endMonth);
  const active = Object.values(sel).reduce((a, v) => a + (v?.length ? 1 : 0), 0) + (areas.length ? 1 : 0);
  const pageFilters = PAGE_BY_ID[route.page]?.pageFilters ?? [];
  if (!paneOpen) {
    return (
      <aside className="pane pane-closed no-print" aria-label="Filters (collapsed)">
        <button type="button" className="pane-rail" onClick={() => setPaneOpen(true)} title="Show filters">
          <Icon name="filter" /><span className="rail-text">Filters{active ? ` (${active})` : ''}</span>
        </button>
      </aside>
    );
  }
  return (
    <aside className="pane no-print" aria-label="Filters">
      <div className="pane-head">
        <span><Icon name="filter" size={13} /> Filters</span>
        <span className="pane-head-actions">
          <button type="button" className="link" disabled={!active} onClick={clearAll}>Clear all</button>
          <button type="button" className="icon-btn" onClick={() => setPaneOpen(false)} title="Hide filter pane"><Icon name="chevronLeft" /></button>
        </span>
      </div>
      <div className="pane-scroll">
        <section className="pane-sec">
          <h4>Date</h4>
          <label className="fld">Period type
            <select value={period.kind} onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}>
              {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="fld">Period
            <select value={period.key} onChange={(e) => setPeriod(period.kind, Number(e.target.value))}>
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <div className="fld-note">{isoDay(period.startDay)} to {isoDay(period.endDay)}</div>
          <label className="fld">Compare to
            <select value={compare} onChange={(e) => setCompare(e.target.value as 'prior' | 'py')}>
              {(['prior', 'py'] as const).map((c) => <option key={c} value={c}>{COMPARE_LABEL[c]} ({comparePeriod(period, c).short})</option>)}
            </select>
          </label>
        </section>
        <section className="pane-sec">
          <h4>Organization</h4>
          <Slicer field="region" />
          <Slicer field="facilityType" />
          <Slicer field="facility" defaultOpen />
        </section>
        <section className="pane-sec">
          <h4>Payer</h4>
          <Slicer field="financialClass" />
          <Slicer field="payer" />
        </section>
        <section className="pane-sec">
          <h4>Service</h4>
          <Slicer field="patientType" />
          <Slicer field="serviceLine" />
        </section>
        <section className="pane-sec">
          <h4>Metrics</h4>
          <AreaSlicer />
        </section>
        {pageFilters.length > 0 && (
          <section className="pane-sec pane-page">
            <h4>This page</h4>
            {pageFilters.map((f) => <Slicer key={f} field={f} defaultOpen={!!sel[f]?.length} note={pageNote(f)} />)}
          </section>
        )}
      </div>
    </aside>
  );
}

function pageNote(f: SelField) {
  if (f === 'arAge' || f === 'accountStatus') return 'Applies to A/R balances ($). A/R days and aging shares ignore it.';
  if (f === 'denialCategory' || f === 'rootCause') return 'Applies to denial measures.';
  if (f === 'dnfbHold') return 'Applies to DNFB measures.';
  if (f === 'editCategory') return 'Applies to claim edit measures.';
  return undefined;
}

// ---------------------------------------------------------------- canvas header

export function Crumbs({ extra }: { extra?: ReactNode }) {
  const { route, trail, back, go } = useApp();
  const section = SECTIONS.find((x) => x.id === sectionOf(route.page))!;
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.length > 0 && (
        <button type="button" className="crumb-back" onClick={back} title="Back to the previous view"><Icon name="back" size={12} /> Back</button>
      )}
      {trail.length === 0 && <button type="button" className="crumb" onClick={() => go(section.home)}>{section.label}</button>}
      {trail.map((r, i) => (
        <span key={i} className="crumb-item">{i > 0 && <span className="crumb-sep">›</span>}<span className="crumb muted-crumb">{routeLabel(r)}</span></span>
      ))}
      <span className="crumb-item"><span className="crumb-sep">›</span><span className="crumb current">{routeLabel(route)}</span></span>
      {extra}
    </nav>
  );
}

export function CanvasHeader({ title, question, crumbs, right }: { title?: string; question?: string; crumbs?: ReactNode; right?: ReactNode }) {
  const { route } = useApp();
  const meta = PAGE_BY_ID[route.page] ?? PAGE_BY_ID.executive;
  return (
    <div className="canvas-head">
      <div className="canvas-title-row">
        <div>
          <Crumbs extra={crumbs} />
          <h1>{title ?? meta.title}</h1>
          <p className="question">{question ?? meta.question}</p>
        </div>
        {right && <div className="canvas-right">{right}</div>}
      </div>
      <AppliedFilters />
    </div>
  );
}

function routeLabel(r: Route): string {
  const meta = PAGE_BY_ID[r.page];
  if (r.page === 'metric' && r.params.id) return `${METRIC_BY_ID[r.params.id]?.short ?? METRIC_BY_ID[r.params.id]?.name ?? r.params.id}`;
  if (r.page === 'facility' && r.params.id) return `Hospital profile`;
  if (meta?.section === 'worklists') return `${meta.label} worklist`;
  if (r.page === 'cycle') return 'Revenue Cycle Overview';
  return meta?.label ?? r.page;
}

export function AppliedFilters() {
  const { sel, valueLabel, toggle, clearField, clearAll, period, compare, areas, setAreas } = useApp();
  const items = (Object.keys(sel) as SelField[]).filter((f) => (sel[f]?.length ?? 0) > 0);
  return (
    <div className="applied" role="region" aria-label="Applied filters">
      <span className="applied-chip fixed" title="Report period and comparison">
        <span className="chip-field">Period</span> {period.label} <span className="muted">vs {COMPARE_LABEL[compare].toLowerCase()} ({comparePeriod(period, compare).short})</span>
      </span>
      {items.map((f) => (
        <span key={f} className="applied-chip">
          <span className="chip-field">{FIELD_LABEL[f]}</span>
          {sel[f]!.length <= 2 ? sel[f]!.map((k) => (
            <button key={k} type="button" className="chip-val" onClick={() => toggle(f, k)} aria-label={`Remove ${valueLabel(f, k)}`}>{valueLabel(f, k)} <Icon name="close" size={9} /></button>
          )) : <span className="chip-val static" title={sel[f]!.map((k) => valueLabel(f, k)).join(', ')}>{sel[f]!.length} values</span>}
          {sel[f]!.length > 2 && <button type="button" className="chip-x" aria-label={`Clear ${FIELD_LABEL[f]}`} onClick={() => clearField(f)}><Icon name="close" size={9} /></button>}
        </span>
      ))}
      {areas.length > 0 && (
        <span className="applied-chip"><span className="chip-field">RCM area</span>
          <span className="chip-val static">{areas.length <= 2 ? areas.join(', ') : `${areas.length} areas`}</span>
          <button type="button" className="chip-x" aria-label="Clear RCM area" onClick={() => setAreas([])}><Icon name="close" size={9} /></button>
        </span>
      )}
      {items.length === 0 && areas.length === 0 && <span className="muted small">No filters applied. Click any bar, row or point to filter; use the pane on the left for more.</span>}
      {(items.length > 0 || areas.length > 0) && <button type="button" className="link" onClick={clearAll}>Clear all</button>}
    </div>
  );
}

// ---------------------------------------------------------------- status bar & toasts

export function StatusBar() {
  const { ds, sim, period, periodStatus } = useApp();
  const delayed = sim === 'partial';
  return (
    <footer className="statusbar no-print">
      <span><Icon name="database" size={11} /> Sources: patient accounting, clearinghouse, registration/ADT, scheduling, coding/CDI, general ledger</span>
      <span className={delayed ? 'txt-off' : ''}>{delayed ? 'Clearinghouse feed delayed (last load Oct 6, 2026 3:30 AM)' : 'All sources loaded'}</span>
      <span>Period status: {periodStatus(period)}{periodStatus(period) === 'Preliminary' ? ` · closes ${ds.meta.availability[String(period.endMi + 1)] ?? ''}` : ''}</span>
      <span className="synthetic">Synthetic data · {DIMENSION_LABEL.facility} and payer figures are fictional</span>
    </footer>
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

export function StaleBanner() {
  const { sim, ds } = useApp();
  if (sim !== 'stale' && sim !== 'partial') return null;
  return (
    <div className={`banner ${sim === 'stale' ? 'banner-warn' : 'banner-info'}`} role="status">
      <Icon name="warn" size={14} />
      {sim === 'stale'
        ? <span><b>Data may be out of date.</b> The last successful refresh was {fmtDateTime('2026-10-06T11:00:00Z', ds.meta.displayTimeZone)} (more than 24 hours ago). The scheduled refresh on Oct 7 failed. Activity posted after Oct 5, 2026 is not yet included.</span>
        : <span><b>Partial data.</b> The claims clearinghouse feed is delayed. Denial, clean-claim and remittance measures may be incomplete after Oct 5, 2026. Other sources are current.</span>}
    </div>
  );
}
