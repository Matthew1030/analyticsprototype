// Release prioritization controls (prototype only, not part of the design): the release picker on
// each item, the facilitator dock and the summary drawer with the page rollup, notes and export.

import { useMemo, useRef, useState } from 'react';
import {
  countTiers, effectiveTier, KIND_LABEL, pageItemId, TIERS, type Counts, type ItemKind, type Preview, type PriorityItem, type Tier,
} from '../config/priorities';
import type { SelField } from '../engine/engine';
import { useApp, type PageId } from '../state/AppState';
import { usePriorities } from '../state/Priorities';
import { Icon } from './icons';
import { PAGE_BY_ID, PAGES } from './Shell';

/** Four-way release picker. A second click on the current release clears it. `compact` is a drop-down for narrow tables. */
export function PriorityPicker({ id, label, tier, inherited = false, compact = false }: { id: string; label: string; tier?: Tier; inherited?: boolean; compact?: boolean }) {
  const { setTier } = usePriorities();
  if (compact) {
    return (
      <select className={`prio-select no-print ${tier ? `prio-opt-${tier} on` : ''}`} value={tier ?? ''} aria-label={`Release for ${label}`}
        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setTier(id, (e.target.value || undefined) as Tier | undefined)}>
        <option value="">Unset</option>
        {TIERS.map((t) => <option key={t.v} value={t.v} title={`${t.moscow}: ${t.release}`}>{t.short}</option>)}
      </select>
    );
  }
  return (
    <span className="prio-pick no-print" role="radiogroup" aria-label={`Release for ${label}`} onClick={(e) => e.stopPropagation()}>
      {TIERS.map((t) => {
        const on = tier === t.v;
        return (
          <button key={t.v} type="button" role="radio" aria-checked={on && !inherited}
            className={`prio-opt prio-opt-${t.v} ${on ? (inherited ? 'inh' : 'on') : ''}`}
            title={`${t.moscow}: ${t.release}${on && inherited ? ' (from the page rating; click to set it on this item)' : on ? ' (click again to clear)' : ''}`}
            onClick={() => setTier(id, on && !inherited ? undefined : t.v)}>{t.short}</button>
        );
      })}
    </span>
  );
}

/** Prototype bar switch. */
export function PriorityToggle() {
  const { on, setOn, dirty, preview } = usePriorities();
  const shown = PREVIEWS.find((x) => x.v === preview)!;
  return (
    <button type="button" className={`proto-btn ${on || preview !== 'all' ? 'on' : ''}`} aria-pressed={on} onClick={() => setOn(!on)}
      title={`Put each page, visual, KPI and capability into a release (v1 MVP, v2, v3+ or Won't)${dirty ? '. Some changes are not exported.' : ''}`}>
      <Icon name="bookmark" size={12} /> Prioritize{preview !== 'all' ? `: ${shown.label} preview` : ''}{dirty ? ' •' : ''}
    </button>
  );
}

const PREVIEWS: { v: Preview; label: string }[] = [
  { v: 'all', label: 'All' }, { v: 'v1', label: 'v1' }, { v: 'v2', label: 'v1–v2' }, { v: 'v3', label: 'v1–v3+' },
];

/** Floating facilitator dock: page rating, release preview, totals, summary and export. */
export function PriorityDock() {
  const p = usePriorities();
  const { route } = useApp();
  const [open, setOpen] = useState(false);
  if (!p.on) return null;
  const page = PAGE_BY_ID[route.page];
  const rated = p.items.filter((i) => i.kind !== 'page');
  const c = countTiers(rated, p.decisions);
  return (
    <>
      <div className="prio-dock no-print" role="region" aria-label="Release prioritization (prototype only)">
        <span className="prio-dock-title">Release priorities</span>
        <span className="prio-dock-group">
          <span className="prio-dock-label" title="A visual with no rating of its own takes this rating">This page{page ? ` (${page.label})` : ''}:</span>
          <PriorityPicker id={pageItemId(route.page)} label={page?.label ?? route.page} tier={p.decisions[pageItemId(route.page)]?.tier} />
        </span>
        <span className="prio-dock-group">
          <span className="prio-dock-label">Preview release:</span>
          <span className="seg prio-seg" role="radiogroup" aria-label="Preview release">
            {PREVIEWS.map((x) => (
              <button key={x.v} type="button" role="radio" aria-checked={p.preview === x.v} className={p.preview === x.v ? 'on' : ''} onClick={() => p.setPreview(x.v)}>{x.label}</button>
            ))}
          </span>
          <label className="prio-check" title="Hide items outside the release instead of dimming them">
            <input type="checkbox" checked={p.hide} onChange={(e) => p.setHide(e.target.checked)} /> Hide others
          </label>
        </span>
        <CountChips c={c} />
        <span className="prio-dock-group prio-dock-actions">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}><Icon name="table" size={12} /> Summary</button>
          <button type="button" className="btn btn-sm" onClick={() => p.exportFile('json')} title="Download all decisions and notes. Load the file again with Summary › Load file."><Icon name="download" size={12} /> Export</button>
          <SaveState />
        </span>
      </div>
      {open && <PrioritySummary onClose={() => setOpen(false)} />}
    </>
  );
}

