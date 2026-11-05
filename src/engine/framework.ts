// The client's ELT RCM metric framework. Each entry names the catalog metric that calculates it,
// with the client's published benchmark. The code and the name are the metric's catalog code and
// name (src/engine/metrics.ts), so every view uses one name per metric. Targets live in
// config/targets.config.json.

import { METRIC_BY_ID } from './metrics';

export interface FrameworkMetric { code: string; id: string; benchmark: string }
export interface FrameworkGroup { name: string; metrics: FrameworkMetric[] }

type Entry = Omit<FrameworkMetric, 'code'>;
const group = (name: string, metrics: Entry[]): FrameworkGroup => ({ name, metrics: metrics.map((m) => ({ ...m, code: METRIC_BY_ID[m.id].code })) });

export const FRAMEWORK: FrameworkGroup[] = [
  group('Balance Sheet Metrics', [
    { id: 'gross_ar_days', benchmark: '40–45 days' },
    { id: 'ar_gt90_pct', benchmark: '< 20%' },
    { id: 'credit_balance_days', benchmark: '< 1 day' },
    { id: 'pos_pct_net', benchmark: '> 1–2%' },
  ]),
  group('Income Statement Metrics', [
    { id: 'net_to_gross', benchmark: 'Mix dependent' },
    { id: 'dnfb_days', benchmark: '< Bill hold + 1.5 days' },
    { id: 'cash_pct_npsr', benchmark: '100%' },
    { id: 'bad_debt_pct_gross', benchmark: '< 2–5%' },
    { id: 'denial_dollar_rate', benchmark: '< 5%' },
    { id: 'bad_debt_unrealized_pct', benchmark: '< 3%' },
    { id: 'avoidable_wo_pct_net', benchmark: '< 0.5%' },
    { id: 'avoidable_wo_unrealized_pct', benchmark: '< 1%' },
  ]),
];

export const FRAMEWORK_METRICS: FrameworkMetric[] = FRAMEWORK.flatMap((g) => g.metrics);
export const FRAMEWORK_BY_ID: Record<string, FrameworkMetric> = Object.fromEntries(FRAMEWORK_METRICS.map((m) => [m.id, m]));
