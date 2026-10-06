// Status against target. Thresholds are configuration data, not code.

import clientConfig from '../../config/client.config.json';
import type { Direction, MetricDef } from './metrics';

export type Status = 'On Track' | 'At Risk' | 'Off Track' | null;

export interface ClientConfig {
  clientKey: number;
  atRiskBand: number;
  metricTargets: Record<string, number>;
  tasks: TaskConfig[];
  bridge: { title: string; measure: string; categories: { label: string; financialClasses: number[] }[] };
  metricGovernance: { owner: string; version: string; changeDate: string; changeReason: string };
}

export interface TaskConfig {
  id: string;
  group: 'Front End' | 'Mid Cycle' | 'Back End';
  name: string;
  metric: string;
  given: string;
  performed: string;
  target: number | null;
  targetType: 'Contractual' | 'Internal' | null;
}

export const CONFIG = clientConfig as ClientConfig;

export function targetFor(metricId: string): number | null {
  const t = CONFIG.metricTargets[metricId];
  return t === undefined ? null : t;
}

/**
 * On Track: meets the target. At Risk: misses by no more than the band (relative).
 * Off Track: misses by more than the band. No target or no value: no status.
 */
export function statusOf(value: number | null, target: number | null, direction: Direction, band = CONFIG.atRiskBand): Status {
  if (value === null || target === null || direction === 'none') return null;
  if (direction === 'down') {
    if (value <= target) return 'On Track';
    return value <= target * (1 + band) ? 'At Risk' : 'Off Track';
  }
  if (value >= target) return 'On Track';
  return value >= target * (1 - band) ? 'At Risk' : 'Off Track';
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

export function metricTarget(m: MetricDef): number | null {
  return targetFor(m.id);
}
