// Status against target. Targets and thresholds are configuration data, not code.

import targetsConfig from '../../config/targets.config.json';
import type { Direction } from './metrics';

export type Status = 'On target' | 'Watch' | 'Off target' | null;

interface TargetEntry { target: number | 'dynamic'; watch: number }

export interface TargetsConfig {
  organizationKey: number;
  cashGoalPctOfNpsr: number;
  targets: Record<string, TargetEntry>;
  governance: { owner: string; version: string; changeDate: string; changeReason: string };
}

export const CONFIG = targetsConfig as unknown as TargetsConfig;

/** Static target, or null. Dynamic targets (cash goal) are computed by the metric. */
export function staticTarget(metricId: string): number | null {
  const t = CONFIG.targets[metricId]?.target;
  return typeof t === 'number' ? t : null;
}

/**
 * Watch threshold. For dynamic targets the config holds a ratio of the target
 * (e.g. 0.97 = Watch while cash is at least 97% of goal).
 */
export function watchFor(metricId: string, target: number | null): number | null {
  const e = CONFIG.targets[metricId];
  if (!e || target === null) return null;
  return e.target === 'dynamic' ? target * e.watch : e.watch;
}

/**
 * On target: meets the target. Watch: misses it but stays within the watch threshold.
 * Off target: beyond the watch threshold. No target or no value: no status.
 */
export function statusOf(value: number | null, target: number | null, direction: Direction, watch: number | null): Status {
  if (value === null || target === null || direction === 'none') return null;
  const w = watch ?? target;
  if (direction === 'down') {
    if (value <= target) return 'On target';
    return value <= w ? 'Watch' : 'Off target';
  }
  if (value >= target) return 'On target';
  return value >= w ? 'Watch' : 'Off target';
}

export type Change = 'Favorable' | 'Unfavorable' | 'No change' | null;

export function changeOf(current: number | null, prior: number | null, direction: Direction): Change {
  if (current === null || prior === null) return null;
  if (direction === 'none') return null;
  const d = current - prior;
  if (Math.abs(d) < 1e-9) return 'No change';
  const better = direction === 'up' ? d > 0 : d < 0;
  return better ? 'Favorable' : 'Unfavorable';
}

export const STATUS_RANK: Record<string, number> = { 'Off target': 0, Watch: 1, 'On target': 2 };
