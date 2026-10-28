// Release prioritization (prototype only, not part of the design). A facilitator walks business
// leaders through the prototype and puts each page, visual, KPI and product capability into a
// release: Must (v1, MVP), Should (v2), Could (v3+) or Won't. This module is the pure model: the
// items that do not depend on what is on screen, the rules, and the export / import file formats.

import { KPI_COVERAGE } from './kpiCoverage';
import { FRAMEWORK, LEGACY_FRAMEWORK_CODE } from '../engine/framework';
import { METRIC_BY_ID } from '../engine/metrics';

export type Tier = 'v1' | 'v2' | 'v3' | 'wont';

export const TIERS: { v: Tier; short: string; release: string; moscow: string }[] = [
  { v: 'v1', short: 'v1', release: 'v1 (MVP)', moscow: 'Must' },
  { v: 'v2', short: 'v2', release: 'v2', moscow: 'Should' },
  { v: 'v3', short: 'v3+', release: 'v3+', moscow: 'Could' },
  { v: 'wont', short: "Won't", release: 'Not planned', moscow: "Won't" },
];
export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.v, t])) as Record<Tier, (typeof TIERS)[number]>;
const RANK: Record<Tier, number> = { v1: 1, v2: 2, v3: 3, wont: 9 };

export type ItemKind = 'page' | 'visual' | 'kpi' | 'capability';
export const KIND_LABEL: Record<ItemKind, string> = { page: 'Page', visual: 'Visual', kpi: 'KPI', capability: 'Capability' };

export interface PriorityItem {
  id: string;
  kind: ItemKind;
  label: string;
  /** Page label, KPI group or capability group. */
  group: string;
  /** Page the item sits on (pages and visuals). A visual with no rating takes its page's rating. */
  page?: string;
}

export interface Decision { tier?: Tier; note?: string; at: string }
export type Decisions = Record<string, Decision>;

/** Preview a release: 'all' shows everything; otherwise only items in that release or earlier. */
export type Preview = 'all' | 'v1' | 'v2' | 'v3';

export const pageItemId = (page: string) => `page:${page}`;
export const visualItemId = (page: string, key: string) => `visual:${page}:${key}`;
/** ELT framework metric, by catalog metric id. */
export const eltItemId = (metricId: string) => `kpi:elt:${metricId}`;

/**
 * Visuals renamed to the Metric Dictionary names (page, former title, current title). Visual
 * items are keyed by title, so ratings saved under a former title move to the current one.
 */
export const LEGACY_VISUAL_TITLE: [string, string, string][] = [
  ['ar', 'Credit balances by payer', 'Credit balances $ by payer'],
  ['ar', 'Credit balances trend', 'Credit balances ($) trend'],
  ['billing', 'Claims exported to payers by hospital', 'Submitted $ by hospital'],
  ['billing', 'Billed, not exported (open edits) by hospital', 'DNSP $ by hospital'],
  ['cash', 'Collections by payer', 'Cash collections by payer'],
  ['cash', 'Cash % NPSR by hospital', 'Cash % net rev by hospital'],
  ['cash', 'Cash by financial class', 'Cash collections by financial class'],
  ['cash', 'Contractual adjustments by financial class', 'Contractual adj. $ by financial class'],
  ['cash', 'Cash vs goal by hospital: month and year to date', 'Cash collections vs cash goal by hospital: month and year to date'],
  ['cycle', 'Cash collected vs cash goal', 'Cash collections vs cash goal'],
  ['midcycle', 'Missed charges by hospital', 'Missed charge rate by hospital'],
  ['access', 'Scheduling lead time by hospital', 'Lead time 3+ days by hospital'],
  ['access', 'Accounts scheduled < 72 hours before service', 'Scheduled < 72h by hospital'],
  ['access', 'Pre-service authorization by hospital', 'Pre-service auth by hospital'],
  ['access', 'Call abandonment by hospital', 'Call abandonment (all lines) by hospital'],
  ['access', 'Pre-registration by hospital', 'Pre-registration 72h by hospital'],
  ['access', 'Financial clearance by hospital', 'Financial clearance 72h by hospital'],
  ['access', 'Medicaid application completion by hospital', 'Medicaid eligible completion by hospital'],
  ['access', 'Registration quality by hospital', 'Registration accuracy by hospital'],
  ['payers', 'Denials vs days in A/R', 'Denial rate vs Gross A/R days'],
];
const LEGACY_VISUAL_ID: Record<string, string> = Object.fromEntries(LEGACY_VISUAL_TITLE.map(([p, a, b]) => [visualItemId(p, a), visualItemId(p, b)]));

