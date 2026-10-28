// Metric codes, plain-language calculations and the metric dictionary (views and CSV export).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_VISUAL_TITLE, parseCsv } from '../src/config/priorities';
import {
  DICTIONARY_COLUMNS, dictionaryCsv, dictionaryRows, FILE_PAGE, FILES_WITHOUT_VIEWS, loadMetricViews, metricIdsIn,
} from '../src/config/metricDictionary';
import { AREA_CODE, METRICS } from '../src/engine/metrics';

describe('metric codes', () => {
  it('gives every metric a unique code: area prefix, dash, two digits', () => {
    const codes = METRICS.map((m) => m.code);
    expect(new Set(codes).size).toBe(METRICS.length);
    for (const m of METRICS) expect(m.code, m.id).toMatch(new RegExp(`^${AREA_CODE[m.area]}-\\d{2}$`));
  });

  it('numbers each area from 01 with no gaps', () => {
    for (const prefix of Object.values(AREA_CODE)) {
      const nums = METRICS.filter((m) => m.code.startsWith(`${prefix}-`)).map((m) => Number(m.code.slice(-2))).sort((a, b) => a - b);
      expect(nums, prefix).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it('keeps the codes already given (a new metric takes the next number in its area)', () => {
    const fixed: Record<string, string> = {
      'AR-06': 'gross_ar_days', 'FN-10': 'net_to_gross', 'AR-07': 'ar_gt90_pct', 'BL-08': 'dnfb_days', 'AR-01': 'credit_balance_days',
      'PA-01': 'pos_pct_net', 'CA-03': 'cash_pct_npsr', 'FN-11': 'bad_debt_pct_gross', 'DN-04': 'denial_dollar_rate',
      'FN-12': 'bad_debt_unrealized_pct', 'DN-01': 'avoidable_wo_pct_net', 'DN-02': 'avoidable_wo_unrealized_pct',
      'FN-01': 'npsr', 'DN-03': 'denial_rate', 'AR-05': 'net_ar_days', 'CA-01': 'cash',
    };
    for (const [code, id] of Object.entries(fixed)) expect(METRICS.find((m) => m.code === code)?.id, code).toBe(id);
  });

  it('gives every metric a plain-language calculation, not query syntax', () => {
    for (const m of METRICS) {
      expect(m.formula.length, m.id).toBeGreaterThan(5);
      expect(m.formula, m.id).not.toMatch(/\b(SUM|COUNT|AVG|WHERE|ABS)\b|\(\w+\.\w+/);
    }
  });
});

describe('metric dictionary views', () => {
  const pagesDir = join(__dirname, '..', 'src', 'pages');

  it('maps every page source file to a view, or lists it as one with no views', () => {
    for (const f of readdirSync(pagesDir).map((x) => x.replace(/\.tsx$/, ''))) {
      expect(FILE_PAGE[f] || FILES_WITHOUT_VIEWS.includes(f), `${f}.tsx: add it to FILE_PAGE or FILES_WITHOUT_VIEWS`).toBeTruthy();
    }
  });

  it('reads metric ids from source, but not page ids or map values', () => {
    const ids = metricIdsIn(`<KpiStrip ids={['denial_rate', 'cash']} /> <TrendVisual id="net_ar" /> go('cash'); { page: 'cash' }
      const DRILL = { cash_pct_npsr: 'cash' }; METRIC_BY_ID.appeal_rate; { id: 'refunds' } 'not_a_metric'`);
    expect([...ids].sort()).toEqual(['appeal_rate', 'cash', 'denial_rate', 'net_ar', 'refunds']);
    expect([...metricIdsIn(`go('cash'); const DRILL = { cash_pct_npsr: 'cash' };`)]).toEqual([]);
  });

  it('puts metrics on the pages that show them, and every metric on Metric Analysis', async () => {
    const views = await loadMetricViews();
    expect(views.gross_ar_days).toEqual(expect.arrayContaining(['executive', 'cycle', 'ar', 'facility', 'metric']));
    expect(views.appeal_rate).toContain('denials');
    expect(views.pos_yield).toContain('access');
    expect(views.cash).not.toContain('executive');
    for (const m of METRICS) expect(views[m.id], m.id).toContain('metric');
  });
});

describe('metric dictionary export', () => {
  it('exports one CSV row per metric with every column, in code order', async () => {
    const rows = dictionaryRows(await loadMetricViews());
    expect(rows).toHaveLength(METRICS.length);
    const csv = dictionaryCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    const [head, ...body] = parseCsv(csv.slice(1));
    expect(head).toEqual(DICTIONARY_COLUMNS.map((c) => c.label));
    expect(body).toHaveLength(METRICS.length);
    expect(body.map((r) => r[0])).toEqual([...body.map((r) => r[0])].sort());
    const appeal = body.find((r) => r[head.indexOf('Catalog ID')] === 'appeal_rate')!;
    expect(appeal[head.indexOf('Calculation')]).toBe('Appealed denials / denials');
    expect(appeal[head.indexOf('RCM category')]).toBe('Denials');
    expect(appeal[head.indexOf('Time recency (H/D/W/M/Y)')]).toBe('');
    const gross = body.find((r) => r[head.indexOf('Catalog ID')] === 'gross_ar_days')!;
    expect(gross[head.indexOf('Target')]).toBe('45.0');
    expect(gross[head.indexOf('Direction')]).toBe('Lower is better');
    expect(gross[head.indexOf('Flow / balance')]).toBe('Balance');
    expect(body.find((r) => r[head.indexOf('Catalog ID')] === 'cash')![head.indexOf('Target')]).toBe('Calculated (cash goal)');
  });
});

describe('one name per metric (terminology)', () => {
  const pagesDir = join(__dirname, '..', 'src', 'pages');
  const names = new Set(METRICS.flatMap((m) => [m.name, ...(m.short ? [m.short] : [])]));

  it('lists the approved short name in the dictionary and its export', () => {
    expect(DICTIONARY_COLUMNS.map((c) => c.key)).toContain('short');
    const rows = dictionaryRows({});
    expect(rows.find((r) => r.id === 'dnfb_days')?.short).toBe('DNFB days');
  });

  it('keeps a short name only when it differs from the name', () => {
    for (const m of METRICS) if (m.short) expect(m.short, m.id).not.toBe(m.name);
  });

  it('labels a table column for a metric with its name or short name', () => {
    for (const f of readdirSync(pagesDir)) {
      const src = readFileSync(join(pagesDir, f), 'utf8');
      for (const m of src.matchAll(/\{[^{}\n]*?label: '([^']*)'[^\n]*?metricId: '([a-z0-9_]+)'/g)) {
        const def = METRICS.find((x) => x.id === m[2])!;
        // A period qualifier in parentheses may follow, e.g. "(YTD)".
        expect([def.name, def.short], `${f}: column "${m[1]}" for ${m[2]}`).toContain(m[1].replace(/ \((YTD|MTD)\)$/, ''));
      }
    }
  });

  it('renames visuals to a metric name or short name ("<metric> by <dimension>")', () => {
    for (const [, , title] of LEGACY_VISUAL_TITLE) {
      const lead = title.replace(/ (by|trend|vs) .*$/, '').replace(/ trend$/, '');
      expect(names.has(lead), title).toBe(true);
    }
  });
});
