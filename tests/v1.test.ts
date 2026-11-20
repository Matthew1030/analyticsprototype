// v1 scope: the metrics and pages the version selector shows in v1 (A) and v1 (B).

import { describe, expect, it } from 'vitest';
import {
  V1_DENIAL_KPIS, V1_DRILL, V1_ELT_GROUPS, V1_ELT_KPIS, V1_METRICS, V1_PAGES, V1_SCOPE,
  V1B_DRILL, V1B_ELT_GROUPS, V1B_ELT_KPIS, V1B_ELT_TABS, V1B_METRICS, V1B_PAGES, V1B_VIEWS,
} from '../src/config/v1';
import { notInDataset } from '../src/config/datasetGaps';
import { METRIC_BY_ID } from '../src/engine/metrics';

const codes = (ids: string[]) => ids.map((id) => METRIC_BY_ID[id]?.code);

describe('v1 (A) scope', () => {
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

describe('v1 (B) scope', () => {
  it('holds the 16 critical metrics, in the order of the team list', () => {
    expect(codes(V1B_METRICS)).toEqual(['FN-01', 'CA-01', 'CA-03', 'AR-05', 'AR-07', 'BL-01', 'BL-08', 'DN-04', 'DN-05', 'DN-16', 'CD-02', 'CO-04', 'PA-02', 'PA-08', 'PA-22', 'PA-58']);
    expect(V1_SCOPE.v1b.metrics).toBe(V1B_METRICS);
  });

  it('shows the six outcome KPIs on the ELT Summary', () => {
    expect(codes(V1B_ELT_KPIS)).toEqual(['FN-01', 'CA-01', 'CA-03', 'AR-05', 'AR-07', 'DN-04']);
  });

  it('puts all 16 metrics in Performance vs. Target, once each, and every group in one tab', () => {
    const ids = V1B_ELT_GROUPS.flatMap((g) => g.metrics);
    expect([...ids].sort()).toEqual([...V1B_METRICS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    const tabbed = V1B_ELT_TABS.flatMap((t) => t.groups);
    expect([...tabbed].sort()).toEqual(V1B_ELT_GROUPS.map((g) => g.name).sort());
  });

  it('opens a deep dive from every ELT KPI card', () => {
    for (const id of V1B_ELT_KPIS) expect(V1B_PAGES, id).toContain(V1B_DRILL[id]);
  });

  it('gives each deep dive two hero KPIs and small modules from the 16, with no repeats in a view', () => {
    expect(codes(V1B_VIEWS.denials.hero)).toEqual(['DN-04', 'DN-05']);
    expect(codes(V1B_VIEWS['cash-ar'].hero)).toEqual(['CA-01', 'AR-05']);
    expect(codes(V1B_VIEWS.access.hero)).toEqual(['PA-02', 'PA-08']);
    for (const v of Object.values(V1B_VIEWS)) {
      const ids = [...v.hero, ...v.modules];
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(V1B_METRICS).toContain(id);
    }
  });

  it('has the ELT Summary, three deep dives and the Metric Dictionary', () => {
    expect(V1B_PAGES).toEqual(['executive', 'denials', 'cash-ar', 'access', 'dictionary']);
  });

  it('uses only metrics the current dataset holds', () => {
    for (const id of V1B_METRICS) expect(notInDataset(id), id).toBe(false);
  });
});
