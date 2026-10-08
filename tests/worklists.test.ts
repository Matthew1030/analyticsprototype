import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { worklist, WORKLIST_KINDS } from '../src/services/worklists';
import { loadDataset } from './loadDataset';

const ds = loadDataset();
const e = new Engine(ds);
const day = ds.meta.asOfDay;
const fac = (name: string) => ds.dims.facilities.find((f) => f.short === name)!.key;
const cat = (name: string) => ds.dims.denialCategories.find((c) => c.name === name)!.key;

describe('worklists', () => {
  it('return open items for every worklist, sorted by priority then amount', () => {
    for (const kind of WORKLIST_KINDS) {
      const items = worklist(e, { kind, day }, {});
      expect(items.length).toBeGreaterThan(100);
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1], b = items[i];
        expect(a.priority_rank > b.priority_rank || (a.priority_rank === b.priority_rank && a.amount >= b.amount)).toBe(true);
      }
    }
  });

  it('fill every work field (status, owner team, next action, priority reason)', () => {
    for (const kind of WORKLIST_KINDS) {
      for (const r of worklist(e, { kind, day }, {})) {
        expect(r.status).toBeTruthy();
        expect(r.team).toBeTruthy();
        expect(r.next_action).toBeTruthy();
        expect(r.priority_why).toBeTruthy();
        expect(r.amount).toBeGreaterThan(0);
      }
    }
  });

  it('keep high priority to a workable share of each list', () => {
    for (const kind of WORKLIST_KINDS) {
      const items = worklist(e, { kind, day }, {});
      const high = items.filter((r) => r.priority === 'High').length / items.length;
      expect(high).toBeGreaterThan(0.02);
      expect(high).toBeLessThan(0.3);
    }
  });

  it('are stable between runs (simulated work fields are deterministic)', () => {
    const a = worklist(e, { kind: 'denials', day }, {}).map((r) => `${r.id}|${r.status}|${r.assignee}`);
    const b = worklist(e, { kind: 'denials', day }, {}).map((r) => `${r.id}|${r.status}|${r.assignee}`);
    expect(a).toEqual(b);
  });

  it('apply the analytics context, so a drill path ends on the items behind it', () => {
    const sel = { facility: [fac('Valley Regional')], denialCategory: [cat('Coordination of benefits')] };
    const items = worklist(e, { kind: 'denials', day }, sel);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((r) => r.facility === 'Valley Regional' && r.category === 'Coordination of benefits')).toBe(true);
  });

  it('keep denied claims off the A/R follow-up list (no double work)', () => {
    const denied = new Set(worklist(e, { kind: 'denials', day }, {}).map((r) => r.account));
    const ar = worklist(e, { kind: 'ar', day }, {});
    expect(ar.some((r) => denied.has(r.account))).toBe(false);
  });

  it('never list unrecoverable or past-deadline denials as high priority', () => {
    for (const r of worklist(e, { kind: 'denials', day }, {})) {
      if (r.recoverable === false || (r.days_to_deadline !== null && r.days_to_deadline < 0)) expect(r.priority).not.toBe('High');
    }
  });
});