/**
 * Item id from before a rename: ELT framework KPIs were keyed by their P code, and some visuals
 * had other titles before the Metric Dictionary names.
 */
export function currentItemId(id: string): string {
  const m = /^kpi:elt:(P\d+)$/.exec(id);
  if (m && LEGACY_FRAMEWORK_CODE[m[1]]) return eltItemId(LEGACY_FRAMEWORK_CODE[m[1]]);
  return LEGACY_VISUAL_ID[id] ?? id;
}

/** Decisions with legacy item ids moved to the current ids. */
export function migrateDecisions(d: Decisions): Decisions {
  return Object.fromEntries(Object.entries(d).map(([id, v]) => [currentItemId(id), v]));
}

// ---------------------------------------------------------------- static items

const cap = (key: string, group: string, label: string): PriorityItem => ({ id: `cap:${key}`, kind: 'capability', group, label });

/** Product capabilities that are not a single visual. */
export const CAPABILITIES: PriorityItem[] = [
  cap('drill', 'Navigation', 'Drill-through from a metric or hospital to its analysis page'),
  cap('crumbs', 'Navigation', 'Breadcrumbs and Back along the drill path'),
  cap('see-understand-act', 'Navigation', 'Hand-off from analytics to the matching worklist, already filtered'),
  cap('filter-pane', 'Filtering', 'Global filter pane (organization, payer, service, RCM area)'),
  cap('page-filters', 'Filtering', 'Page-specific filters (denial category, A/R age, DNFB hold, edit category)'),
  cap('click-filter', 'Filtering', 'Click a bar, row or point to filter'),
  cap('period', 'Filtering', 'Period type (day, week, month, quarter, YTD, rolling 12 months) and compare to prior period or prior year'),
  cap('filters-persist', 'Filtering', 'Filters kept between pages and visits'),
  cap('measure-switch', 'Analysis', 'Measure switch on visuals ($ / % / #)'),
  cap('decomposition', 'Analysis', 'Decomposition tree'),
  cap('definitions', 'Every visual', 'Metric definition popover'),
  cap('as-table', 'Every visual', 'Show as table'),
  cap('focus', 'Every visual', 'Focus (full screen) mode'),
  cap('csv', 'Every visual', 'Export data to CSV'),
  cap('pdf', 'Sharing', 'Print or save as PDF'),
  cap('link', 'Sharing', 'Copy a link to the current view'),
  cap('bookmarks', 'Sharing', 'Personal bookmarks'),
  cap('audience', 'Users and access', 'Separate Internal and External user views'),
  cap('freshness', 'Data trust', 'Data through date and last refresh in the header'),
  cap('preliminary', 'Data trust', 'Preliminary (not closed) period flag'),
  cap('state-loading', 'Data trust', 'Loading state (skeletons)'),
  cap('state-stale', 'Data trust', 'Stale data warning'),
  cap('state-partial', 'Data trust', 'Source delayed / partial data warning'),
  cap('state-empty', 'Data trust', 'No data for the current filters, with Clear filters'),
  cap('state-error', 'Data trust', 'Visual error with Retry'),
  cap('work-edits', 'Worklists', 'Worklist actions: assign, change status, add notes'),
];

/** Client KPI inventory rows (Definitions) and the ELT framework metrics. */
export const KPI_ITEMS: PriorityItem[] = [
  ...FRAMEWORK.flatMap((g) => g.metrics.map((m) => ({ id: eltItemId(m.id), kind: 'kpi' as const, group: 'ELT framework', label: `${m.code} ${METRIC_BY_ID[m.id].name}` }))),
  ...KPI_COVERAGE.map((k) => ({ id: kpiItemId(k.dashboard, k.kpi), kind: 'kpi' as const, group: `Client KPI inventory · ${k.stage}`, label: `${k.kpi} (${k.dashboard})` })),
];

export function kpiItemId(dashboard: string, kpi: string) { return `kpi:client:${dashboard}|${kpi}`; }

/** Starting point: everything unset, except the worklists, which are planned for v2. */
export const SEED: Decisions = Object.fromEntries(
  [pageItemId('wl-denials'), pageItemId('wl-ar'), pageItemId('wl-dnfb'), 'cap:work-edits'].map((id) => [id, { tier: 'v2' as Tier, at: '' }]),
);

// ---------------------------------------------------------------- rules

