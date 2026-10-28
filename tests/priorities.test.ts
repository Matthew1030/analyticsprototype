// Release prioritization: rules and the export / import round trip.

import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES, countTiers, eltItemId, effectiveTier, inRelease, KPI_ITEMS, migrateDecisions, pageItemId, parseCsv, parseFile, SEED,
  toCsv, toFile, visualItemId, type Decisions, type PriorityItem,
} from '../src/config/priorities';

const page: PriorityItem = { id: pageItemId('denials'), kind: 'page', label: 'Denials', group: 'Analytics', page: 'denials' };
const vis: PriorityItem = { id: visualItemId('denials', 'Denial rate trend'), kind: 'visual', label: 'Denial rate trend', group: 'Denials', page: 'denials' };
const vis2: PriorityItem = { id: visualItemId('denials', 'Denied $ by payer, "top"'), kind: 'visual', label: 'Denied $ by payer, "top"', group: 'Denials', page: 'denials' };
const items = [page, vis, vis2, ...KPI_ITEMS.slice(0, 3), ...CAPABILITIES.slice(0, 2)];

describe('release prioritization rules', () => {
  it('starts with everything unset except the worklists (v2)', () => {
    expect(Object.keys(SEED).sort()).toEqual(['cap:work-edits', 'page:wl-ar', 'page:wl-denials', 'page:wl-dnfb']);
    expect(Object.values(SEED).every((d) => d.tier === 'v2')).toBe(true);
  });

  it('has a unique id for every static item', () => {
    const ids = [...KPI_ITEMS, ...CAPABILITIES].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(KPI_ITEMS).toHaveLength(73 + 12);
  });

  it('gives a visual its page rating until it has its own', () => {
    const d: Decisions = { [page.id]: { tier: 'v2', at: '' } };
    expect(effectiveTier(vis, d)).toEqual({ tier: 'v2', inherited: true });
    d[vis.id] = { tier: 'v1', at: '' };
    expect(effectiveTier(vis, d)).toEqual({ tier: 'v1', inherited: false });
    expect(effectiveTier(KPI_ITEMS[0], d)).toEqual({ inherited: false });
  });

  it('previews a release with everything up to it, without unset or Won\'t items', () => {
    expect(inRelease(undefined, 'all')).toBe(true);
    expect(inRelease('v1', 'v1')).toBe(true);
    expect(inRelease('v2', 'v1')).toBe(false);
    expect(inRelease('v2', 'v2')).toBe(true);
    expect(inRelease('v3', 'v3')).toBe(true);
    expect(inRelease('wont', 'v3')).toBe(false);
    expect(inRelease(undefined, 'v3')).toBe(false);
  });

  it('counts effective ratings', () => {
    const d: Decisions = { [page.id]: { tier: 'v3', at: '' }, [vis.id]: { tier: 'wont', at: '' } };
    expect(countTiers([vis, vis2, KPI_ITEMS[0]], d)).toEqual({ v1: 0, v2: 0, v3: 1, wont: 1, unset: 1 });
  });
});

describe('release priorities export and import', () => {
  const d: Decisions = {
    [page.id]: { tier: 'v2', at: '2026-10-22T10:00:00.000Z' },
    [vis.id]: { tier: 'v1', note: 'MVP, "must" have, per CFO\nline two', at: '2026-10-22T10:01:00.000Z' },
    [KPI_ITEMS[1].id]: { tier: 'wont', at: '' },
    [CAPABILITIES[0].id]: { note: 'Discuss later', at: '' },
  };

  it('round-trips through JSON without storing inherited ratings', () => {
    const back = parseFile(JSON.stringify(toFile(items, d, '2026-10-22T11:00:00.000Z')));
    expect(back.decisions).toEqual(d);
    expect(back.items.map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(back.items.find((i) => i.id === vis.id)?.page).toBe('denials');
  });

  it('round-trips through CSV, including quotes, commas and line breaks', () => {
    const csv = `﻿${toCsv(items, d)}`;
    expect(parseCsv(csv.slice(1))[0][0]).toBe('ID');
    const back = parseFile(csv);
    expect(back.decisions).toEqual(d);
    expect(back.items.find((i) => i.id === vis2.id)).toEqual(vis2);
  });

  it('reads ELT KPI ratings saved under the former P codes', () => {
    expect(migrateDecisions({ 'kpi:elt:P1': { tier: 'v1', at: '' }, [page.id]: { tier: 'v2', at: '' } }))
      .toEqual({ [eltItemId('gross_ar_days')]: { tier: 'v1', at: '' }, [page.id]: { tier: 'v2', at: '' } });
    const csv = toCsv([{ id: 'kpi:elt:P10', kind: 'kpi', group: 'ELT framework', label: 'P10 Initial Denial Rate' }], { 'kpi:elt:P10': { tier: 'v3', at: '' } });
    expect(parseFile(csv).decisions).toEqual({ [eltItemId('denial_dollar_rate')]: { tier: 'v3', at: '' } });
    expect(KPI_ITEMS.some((i) => i.id === eltItemId('denial_dollar_rate'))).toBe(true);
  });

  it('rejects files that are not an export', () => {
    expect(() => parseFile('{"a":1}')).toThrow();
    expect(() => parseFile('a,b\n1,2')).toThrow();
  });
});
