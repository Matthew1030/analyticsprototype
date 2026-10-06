// Facility ranking and composite score, calculated at run time among the facilities in view.

import type { Engine, Selections } from './engine';
import { METRIC_BY_ID, evaluate } from './metrics';
import type { Period } from './periods';

export const RANK_METRICS = ['M01', 'M05', 'M10', 'M07', 'M22'];

export interface RankRow {
  key: number;
  name: string;
  values: (number | null)[];
  ranks: (number | null)[];
  score: number | null;
  rank: number;
  share: number | null;
}

/** Composite score = 100 x (N - average rank) / (N - 1), among the facilities in view. */
export function rankFacilities(engine: Engine, period: Period, sel: Selections, facilities: { key: number; name: string }[]): RankRow[] {
  const inView = (sel.facility?.length ?? 0) >= 2 ? facilities.filter((f) => sel.facility!.includes(f.key)) : facilities;
  const rows = inView.map((f) => ({
    key: f.key, name: f.name,
    values: RANK_METRICS.map((id) => evaluate(METRIC_BY_ID[id], engine, period, { ...sel, facility: [f.key] }).value),
    share: evaluate(METRIC_BY_ID.M17, engine, period, { ...sel, facility: [f.key] }).value,
  }));
  const ranks = RANK_METRICS.map((id, mi) => {
    const dir = METRIC_BY_ID[id].direction;
    const vals = rows.map((r) => r.values[mi]);
    return vals.map((v) => (v === null ? null : 1 + vals.filter((o) => o !== null && (dir === 'up' ? o > v : o < v)).length));
  });
  const n = rows.length;
  const out = rows.map((r, i) => {
    const rk = ranks.map((col) => col[i]);
    const valid = rk.filter((x): x is number => x !== null);
    const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    return { ...r, ranks: rk, score: avg === null || n < 2 ? null : (100 * (n - avg)) / (n - 1), rank: 0 };
  });
  const sorted = [...out].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}
