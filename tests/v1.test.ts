// v1 scope: the metrics and pages the version selector shows in v1 (A) and v1 (B).

import { describe, expect, it } from 'vitest';
import {
  CADENCES, kpiMetrics, V1_DENIAL_KPIS, V1_DRILL, V1_ELT_GROUPS, V1_ELT_KPIS, V1_METRICS, V1_PAGES, V1_SCOPE,
  V1B_ELT_CADENCES, V1B_ELT_GROUPS, V1B_ELT_TABS, V1B_METRICS, V1B_PAGES, type KpiSpec,
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

/** A card as a short code: the metric code(s), or the card kind. */
const card = (k: KpiSpec) => (typeof k === 'string' ? METRIC_BY_ID[k]?.code : k.kind === 'pair' ? `${METRIC_BY_ID[k.id]?.code}/${METRIC_BY_ID[k.secondary]?.code}` : k.kind);

describe('v1 (B) scope', () => {
  it('has Daily, Weekly and Monthly tabs, each with six KPI cards', () => {
    expect(CADENCES).toEqual(['day', 'week', 'month']);
    expect(CADENCES.map((c) => V1B_ELT_CADENCES[c].label)).toEqual(['Daily', 'Weekly', 'Monthly']);
    for (const c of CADENCES) expect(V1B_ELT_CADENCES[c].kpis, c).toHaveLength(6);
  });

  it('shows the agreed KPIs in each tab, in order', () => {
    expect(V1B_ELT_CADENCES.day.kpis.map(card)).toEqual(['dnfb-split', 'CA-01', 'denial-worklist', 'placeholder', 'placeholder', 'DN-04']);
    expect(V1B_ELT_CADENCES.week.kpis.map(card)).toEqual(['BL-08/BL-07', 'CA-01', 'AR-05/AR-04', 'AR-07', 'DN-04', 'BL-01']);
    expect(V1B_ELT_CADENCES.month.kpis.map(card)).toEqual(['FN-01', 'CA-01', 'CA-03', 'AR-05', 'AR-07', 'DN-04']);
  });

  it('puts every metric in Performance vs. Target once, including every metric on a KPI card', () => {
    const ids = V1B_ELT_GROUPS.flatMap((g) => g.metrics);
    expect(new Set(ids).size).toBe(ids.length);
    expect(V1_SCOPE.v1b.metrics).toBe(V1B_METRICS);
    for (const c of CADENCES) for (const id of V1B_ELT_CADENCES[c].kpis.flatMap(kpiMetrics)) expect(ids, id).toContain(id);
  });

  it('has the four Performance vs. Target tabs, with Denials on its own, and every group in one tab', () => {
    expect(V1B_ELT_TABS.map((t) => t.label)).toEqual(['Financial / Cash / AR', 'Denials', 'Billing / Mid-Cycle', 'Patient Access']);
    expect(V1B_ELT_TABS[1].groups).toEqual(['Denials']);
    const tabbed = V1B_ELT_TABS.flatMap((t) => t.groups);
    expect(new Set(tabbed).size).toBe(tabbed.length);
    expect([...tabbed].sort()).toEqual(V1B_ELT_GROUPS.map((g) => g.name).sort());
  });

  it('has the ELT Summary and the Metric Dictionary only (no analytics views), with no drill-through', () => {
    expect(V1B_PAGES).toEqual(['executive', 'dictionary']);
    expect(V1_SCOPE.v1b.drill).toEqual({});
  });

  it('uses only catalog metrics that the current dataset holds', () => {
    for (const id of V1B_METRICS) {
      expect(METRIC_BY_ID[id], id).toBeDefined();
      expect(notInDataset(id), id).toBe(false);
    }
  });
});
