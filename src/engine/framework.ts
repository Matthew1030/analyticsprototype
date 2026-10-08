// The client's ELT RCM metric framework. Codes are fixed by the client (there is no P3).
// Each entry maps a framework code to the catalog metric that calculates it, with the client's
// metric name and published benchmark. Targets live in config/targets.config.json.

export interface FrameworkMetric { code: string; id: string; label: string; name: string; benchmark: string }
export interface FrameworkGroup { name: string; metrics: FrameworkMetric[] }

export const FRAMEWORK: FrameworkGroup[] = [
  { name: 'Balance Sheet Metrics', metrics: [
    { code: 'P1', id: 'gross_ar_days', label: 'Gross AR Days', name: 'Gross AR Days', benchmark: '40–45 days' },
    { code: 'P4', id: 'ar_gt90_pct', label: '% of AR Over 90 Days', name: '% of AR Over 90 Days', benchmark: '< 20%' },
    { code: 'P6', id: 'credit_balance_days', label: 'Credit Balance Days', name: 'Net Days in Credit Balance', benchmark: '< 1 day' },
    { code: 'P7', id: 'pos_pct_net', label: 'POS Collections % Net Rev', name: 'Point-of-Service Cash % of Net Revenue', benchmark: '> 1–2%' },
  ] },
  { name: 'Income Statement Metrics', metrics: [
    { code: 'P2', id: 'net_to_gross', label: 'Net to Gross Ratio', name: 'Net to Gross Ratio', benchmark: 'Mix dependent' },
    { code: 'P5', id: 'dnfb_days', label: 'DNFB / Unbilled Days', name: 'Days in Total Discharged Not Final Billed (DNFB)', benchmark: '< Bill hold + 1.5 days' },
    { code: 'P8', id: 'cash_pct_npsr', label: 'Cash as % of Net Revenue', name: 'Cash as % of Net Revenue', benchmark: '100%' },
    { code: 'P9', id: 'bad_debt_pct_gross', label: 'Bad Debt % Gross Rev', name: 'Bad Debt as % of Gross Revenue', benchmark: '< 2–5%' },
    { code: 'P10', id: 'denial_dollar_rate', label: 'Initial Denial Rate', name: 'Initial Denial Rate Claim Dollars', benchmark: '< 5%' },
    { code: 'P11', id: 'bad_debt_unrealized_pct', label: 'Bad Debt incl. Unrealized', name: 'Bad Debt incl. Unrealized as % of Gross Revenue', benchmark: '< 3%' },
    { code: 'P12', id: 'avoidable_wo_pct_net', label: 'Avoidable Write-Offs % Net', name: 'Avoidable Write-Offs as % of Net Revenue', benchmark: '< 0.5%' },
    { code: 'P13', id: 'avoidable_wo_unrealized_pct', label: 'Avoidable W/O incl. Unreal.', name: 'Avoidable Write-Offs incl. Unrealized as % of Net Revenue', benchmark: '< 1%' },
  ] },
];

export const FRAMEWORK_METRICS: FrameworkMetric[] = FRAMEWORK.flatMap((g) => g.metrics);
export const FRAMEWORK_BY_ID: Record<string, FrameworkMetric> = Object.fromEntries(FRAMEWORK_METRICS.map((m) => [m.id, m]));
