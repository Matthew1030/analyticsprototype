// Global workspace state: data, engine, filters, period, comparison, navigation and
// prototype-only simulation switches. Filters are global, so they stay in place when the
// user changes pages or drills through. They persist in local storage between visits.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Dataset } from '../data/model';
import { Engine, FIELD_LABEL, type SelField, type Selections } from '../engine/engine';
import { availablePeriods, makePeriod, quarterOfMonth, type CompareMode, type Period, type PeriodKind } from '../engine/periods';
import { memberLabel } from '../services/analytics';
import type { RcmArea } from '../engine/metrics';
import { V1_PAGES, type Version } from '../config/v1';

export type PageId =
  | 'executive' | 'cycle' | 'ar' | 'denials' | 'cash' | 'access' | 'midcycle' | 'billing' | 'payers' | 'facilities'
  | 'definitions' | 'metric' | 'facility' | 'accounts'
  | 'wl-denials' | 'wl-ar' | 'wl-dnfb'
  | 'dictionary';

/** Changes a user makes to a work item (prototype: kept in this browser only). */
export interface WorkEdit { assignee?: string | null; status?: string; notes?: { at: string; text: string }[] }

export interface Route { page: PageId; params: Record<string, string> }

/** Prototype-only switch that shows the non-happy-path states. */
export type SimState = 'normal' | 'loading' | 'stale' | 'partial' | 'error' | 'empty';

/** Prototype-only switch for the type of viewer. Both types see the same view for now. */
export type Audience = 'internal' | 'external';

export interface ExportTable { title: string; columns: string[]; rows: (string | number)[][] }

interface AppState {
  ds: Dataset;
  engine: Engine;
  sel: Selections;
  period: Period;
  compare: CompareMode;
  route: Route;
  trail: Route[];
  sim: SimState;
  specMode: boolean;
  audience: Audience;
  setAudience: (a: Audience) => void;
  /** Prototype-only release switch: v1 (default) or the full concept. Kept in the URL (?v=full). */
  version: Version;
  setVersion: (v: Version) => void;
  /** RCM area filter: limits which metrics appear in scorecards and the catalog. */
  areas: RcmArea[];
  setAreas: (a: RcmArea[]) => void;
  paneOpen: boolean;
  go: (page: PageId, params?: Record<string, string>, opts?: { drill?: boolean }) => void;
  /** Changes the current page's params (e.g. the open tab) in place: no new history entry, no breadcrumb. */
  setParams: (params: Record<string, string>) => void;
  back: () => void;
  setPeriod: (kind: PeriodKind, key: number) => void;
  setPeriodKind: (kind: PeriodKind) => void;
  setCompare: (c: CompareMode) => void;
  toggle: (field: SelField, key: number) => void;
  selectOnly: (field: SelField, keys: number[]) => void;
  clearField: (field: SelField) => void;
  clearAll: () => void;
  setSim: (s: SimState) => void;
  setSpecMode: (on: boolean) => void;
  setPaneOpen: (on: boolean) => void;
  toast: (msg: string) => void;
  toasts: { id: number; msg: string }[];
  valueLabel: (field: SelField, key: number) => string;
  periodStatus: (p: Period) => 'Preliminary' | 'Closed';
  /** Worklist edits by item id. */
  workEdits: Record<string, WorkEdit>;
  editWork: (ids: string[], patch: WorkEdit) => void;
}

const Ctx = createContext<AppState | null>(null);
const STORE_KEY = 'rcm-analytics-workspace-v2';
const WORK_KEY = 'rcm-analytics-worklist-edits-v1';

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

function parseHash(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(query ?? ''));
  const page = (parts[0] || 'executive') as PageId;
  if (parts[1]) params.id = decodeURIComponent(parts[1]);
  return { page, params };
}

/** Version from the URL query: "?v=full" shows the full concept; anything else shows v1. */
function readVersion(): Version {
  try { return new URLSearchParams(location.search).get('v') === 'full' ? 'full' : 'v1'; } catch { return 'v1'; }
}

