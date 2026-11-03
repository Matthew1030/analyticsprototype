// Data points not in the current dataset: every entry must point at a real metric, KPI row or view.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KPIS_NOT_IN_DATASET, METRICS_NOT_IN_DATASET, VIEWS_NOT_IN_DATASET } from '../src/config/datasetGaps';
import { KPI_COVERAGE } from '../src/config/kpiCoverage';
import { METRIC_BY_ID } from '../src/engine/metrics';

describe('data points not in the current dataset', () => {
  it('names only catalog metrics', () => {
    for (const id of METRICS_NOT_IN_DATASET) expect(METRIC_BY_ID[id], id).toBeDefined();
  });

  it('names only rows of the client KPI sheet', () => {
    const keys = new Set(KPI_COVERAGE.map((k) => `${k.dashboard}|${k.kpi}`));
    for (const k of KPIS_NOT_IN_DATASET) expect(keys.has(k), k).toBe(true);
  });

  it('names only visual titles that exist on a page', () => {
    const dir = join(__dirname, '..', 'src', 'pages');
    const src = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    for (const t of Object.keys(VIEWS_NOT_IN_DATASET)) expect(src.includes(`title="${t}"`), t).toBe(true);
  });
});
