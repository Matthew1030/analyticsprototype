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

/**
 * The client's former framework codes (P1–P13), replaced by the catalog codes. Kept only to read
 * release priority ratings saved or exported before the change.
 */
export const LEGACY_FRAMEWORK_CODE: Record<string, string> = {
  P1: 'gross_ar_days', P2: 'net_to_gross', P4: 'ar_gt90_pct', P5: 'dnfb_days', P6: 'credit_balance_days', P7: 'pos_pct_net',
  P8: 'cash_pct_npsr', P9: 'bad_debt_pct_gross', P10: 'denial_dollar_rate', P11: 'bad_debt_unrealized_pct', P12: 'avoidable_wo_pct_net', P13: 'avoidable_wo_unrealized_pct',
};
