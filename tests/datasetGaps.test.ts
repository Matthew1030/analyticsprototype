// Data points not in the current dataset: every entry must point at a real metric, KPI row or view.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIMENSION_METRICS, dimensionInDataset, KPIS_NOT_IN_DATASET, METRICS_NOT_IN_DATASET, VIEWS_NOT_IN_DATASET, WORKBOOK_SOURCE } from '../src/config/datasetGaps';
import { KPI_COVERAGE } from '../src/config/kpiCoverage';
import { METRIC_BY_ID, METRICS } from '../src/engine/metrics';

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

describe('full audit of the catalog against the workbook', () => {
  it('puts every catalog metric in exactly one list: workbook source or not in the dataset', () => {
    for (const m of METRICS) {
      const has = !!WORKBOOK_SOURCE[m.id];
      expect(has !== METRICS_NOT_IN_DATASET.has(m.id), `${m.id}: give it a workbook source or mark it not in the dataset`).toBe(true);
    }
    for (const id of Object.keys(WORKBOOK_SOURCE)) expect(METRIC_BY_ID[id], id).toBeDefined();
  });

  it('splits by facility any metric the dataset holds, and by other dimensions only where the workbook does', () => {
    expect(dimensionInDataset('facility', 'cash')).toBe(true);
    expect(dimensionInDataset('facility', 'coding_tat')).toBe(false);
    expect(dimensionInDataset('payer', 'cash')).toBe(false);
    expect(dimensionInDataset('financialClass', 'cash')).toBe(true);
    for (const ids of Object.values(DIMENSION_METRICS)) for (const id of ids) expect(WORKBOOK_SOURCE[id], id).toBeDefined();
  });
});