function CountChips({ c }: { c: Counts }) {
  return (
    <span className="prio-counts" aria-label="Items per release">
      {TIERS.map((t) => <span key={t.v} className={`prio-count prio-opt-${t.v}`} title={`${t.moscow}: ${t.release}`}>{t.short} <b>{c[t.v]}</b></span>)}
      <span className="prio-count prio-count-unset" title="No release yet">Unset <b>{c.unset}</b></span>
    </span>
  );
}

function SaveState() {
  const { dirty, exportedAt, saved } = usePriorities();
  if (!saved) return <span className="prio-save warn" title="This browser blocks local storage. A refresh loses the decisions.">Not saved in browser: export now</span>;
  if (dirty) return <span className="prio-save warn" title="Saved in this browser. Export to keep a copy outside the browser.">Changes not exported</span>;
  return <span className="prio-save">{exportedAt ? `Exported ${new Date(exportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Saved in browser'}</span>;
}

// ---------------------------------------------------------------- summary drawer

type View = 'rollup' | 'visual' | 'kpi' | 'capability';
const VIEWS: { v: View; label: string }[] = [
  { v: 'rollup', label: 'Page rollup' }, { v: 'visual', label: 'Pages and visuals' }, { v: 'kpi', label: 'KPIs' }, { v: 'capability', label: 'Capabilities' },
];

export function PrioritySummary({ onClose }: { onClose: () => void }) {
  const p = usePriorities();
  const [view, setView] = useState<View>('rollup');
  const [show, setShow] = useState<Tier | 'unset' | 'all'>('all');
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (f: File | undefined) => {
    if (!f) return;
    if (p.dirty && !window.confirm('Loading a file replaces the current decisions, and some are not exported. Continue?')) return;
    void p.importFile(f);
  };

  return (
    <div className="prio-drawer-wrap no-print" role="dialog" aria-modal="true" aria-label="Release priorities summary">
      <div className="prio-drawer-backdrop" onClick={onClose} />
      <aside className="prio-drawer">
        <header className="prio-drawer-head">
          <div>
            <h2>Release priorities</h2>
            <p className="muted small">Prototype only. Must = v1 (MVP), Should = v2, Could = v3+, Won't = not planned. A visual with no rating takes its page's rating.</p>
          </div>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="prio-drawer-bar">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => p.exportFile('json')} title="All items, decisions and notes. Load it again with Load file."><Icon name="download" size={12} /> Export (JSON)</button>
          <button type="button" className="btn btn-sm" onClick={() => p.exportFile('csv')} title="For Excel. Load file also reads this CSV."><Icon name="download" size={12} /> Export (CSV)</button>
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>Load file…</button>
          <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn btn-sm" onClick={() => {
            if (window.confirm('Clear all decisions and notes? The worklists go back to v2. Export first if you need a copy.')) p.reset();
          }}>Reset</button>
          <SaveState />
        </div>
        <div className="subtabs" role="tablist">
          {VIEWS.map((x) => <button key={x.v} type="button" role="tab" aria-selected={view === x.v} className={view === x.v ? 'on' : ''} onClick={() => setView(x.v)}>{x.label}</button>)}
        </div>
        {view === 'rollup' ? <Rollup /> : (
          <>
            <div className="prio-filter">
              <select className="sel-xs" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
                <option value="all">All releases</option>
                {TIERS.map((t) => <option key={t.v} value={t.v}>{t.moscow} ({t.release})</option>)}
                <option value="unset">Unset</option>
              </select>
              <input className="prio-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search items" />
            </div>
            <ItemList kinds={view === 'visual' ? ['page', 'visual'] : [view]} show={show} q={q} />
          </>
        )}
      </aside>
    </div>
  );
}

function ItemList({ kinds, show, q }: { kinds: ItemKind[]; show: Tier | 'unset' | 'all'; q: string }) {
  const { items, decisions, setNote } = usePriorities();
  const groups = useMemo(() => {
    const list = items.filter((i) => kinds.includes(i.kind)).filter((i) => {
      const t = effectiveTier(i, decisions).tier;
      return (show === 'all' || (t ?? 'unset') === show) && (!q || `${i.label} ${i.group}`.toLowerCase().includes(q.toLowerCase()));
    });
    // Pages and their visuals together: each page first, then its visuals.
    const key = (i: PriorityItem) => (i.kind === 'page' || i.kind === 'visual' ? PAGE_BY_ID[i.page as PageId]?.label ?? i.group : i.group);
    const m = new Map<string, PriorityItem[]>();
    for (const i of list) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
    return [...m];
  }, [items, decisions, kinds, show, q]);
  if (!groups.length) return <p className="muted small prio-empty">No items match.</p>;
  return (
    <div className="prio-list">
      {groups.map(([g, list]) => (
        <section key={g}>
          <h3>{g}</h3>
          {list.map((i) => {
            const e = effectiveTier(i, decisions);
            return (
              <div key={i.id} className={`prio-row prio-row-${i.kind}`}>
                <span className="prio-row-label"><span className="prio-kind">{KIND_LABEL[i.kind]}</span>{i.label}</span>
                <PriorityPicker id={i.id} label={i.label} tier={e.tier} inherited={e.inherited} />
                <input key={decisions[i.id]?.note ?? ''} className="prio-note" placeholder="Note (optional)" aria-label={`Note for ${i.label}`}
                  defaultValue={decisions[i.id]?.note ?? ''} onBlur={(ev) => { if (ev.target.value !== (decisions[i.id]?.note ?? '')) setNote(i.id, ev.target.value); }} />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function Rollup() {
  const { items, decisions } = usePriorities();
  const { go, sel, areas, clearAll, selectOnly, setAreas } = useApp();
  const [walking, setWalking] = useState(false);
  const pages = PAGES.filter((pg) => pg.nav || pg.id === 'metric' || pg.id === 'facility');
  const visualsOf = (id: string) => items.filter((i) => i.kind === 'visual' && i.page === id);
  const groupRows = (kind: ItemKind) => {
    const m = new Map<string, PriorityItem[]>();
    for (const i of items.filter((x) => x.kind === kind)) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m];
  };
  const allVisuals = items.filter((i) => i.kind === 'visual');
  const { ds, route } = useApp();

  // Opens each page for a moment so that its visuals are listed. Visuals behind a sub-tab or a
  // switch on a page are listed only after someone opens them.
  const walk = async () => {
    setWalking(true);
    const back = route;
    const stops: [PageId, Record<string, string>][] = [
      ...pages.filter((pg) => pg.nav && pg.section !== 'worklists').map((pg) => [pg.id, {}] as [PageId, Record<string, string>]),
      ['metric', { id: 'gross_ar_days' }], ['facility', { id: String(ds.dims.facilities[0].key) }],
    ];
    const keep = { sel, areas };
    for (const [id, params] of stops) { go(id, params); await new Promise((r) => setTimeout(r, 450)); }
    // The hospital profile filters to its hospital: put the filters back as they were.
    clearAll();
    for (const [f, keys] of Object.entries(keep.sel)) if (keys?.length) selectOnly(f as SelField, keys);
    setAreas(keep.areas);
    go(back.page, back.params);
    setWalking(false);
  };

  return (
    <div className="prio-rollup">
      <table className="grid compact prio-table">
        <thead><tr><th>Page</th><th>Page rating</th>{TIERS.map((t) => <th key={t.v} className="num">{t.short}</th>)}<th className="num">Unset</th><th className="num">Visuals</th></tr></thead>
        <tbody>
          {pages.map((pg) => {
            const vs = visualsOf(pg.id);
            const c = countTiers(vs, decisions);
            const id = pageItemId(pg.id);
            return (
              <tr key={pg.id}>
                <td>{pg.section === 'worklists' ? `${pg.label} worklist` : pg.label}{!pg.nav && <span className="muted small"> (template)</span>}</td>
                <td><PriorityPicker id={id} label={pg.label} tier={decisions[id]?.tier} /></td>
                <CountCells c={c} />
                <td className="num">{vs.length || <span className="muted small">{pg.section === 'worklists' ? 'none' : 'not opened'}</span>}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><td colSpan={2}><b>All visuals</b></td><CountCells c={countTiers(allVisuals, decisions)} /><td className="num"><b>{allVisuals.length}</b></td></tr></tfoot>
      </table>
      <p className="muted small">
        Visual counts include only the visuals opened so far (or loaded from a file).{' '}
        <button type="button" className="link" disabled={walking} onClick={() => void walk()}>{walking ? 'Opening pages…' : 'Open every page once to list all visuals'}</button>
      </p>
      {(['kpi', 'capability'] as const).map((kind) => {
        const rows = groupRows(kind);
        const all = items.filter((i) => i.kind === kind);
        return (
          <table key={kind} className="grid compact prio-table">
            <thead><tr><th colSpan={2}>{kind === 'kpi' ? 'KPI group' : 'Capability group'}</th>{TIERS.map((t) => <th key={t.v} className="num">{t.short}</th>)}<th className="num">Unset</th><th className="num">Items</th></tr></thead>
            <tbody>
              {rows.map(([g, list]) => (
                <tr key={g}><td colSpan={2}>{g}</td><CountCells c={countTiers(list, decisions)} /><td className="num">{list.length}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}><b>All {kind === 'kpi' ? 'KPIs' : 'capabilities'}</b></td><CountCells c={countTiers(all, decisions)} /><td className="num"><b>{all.length}</b></td></tr></tfoot>
          </table>
        );
      })}
    </div>
  );
}

function CountCells({ c }: { c: Counts }) {
  return (
    <>
      {TIERS.map((t) => <td key={t.v} className={`num ${c[t.v] ? `prio-num prio-opt-${t.v}` : 'muted'}`}>{c[t.v] || '–'}</td>)}
      <td className="num muted">{c.unset || '–'}</td>
    </>
  );
}
