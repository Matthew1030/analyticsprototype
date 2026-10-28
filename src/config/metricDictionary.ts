// Metric dictionary (prototype only, not part of the design): one row per catalog metric with its
// code, plain-language calculation, target and the views where it appears, for export to Excel.
// The views are read from the page source files, so the dictionary follows the prototype as it
// changes: a metric id named in a page file (KPI strip, trend, breakdown, scorecard, measure
// switch, build annotation) puts the metric on that page.

import { FRAMEWORK_METRICS } from '../engine/framework';
import { METRIC_BY_ID, METRICS, type Direction, type MetricDef, type Unit } from '../engine/metrics';
import { staticTarget } from '../engine/status';
import { fmt } from '../format';
import { EXEC_KPIS } from '../pages/EnterpriseOverview';
import { STAGES } from '../pages/RevenueCycle';
import type { PageId } from '../state/AppState';

/** Page that each page source file renders on. Files not listed hold no metrics (worklists) or the catalog itself. */
export const FILE_PAGE: Record<string, PageId> = {
  EltSummary: 'executive', RevenueCycle: 'cycle', EnterpriseOverview: 'cycle', PatientAccess: 'access', MidCycle: 'midcycle',
  BillingDnfb: 'billing', Denials: 'denials', ArAnalytics: 'ar', Cash: 'cash', Payers: 'payers', Facilities: 'facilities',
  FacilityProfile: 'facility', AccountDetail: 'accounts',
};
/** Page source files with no metric views of their own. */
export const FILES_WITHOUT_VIEWS = ['Definitions', 'MetricAnalysis', 'MetricDictionary', 'Worklist'];

/** Views in display order, with drill-through pages marked. */
export const VIEW_ORDER: { page: PageId; label: string }[] = [
  { page: 'executive', label: 'ELT Summary' },
  { page: 'cycle', label: 'Revenue Cycle Overview' },
  { page: 'access', label: 'Patient Access' },
  { page: 'midcycle', label: 'Mid-Cycle' },
  { page: 'billing', label: 'Billing / DNFB' },
  { page: 'denials', label: 'Denials' },
  { page: 'ar', label: 'A/R' },
  { page: 'cash', label: 'Cash' },
  { page: 'payers', label: 'Payers' },
  { page: 'facilities', label: 'Facilities' },
  { page: 'facility', label: 'Hospital Profile (drill-through)' },
  { page: 'accounts', label: 'Account Detail (drill-through)' },
  { page: 'metric', label: 'Metric Analysis (drill-through)' },
];

const SOURCES = import.meta.glob<string>('../pages/*.tsx', { query: '?raw', import: 'default' });

export const fileName = (path: string) => path.replace(/^.*\//, '').replace(/\.tsx$/, '');

/**
 * Metric ids named in one source file: quoted ids and METRIC_BY_ID.<id>. A quoted id that is a
 * page id or a map value (go('cash'), page: 'cash', cash_pct_npsr: 'cash') is not a metric.
 */
export function metricIdsIn(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(/(['"])([a-z][a-z0-9_]*)\1/g)) {
    if (!METRIC_BY_ID[m[2]]) continue;
    const before = source.slice(Math.max(0, m.index - 40), m.index);
    if (/(\bgo\(|\bpage: ?|\b([a-z0-9_]+): ?)$/.test(before) && !/\b(id|metricId|metric): ?$/.test(before)) continue;
    out.add(m[2]);
  }
  for (const m of source.matchAll(/METRIC_BY_ID\.([a-z0-9_]+)/g)) if (METRIC_BY_ID[m[1]]) out.add(m[1]);
  return out;
}

/** Pages on which each metric appears, from the page sources (async: the sources load on demand). */
export async function loadMetricViews(sources: Record<string, () => Promise<string>> = SOURCES): Promise<Record<string, PageId[]>> {
  const on: Record<string, Set<PageId>> = Object.fromEntries(METRICS.map((m) => [m.id, new Set<PageId>()]));
  const add = (id: string, page: PageId) => on[id]?.add(page);
  await Promise.all(Object.entries(sources).map(async ([path, load]) => {
    const page = FILE_PAGE[fileName(path)];
    if (!page) return;
    for (const id of metricIdsIn(await load())) add(id, page);
  }));
  // Lists defined in another module.
  for (const f of FRAMEWORK_METRICS) add(f.id, 'executive');
  for (const id of [...EXEC_KPIS, ...STAGES.flatMap((s) => s.metrics)]) { add(id, 'cycle'); add(id, 'facility'); }
  // Metric Analysis has a selector over the whole catalog.
  for (const m of METRICS) add(m.id, 'metric');
  return Object.fromEntries(Object.entries(on).map(([id, s]) => [id, VIEW_ORDER.filter((v) => s.has(v.page)).map((v) => v.page)]));
}

// ---------------------------------------------------------------- rows and export

export const UNIT_LABEL: Record<Unit, string> = { pct: '%', days: 'Days', usd: '$', count: 'Count', sec: 'Seconds', ratio: 'Ratio' };
export const DIRECTION_LABEL: Record<Direction, string> = { up: 'Higher is better', down: 'Lower is better', none: 'No direction' };

export interface DictionaryRow {
  code: string;
  name: string;
  area: string;
  definition: string;
  formula: string;
  unit: string;
  direction: string;
  target: string;
  type: string;
  recency: string;
  views: string;
  id: string;
}

export function targetText(m: MetricDef): string {
  if (m.target) return 'Calculated (cash goal)';
  const t = staticTarget(m.id);
  return t === null ? '' : fmt(t, m.unit, m.digits);
}

const VIEW_LABEL = Object.fromEntries(VIEW_ORDER.map((v) => [v.page, v.label])) as Record<PageId, string>;

/** One row per metric, in code order. */
export function dictionaryRows(views: Record<string, PageId[]>): DictionaryRow[] {
  return [...METRICS].sort((a, b) => a.code.localeCompare(b.code)).map((m) => ({
    code: m.code,
    name: m.name,
    area: m.area,
    definition: m.definition,
    formula: m.formula,
    unit: UNIT_LABEL[m.unit],
    direction: DIRECTION_LABEL[m.direction],
    target: targetText(m),
    type: m.type === 'balance' ? 'Balance' : 'Flow',
    recency: m.recency ?? '',
    views: (views[m.id] ?? []).map((p) => VIEW_LABEL[p]).join('; '),
    id: m.id,
  }));
}

export const DICTIONARY_COLUMNS: { key: keyof DictionaryRow; label: string }[] = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Metric' },
  { key: 'area', label: 'RCM category' },
  { key: 'definition', label: 'Definition' },
  { key: 'formula', label: 'Calculation' },
  { key: 'unit', label: 'Unit' },
  { key: 'direction', label: 'Direction' },
  { key: 'target', label: 'Target' },
  { key: 'type', label: 'Flow / balance' },
  { key: 'recency', label: 'Time recency (H/D/W/M/Y)' },
  { key: 'views', label: 'Views' },
  { key: 'id', label: 'Catalog ID' },
];

/** CSV for Excel: one header row, then one row per metric (UTF-8 with BOM, so Excel reads − and ×). */
export function dictionaryCsv(rows: DictionaryRow[]): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return `﻿${[DICTIONARY_COLUMNS.map((c) => q(c.label)), ...rows.map((r) => DICTIONARY_COLUMNS.map((c) => q(r[c.key])))].map((r) => r.join(',')).join('\r\n')}`;
}