/** The item's own rating, or (for a visual) its page's rating. */
export function effectiveTier(item: Pick<PriorityItem, 'id' | 'kind' | 'page'>, d: Decisions): { tier?: Tier; inherited: boolean } {
  const own = d[item.id]?.tier;
  if (own) return { tier: own, inherited: false };
  if (item.kind === 'visual' && item.page) {
    const p = d[pageItemId(item.page)]?.tier;
    if (p) return { tier: p, inherited: true };
  }
  return { inherited: false };
}

/** True when an item with this tier is part of the previewed release. Unset items are not. */
export function inRelease(tier: Tier | undefined, preview: Preview): boolean {
  if (preview === 'all') return true;
  return !!tier && tier !== 'wont' && RANK[tier] <= RANK[preview];
}

export type Counts = Record<Tier | 'unset', number>;
export function countTiers(items: PriorityItem[], d: Decisions): Counts {
  const c: Counts = { v1: 0, v2: 0, v3: 0, wont: 0, unset: 0 };
  for (const it of items) c[effectiveTier(it, d).tier ?? 'unset'] += 1;
  return c;
}

// ---------------------------------------------------------------- export and import

export const FILE_FORMAT = 'rcm-prototype-release-priorities';

export interface PriorityFile {
  format: typeof FILE_FORMAT;
  version: 1;
  exportedAt: string;
  items: (PriorityItem & { tier?: Tier; inherited?: boolean; note?: string; setAt?: string })[];
}

export function toFile(items: PriorityItem[], d: Decisions, exportedAt: string): PriorityFile {
  return {
    format: FILE_FORMAT, version: 1, exportedAt,
    items: items.map((it) => {
      const e = effectiveTier(it, d);
      const own = d[it.id];
      return { ...it, tier: e.tier, inherited: e.inherited || undefined, note: own?.note || undefined, setAt: own?.at || undefined };
    }),
  };
}

const CSV_COLS = ['ID', 'Type', 'Page or group', 'Item', 'Release', 'MoSCoW', 'From page rating', 'Note', 'Set at'];

export function toCsv(items: PriorityItem[], d: Decisions): string {
  const rows = items.map((it) => {
    const e = effectiveTier(it, d);
    const t = e.tier ? TIER_BY_ID[e.tier] : null;
    const own = d[it.id];
    return [it.id, KIND_LABEL[it.kind], it.group, it.label, t?.release ?? '', t?.moscow ?? '', e.inherited ? 'Yes' : '', own?.note ?? '', own?.at ?? ''];
  });
  return [CSV_COLS, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** Reads a JSON or CSV file made by the export. Ratings inherited from a page are not stored again. */
export function parseFile(text: string): { decisions: Decisions; items: PriorityItem[] } {
  const body = text.replace(/^﻿/, '').trim();
  const decisions: Decisions = {};
  const items: PriorityItem[] = [];
  const add = (raw: PriorityItem, tier: Tier | undefined, inherited: boolean, note: string | undefined, at: string | undefined) => {
    const it = { ...raw, id: currentItemId(raw.id) };
    items.push({ id: it.id, kind: it.kind, label: it.label, group: it.group, ...(it.page ? { page: it.page } : {}) });
    const own = inherited ? undefined : tier;
    if (own || note) decisions[it.id] = { ...(own ? { tier: own } : {}), ...(note ? { note } : {}), at: at ?? '' };
  };
  if (body.startsWith('{')) {
    const f = JSON.parse(body) as PriorityFile;
    if (f.format !== FILE_FORMAT || !Array.isArray(f.items)) throw new Error('This is not a release priorities file from this prototype.');
    for (const it of f.items) {
      if (!it.id || !KIND_LABEL[it.kind]) continue;
      add(it, it.tier && RANK[it.tier] ? it.tier : undefined, !!it.inherited, it.note, it.setAt);
    }
    return { decisions, items };
  }
  const [head, ...rows] = parseCsv(body);
  if (!head || head[0] !== 'ID' || head.length < CSV_COLS.length) throw new Error('This CSV file does not have the columns of a release priorities export.');
  const kindOf = Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [v, k])) as Record<string, ItemKind>;
  for (const r of rows) {
    const [id, kind, group, label, release, moscow, inherited, note, at] = r;
    if (!id || !kindOf[kind]) continue;
    const tier = TIERS.find((t) => t.release === release || t.short === release || t.moscow === moscow)?.v;
    const page = kindOf[kind] === 'visual' ? id.split(':')[1] : kindOf[kind] === 'page' ? id.slice(5) : undefined;
    add({ id, kind: kindOf[kind], group, label, page }, tier, inherited === 'Yes', note || undefined, at || undefined);
  }
  return { decisions, items };
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out;
}