/** In v1, a page that is not in v1 opens the ELT Summary. */
function allowed(r: Route, v: Version): Route {
  return v === 'v1' && !V1_PAGES.includes(r.page) ? { page: 'executive', params: {} } : r;
}

function toHash(r: Route): string {
  const { id, ...rest } = r.params;
  const q = new URLSearchParams(rest).toString();
  return `#/${r.page}${id !== undefined ? `/${encodeURIComponent(id)}` : ''}${q ? `?${q}` : ''}`;
}

interface Stored { sel?: Selections; kind?: PeriodKind; key?: number; compare?: CompareMode; paneOpen?: boolean }
function readStore(): Stored {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Stored; } catch { return {}; }
}

export function AppProvider({ ds, children }: { ds: Dataset; children: ReactNode }) {
  const engine = useMemo(() => new Engine(ds), [ds]);
  const stored = useMemo(readStore, []);
  const validPeriod = (k?: PeriodKind, key?: number) => {
    if (!k || key === undefined) return null;
    return availablePeriods(k, ds.meta.windowStartMonth, ds.meta.endMonth).find((p) => p.key === key) ?? null;
  };
  const [sel, setSel] = useState<Selections>(() => (readVersion() === 'v1' ? { ...stored.sel, payer: [], patientType: [], serviceLine: [], rootCause: [] } : stored.sel ?? {}));
  const [period, setPeriodState] = useState<Period>(validPeriod(stored.kind, stored.key) ?? makePeriod('month', ds.meta.endMonth));
  const [compare, setCompare] = useState<CompareMode>(stored.compare ?? 'prior');
  const [version, setVersionState] = useState<Version>(readVersion);
  const versionRef = useRef(version);
  versionRef.current = version;
  const [route, setRouteRaw] = useState<Route>(() => allowed(parseHash(), readVersion()));
  const setRoute = useCallback((r: Route) => setRouteRaw(allowed(r, versionRef.current)), []);
  // A link to a page that is not in v1 opened the ELT Summary: show that in the address bar too.
  useEffect(() => { if (location.hash && location.hash !== toHash(route)) history.replaceState(null, '', toHash(route)); }, [route]);
  const [trail, setTrail] = useState<Route[]>([]);
  const [sim, setSim] = useState<SimState>('normal');
  const [specMode, setSpecMode] = useState(false);
  const [audience, setAudience] = useState<Audience>('internal');
  const [areas, setAreas] = useState<RcmArea[]>([]);
  const [paneOpen, setPaneOpen] = useState(stored.paneOpen ?? true);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [workEdits, setWorkEdits] = useState<Record<string, WorkEdit>>(() => {
    try { return JSON.parse(localStorage.getItem(WORK_KEY) ?? '{}') as Record<string, WorkEdit>; } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(WORK_KEY, JSON.stringify(workEdits)); } catch { /* storage blocked: edits last for the session */ }
  }, [workEdits]);

  const editWork = useCallback((ids: string[], patch: WorkEdit) => setWorkEdits((w) => {
    const next = { ...w };
    for (const id of ids) {
      const cur = next[id] ?? {};
      next[id] = { ...cur, ...patch, notes: patch.notes ? [...(cur.notes ?? []), ...patch.notes] : cur.notes };
    }
    return next;
  }), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ sel, kind: period.kind, key: period.key, compare, paneOpen }));
    } catch { /* storage may be blocked; filters then last for the session only */ }
  }, [sel, period, compare, paneOpen]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash); };
  }, [setRoute]);

  const setVersion = useCallback((v: Version) => {
    setVersionState(v);
    versionRef.current = v;
    const url = new URL(location.href);
    if (v === 'full') url.searchParams.set('v', 'full'); else url.searchParams.delete('v');
    const next = allowed(routeRef.current, v);
    url.hash = toHash(next);
    history.replaceState(null, '', url.toString());
    setTrail([]);
    setRouteRaw(next);
    // v1 has no slicer for these fields, so a value kept from the full concept could not be cleared.
    if (v === 'v1') { setSel((x) => ({ ...x, payer: [], patientType: [], serviceLine: [], rootCause: [] })); setAreas([]); }
  }, []);

  const routeRef = useRef(route);
  routeRef.current = route;
  const trailRef = useRef(trail);
  trailRef.current = trail;

  const go = useCallback((page: PageId, params: Record<string, string> = {}, opts: { drill?: boolean } = {}) => {
    const next = allowed({ page, params }, versionRef.current);
    setTrail(opts.drill ? [...trailRef.current, routeRef.current].slice(-8) : []);
    setRoute(next);
    const h = toHash(next);
    if (location.hash !== h) history.pushState(null, '', h);
    window.scrollTo({ top: 0 });
  }, [setRoute]);

  const setParams = useCallback((params: Record<string, string>) => {
    const next = { page: routeRef.current.page, params };
    setRoute(next);
    history.replaceState(null, '', toHash(next));
  }, []);

  const back = useCallback(() => {
    const t = trailRef.current;
    const prev = t[t.length - 1];
    if (!prev) return;
    setTrail(t.slice(0, -1));
    setRoute(prev);
    history.pushState(null, '', toHash(prev));
  }, [setRoute]);

  const toggle = useCallback((field: SelField, key: number) => {
    setSel((s) => {
      const cur = s[field] ?? [];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key].sort((a, b) => a - b);
      return { ...s, [field]: next };
    });
  }, []);
  const selectOnly = useCallback((field: SelField, keys: number[]) => setSel((s) => ({ ...s, [field]: [...keys].sort((a, b) => a - b) })), []);
  const clearField = useCallback((field: SelField) => setSel((s) => ({ ...s, [field]: [] })), []);
  const clearAll = useCallback(() => { setSel({}); setAreas([]); }, []);

  const setPeriod = useCallback((kind: PeriodKind, key: number) => setPeriodState(makePeriod(kind, key)), []);
  const setPeriodKind = useCallback((kind: PeriodKind) => {
    setPeriodState((p) => {
      if (p.kind === kind) return p;
      const list = availablePeriods(kind, ds.meta.windowStartMonth, ds.meta.endMonth);
      if (kind === 'quarter') {
        const q = quarterOfMonth(p.endMi);
        return list.find((x) => x.key <= q) ?? list[0];
      }
      return list.find((x) => x.endMi <= p.endMi) ?? list[0];
    });
  }, [ds.meta.endMonth, ds.meta.windowStartMonth]);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const valueLabel = useCallback((field: SelField, key: number) => memberLabel(ds, field, key), [ds]);
  const periodStatus = useCallback((p: Period) =>
    (p.endMi > ds.meta.endMonth - ds.meta.preliminaryMonths ? 'Preliminary' : 'Closed') as 'Preliminary' | 'Closed', [ds]);

  const value: AppState = {
    ds, engine, sel, period, compare, route, trail, sim, specMode, audience, setAudience, version, setVersion, paneOpen, areas, setAreas,
    go, setParams, back, setPeriod, setPeriodKind, setCompare, toggle, selectOnly, clearField, clearAll,
    setSim, setSpecMode, setPaneOpen, toast, toasts, valueLabel, periodStatus, workEdits, editWork,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Text for the scope part of the header. */
export function scopeText(sel: Selections, label: (f: SelField, k: number) => string, orgName: string, total: number): string {
  const f = sel.facility ?? [];
  const r = sel.region ?? [];
  if (f.length === 1) return label('facility', f[0]);
  if (f.length > 1) return `${f.length} of ${total} hospitals`;
  if (r.length === 1) return `${orgName} · ${label('region', r[0])}`;
  return `${orgName} · All hospitals`;
}

export { FIELD_LABEL };
