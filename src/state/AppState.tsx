// Global state: data, engine, associative selections, period, page, export and toasts.
// Selections live here, so they stay in place when the user changes pages.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Dataset } from '../data/model';
import { Engine, FIELD_LABEL, type SelField, type Selections } from '../engine/engine';
import { makePeriod, monthPeriod, quarterOfMonth, type Period, type PeriodKind } from '../engine/periods';

export type PageId = 'scorecard' | 'operational' | 'change' | 'dnfb' | 'claims' | 'ar' | 'claimlist';

export interface ExportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

interface AppState {
  ds: Dataset;
  engine: Engine;
  user: string;
  sel: Selections;
  period: Period;
  page: PageId;
  claimListEnabled: boolean;
  setPage: (p: PageId) => void;
  setPeriod: (kind: PeriodKind, key: number) => void;
  setPeriodKind: (kind: PeriodKind) => void;
  toggle: (field: SelField, key: number) => void;
  selectOnly: (field: SelField, keys: number[]) => void;
  clearField: (field: SelField) => void;
  clearAll: () => void;
  setClaimListEnabled: (on: boolean) => void;
  registerExport: (t: ExportTable | null) => void;
  getExport: () => ExportTable | null;
  toast: (msg: string) => void;
  toasts: { id: number; msg: string }[];
  valueLabel: (field: SelField, key: number) => string;
  periodStatus: (p: Period) => 'Preliminary' | 'Closed';
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ ds, user, children }: { ds: Dataset; user: string; children: ReactNode }) {
  const engine = useMemo(() => new Engine(ds), [ds]);
  const [sel, setSel] = useState<Selections>({});
  const [period, setPeriodState] = useState<Period>(monthPeriod(ds.meta.endMonth));
  const [page, setPage] = useState<PageId>('scorecard');
  const [claimListEnabled, setClaimListEnabledState] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const exportRef = useRef<ExportTable | null>(null);

  const toggle = useCallback((field: SelField, key: number) => {
    setSel((s) => {
      const cur = s[field] ?? [];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key].sort((a, b) => a - b);
      return { ...s, [field]: next };
    });
  }, []);
  const selectOnly = useCallback((field: SelField, keys: number[]) => setSel((s) => ({ ...s, [field]: [...keys].sort((a, b) => a - b) })), []);
  const clearField = useCallback((field: SelField) => setSel((s) => ({ ...s, [field]: [] })), []);
  const clearAll = useCallback(() => setSel({}), []);

  const setPeriod = useCallback((kind: PeriodKind, key: number) => setPeriodState(makePeriod(kind, key)), []);
  const setPeriodKind = useCallback((kind: PeriodKind) => {
    setPeriodState((p) => {
      if (p.kind === kind) return p;
      if (kind === 'quarter') {
        let q = quarterOfMonth(p.endMi);
        // Only complete quarters inside the data window.
        while (makePeriod('quarter', q).endMi > ds.meta.endMonth) q--;
        return makePeriod('quarter', q);
      }
      return monthPeriod(p.endMi);
    });
  }, [ds.meta.endMonth]);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const valueLabel = useCallback((field: SelField, key: number): string => {
    const d = ds.dims;
    switch (field) {
      case 'facility': return d.facilities[key]?.name ?? String(key);
      case 'payer': return d.payers[key]?.name ?? String(key);
      case 'financialClass': return d.financialClasses[key] ?? String(key);
      case 'serviceLine': return d.serviceLines[key]?.name ?? String(key);
      case 'denialCategory': return d.denialCategories[key] ?? String(key);
      case 'editCategory': return d.editCategories[key]?.name ?? String(key);
      case 'writeOffReason': return d.writeOffReasons[key]?.name ?? String(key);
      case 'dnfbHold': return d.dnfbHolds[key]?.name ?? String(key);
      case 'arAge': return d.arAge[key]?.name ?? String(key);
    }
  }, [ds]);

  const periodStatus = useCallback((p: Period) =>
    (p.endMi > ds.meta.endMonth - ds.meta.preliminaryMonths ? 'Preliminary' : 'Closed') as 'Preliminary' | 'Closed', [ds]);

  const value: AppState = {
    ds, engine, user, sel, period, page, claimListEnabled,
    setPage, setPeriod, setPeriodKind, toggle, selectOnly, clearField, clearAll,
    setClaimListEnabled: (on) => { setClaimListEnabledState(on); if (!on && page === 'claimlist') setPage('scorecard'); },
    registerExport: (t) => { exportRef.current = t; },
    getExport: () => exportRef.current,
    toast, toasts, valueLabel, periodStatus,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Text for the facility part of the header. */
export function facilityText(sel: Selections, label: (f: SelField, k: number) => string, total: number): string {
  const f = sel.facility ?? [];
  if (f.length === 0 || f.length === total) return `All facilities (${total})`;
  if (f.length <= 3) return f.map((k) => label('facility', k)).join(', ');
  return `${f.length} of ${total} facilities`;
}

export { FIELD_LABEL };
