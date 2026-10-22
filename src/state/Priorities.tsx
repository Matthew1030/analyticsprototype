// Release prioritization state (prototype only, not part of the design). Holds the facilitator's
// decisions and every visual seen so far. Saves to local storage on each change, so a page refresh
// keeps them; export to a file keeps them when the browser data is cleared or on another computer.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CAPABILITIES, effectiveTier, inRelease, KPI_ITEMS, pageItemId, parseFile, SEED, toCsv, toFile,
  type Decisions, type Preview, type PriorityItem, type Tier,
} from '../config/priorities';
import { PAGES, SECTIONS } from '../ui/Shell';
import { useApp } from './AppState';

const KEY = 'rcm-analytics-priorities-v1';

interface Stored { decisions: Decisions; seen: Record<string, PriorityItem>; on: boolean; preview: Preview; hide: boolean; dirty: boolean; exportedAt?: string }

interface PriorityState {
  on: boolean;
  setOn: (on: boolean) => void;
  preview: Preview;
  setPreview: (p: Preview) => void;
  /** Hide (instead of dim) items outside the previewed release. */
  hide: boolean;
  setHide: (h: boolean) => void;
  decisions: Decisions;
  setTier: (id: string, tier: Tier | undefined) => void;
  setNote: (id: string, note: string) => void;
  /** Every item: pages, visuals seen so far, KPIs and capabilities. */
  items: PriorityItem[];
  register: (item: PriorityItem) => void;
  /** Changes since the last export or import. */
  dirty: boolean;
  exportedAt?: string;
  /** False when the browser blocks local storage: then only an export keeps the decisions. */
  saved: boolean;
  exportFile: (kind: 'json' | 'csv') => void;
  importFile: (file: File) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<PriorityState | null>(null);

export function usePriorities(): PriorityState {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePriorities outside provider');
  return c;
}

function readStore(): Stored {
  const empty: Stored = { decisions: SEED, seen: {}, on: false, preview: 'all', hide: false, dirty: false };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return s ? { ...empty, ...s } : empty;
  } catch { return empty; }
}

// Built on first use: Shell imports this module, so PAGES is not ready when this module loads.
const pageItems = (): PriorityItem[] => PAGES.map((p) => ({
  id: pageItemId(p.id), kind: 'page', page: p.id, label: p.section === 'worklists' ? `${p.label} worklist` : p.label,
  group: SECTIONS.find((s) => s.id === p.section)!.label,
}));

export function PriorityProvider({ children }: { children: ReactNode }) {
  const { toast } = useApp();
  const [st, setSt] = useState<Stored>(readStore);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(st)); setSaved(true); } catch { setSaved(false); }
  }, [st]);

  // Warn before the tab closes or reloads with decisions that are not in an exported file.
  useEffect(() => {
    if (!st.dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [st.dirty]);

  const patch = useCallback((id: string, p: Partial<{ tier: Tier | undefined; note: string }>) => setSt((s) => {
    const cur = s.decisions[id] ?? { at: '' };
    const next = { ...cur, ...p, at: new Date().toISOString() };
    const decisions = { ...s.decisions };
    if (!next.tier && !next.note) delete decisions[id];
    else decisions[id] = next;
    return { ...s, decisions, dirty: true };
  }), []);

  const register = useCallback((item: PriorityItem) => setSt((s) => {
    const cur = s.seen[item.id];
    if (cur && cur.label === item.label && cur.group === item.group) return s;
    return { ...s, seen: { ...s.seen, [item.id]: item } };
  }), []);

  const items = useMemo(() => {
    const visuals = Object.values(st.seen).filter((v) => v.kind === 'visual');
    const order = Object.fromEntries(PAGES.map((p, i) => [p.id, i]));
    visuals.sort((a, b) => (order[a.page ?? ''] ?? 99) - (order[b.page ?? ''] ?? 99));
    // Items that only an imported file knows about (for example, visuals seen on another computer).
    const pages = pageItems();
    const known = new Set([...pages, ...KPI_ITEMS, ...CAPABILITIES].map((i) => i.id));
    const other = Object.values(st.seen).filter((v) => v.kind !== 'visual' && !known.has(v.id));
    return [...pages, ...visuals, ...KPI_ITEMS, ...CAPABILITIES, ...other];
  }, [st.seen]);

  const exportFile = useCallback((kind: 'json' | 'csv') => {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const text = kind === 'json' ? JSON.stringify(toFile(items, st.decisions, now.toISOString()), null, 2) : `﻿${toCsv(items, st.decisions)}`;
    const blob = new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `release-priorities-${stamp}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSt((s) => ({ ...s, dirty: false, exportedAt: now.toISOString() }));
    toast(`Exported ${items.length} items to ${a.download}.`);
  }, [items, st.decisions, toast]);

  const importFile = useCallback(async (file: File) => {
    try {
      const { decisions, items: got } = parseFile(await file.text());
      setSt((s) => ({
        ...s, decisions, dirty: false, exportedAt: undefined,
        seen: { ...s.seen, ...Object.fromEntries(got.filter((i) => i.kind === 'visual' || !s.seen[i.id]).map((i) => [i.id, i])) },
      }));
      toast(`Loaded ${Object.keys(decisions).length} decisions from ${file.name}.`);
    } catch (e) {
      toast(`Could not load ${file.name}: ${(e as Error).message}`);
    }
  }, [toast]);

  const value: PriorityState = {
    on: st.on, setOn: (on) => setSt((s) => ({ ...s, on })),
    preview: st.preview, setPreview: (preview) => setSt((s) => ({ ...s, preview })),
    hide: st.hide, setHide: (hide) => setSt((s) => ({ ...s, hide })),
    decisions: st.decisions,
    setTier: (id, tier) => patch(id, { tier }),
    setNote: (id, note) => patch(id, { note }),
    items, register, dirty: st.dirty, exportedAt: st.exportedAt, saved,
    exportFile, importFile,
    reset: () => setSt((s) => ({ ...s, decisions: SEED, dirty: false, exportedAt: undefined })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Registers one item and returns its rating and the class names that show it: a colored edge when
 * prioritization is on, and dim (or hidden) when it is outside the previewed release.
 */
export function usePriorityItem(item: PriorityItem) {
  const { register, decisions, on, preview } = usePriorities();
  const { id, kind, label, group, page } = item;
  useEffect(() => { register({ id, kind, label, group, ...(page ? { page } : {}) }); }, [register, id, kind, label, group, page]);
  const e = effectiveTier(item, decisions);
  const cls = [
    on ? `prio-item prio-${e.tier ?? 'unset'}` : '',
    inRelease(e.tier, preview) ? '' : 'prio-out',
  ].filter(Boolean).join(' ');
  return { ...e, cls };
}
