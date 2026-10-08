// The client's ELT RCM metric framework. Codes are fixed by the client (there is no P3).
// Each entry maps a framework code to the metric in the catalog that calculates it.

export interface FrameworkMetric { code: string; id: string; label: string }
export interface FrameworkGroup { name: string; metrics: FrameworkMetric[] }

export const FRAMEWORK: FrameworkGroup[] = [
  { name: 'A/R Performance', metrics: [
    { code: 'P1', id: 'gross_ar_days', label: 'Gross AR Days' },
    { code: 'P4', id: 'ar_gt90_pct', label: '% of AR Over 90 Days' },
    { code: 'P6', id: 'credit_balance_days', label: 'Credit Balance Days' },
  ] },
  { name: 'Revenue & Cash', metrics: [
    { code: 'P2', id: 'net_to_gross', label: 'Net to Gross Ratio' },
    { code: 'P7', id: 'pos_pct_net', label: 'POS Collections % Net Rev' },
    { code: 'P8', id: 'cash_pct_npsr', label: 'Cash as % of Net Revenue' },
  ] },
  { name: 'Billing', metrics: [
    { code: 'P5', id: 'dnfb_days', label: 'DNFB / Unbilled Days' },
  ] },
  { name: 'Denials', metrics: [
    { code: 'P10', id: 'denial_rate', label: 'Initial Denial Rate' },
  ] },
  { name: 'Bad Debt & Write-Offs', metrics: [
    { code: 'P9', id: 'bad_debt_pct_gross', label: 'Bad Debt % Gross Rev' },
    { code: 'P11', id: 'bad_debt_unrealized_pct', label: 'Bad Debt incl. Unrealized' },
    { code: 'P12', id: 'avoidable_wo_pct_net', label: 'Avoidable Write-Offs % Net' },
    { code: 'P13', id: 'avoidable_wo_unrealized_pct', label: 'Avoidable W/O incl. Unreal.' },
  ] },
];

export const FRAMEWORK_METRICS: FrameworkMetric[] = FRAMEWORK.flatMap((g) => g.metrics);
export const FRAMEWORK_BY_ID: Record<string, FrameworkMetric> = Object.fromEntries(FRAMEWORK_METRICS.map((m) => [m.id, m]));

/** "P1 · Gross AR Days" for framework metrics; the catalog name otherwise. */
export function frameworkLabel(id: string, fallback: string): string {
  const f = FRAMEWORK_BY_ID[id];
  return f ? `${f.code} · ${f.label}` : fallback;
}
