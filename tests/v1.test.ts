// v1 scope: the metrics and pages the version selector shows in v1.

import { describe, expect, it } from 'vitest';
import { V1_DENIAL_KPIS, V1_DRILL, V1_ELT_GROUPS, V1_ELT_KPIS, V1_METRICS, V1_PAGES } from '../src/config/v1';
import { notInDataset } from '../src/config/datasetGaps';
import { METRIC_BY_ID } from '../src/engine/metrics';

const codes = (ids: string[]) => ids.map((id) => METRIC_BY_ID[id]?.code);

describe('v1 scope', () => {
  it('shows the six ELT KPIs in revenue-cycle order', () => {
    expect(codes(V1_ELT_KPIS)).toEqual(['PA-22', 'PA-02', 'CO-04', 'BL-01', 'BL-08', 'DN-04']);
  });

  it('puts the same six metrics in Performance vs. Target, once each', () => {
    const ids = V1_ELT_GROUPS.flatMap((g) => g.metrics);
    expect([...ids].sort()).toEqual([...V1_ELT_KPIS].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('opens only the Denials page from the ELT Summary', () => {
    expect(V1_DRILL).toEqual({ denial_dollar_rate: 'denials' });
  });

  it('shows the seven Denials KPIs', () => {
    expect(codes(V1_DENIAL_KPIS)).toEqual(['DN-05', 'DN-04', 'PA-02', 'CO-04', 'CD-02', 'DN-15', 'DN-16']);
  });

  it('has only the ELT Summary, Denials and the Metric Dictionary', () => {
    expect(V1_PAGES).toEqual(['executive', 'denials', 'dictionary']);
    expect(V1_METRICS).toHaveLength(10);
  });

  it('uses only metrics the current dataset holds (v1 shows no asterisk legend)', () => {
    for (const id of V1_METRICS) expect(notInDataset(id), id).toBe(false);
  });
});
