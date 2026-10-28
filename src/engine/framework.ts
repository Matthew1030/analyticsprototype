// The client's ELT RCM metric framework. Each entry names the catalog metric that calculates it,
// with the client's metric name and published benchmark. The code is the metric's catalog code
// (src/engine/metrics.ts). Targets live in config/targets.config.json.

import { METRIC_BY_ID } from './metrics';

export interface FrameworkMetric { code: string; id: string; label: string; name: string; benchmark: string }
export interface FrameworkGroup { name: string; metrics: FrameworkMetric[] }

type Entry = Omit<FrameworkMetric, 'code'>;
const group = (name: string, metrics: Entry[]): FrameworkGroup => ({ name, metrics: metrics.map((m) => ({ ...m, code: METRIC_BY_ID[m.id].code })) });

export const FRAMEWORK: FrameworkGroup[] = [
  group('Balance Sheet Metrics', [
    { id: 'gross_ar_days', label: 'Gross AR Days', name: 'Gross AR Days', benchmark: '40–45 days' },
    { id: 'ar_gt90_pct', label: '% of AR Over 90 Days', name: '% of AR Over 90 Days', benchmark: '< 20%' },
    { id: 'credit_balance_days', label: 'Credit Balance Days', name: 'Net Days in Credit Balance', benchmark: '< 1 day' },
    { id: 'pos_pct_net', label: 'POS Collections % Net Rev', name: 'Point-of-Service Cash % of Net Revenue', benchmark: '> 1–2%' },
  ]),
  group('Income Statement Metrics', [
    { id: 'net_to_gross', label: 'Net to Gross Ratio', name: 'Net to Gross Ratio', benchmark: 'Mix dependent' },
    { id: 'dnfb_days', label: 'DNFB / Unbilled Days', name: 'Days in Total Discharged Not Final Billed (DNFB)', benchmark: '< Bill hold + 1.5 days' },
    { id: 'cash_pct_npsr', label: 'Cash as % of Net Revenue', name: 'Cash as % of Net Revenue', benchmark: '100%' },
    { id: 'bad_debt_pct_gross', label: 'Bad Debt % Gross Rev', name: 'Bad Debt as % of Gross Revenue', benchmark: '< 2–5%' },
    { id: 'denial_dollar_rate', label: 'Initial Denial Rate', name: 'Initial Denial Rate Claim Dollars', benchmark: '< 5%' },
    { id: 'bad_debt_unrealized_pct', label: 'Bad Debt incl. Unrealized', name: 'Bad Debt incl. Unrealized as % of Gross Revenue', benchmark: '< 3%' },
    { id: 'avoidable_wo_pct_net', label: 'Avoidable Write-Offs % Net', name: 'Avoidable Write-Offs as % of Net Revenue', benchmark: '< 0.5%' },
    { id: 'avoidable_wo_unrealized_pct', label: 'Avoidable W/O incl. Unreal.', name: 'Avoidable Write-Offs incl. Unrealized as % of Net Revenue', benchmark: '< 1%' },
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
