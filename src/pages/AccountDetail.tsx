// Account Detail: the drill-through end point. Lists the accounts behind an aggregate for the
// current filters. Synthetic account numbers only; no patient identifiers are shown or stored.

import { useMemo, useState } from 'react';
import { DIMENSION_LABEL } from '../services/analytics';
import { accounts } from '../services/analytics';
import type { AccountRow } from '../services/contracts';
import { fmt, usd, usdFull } from '../format';
import { useApp } from '../state/AppState';
import { Grid, gridExport, type GridColumn } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';

type Mode = 'open' | 'denied' | 'dnfb';
const WORKLIST_FOR = { open: 'wl-ar', denied: 'wl-denials', dnfb: 'wl-dnfb' } as const;
const MODE_LABEL: Record<Mode, string> = { open: 'Open A/R accounts', denied: 'Denied claims', dnfb: 'Unbilled (DNFB) accounts' };

const COLS: GridColumn<AccountRow>[] = [
  { key: 'id', label: 'Account', value: (r) => r.account_id, width: 96, render: (r) => <span className="mono">{r.account_id}</span> },
  { key: 'fac', label: 'Hospital', value: (r) => r.facility, align: 'left' },
  { key: 'payer', label: 'Payer', value: (r) => r.payer, align: 'left' },
  { key: 'fc', label: 'Financial class', value: (r) => r.financial_class, align: 'left' },
  { key: 'svc', label: 'Service line', value: (r) => r.service_line, align: 'left' },
  { key: 'dd', label: 'Discharged', value: (r) => r.discharge_date, align: 'left' },
  { key: 'age', label: 'Days', value: (r) => r.days_since_discharge, heat: 'high', info: 'Days from discharge to the snapshot date.' },
  { key: 'gross', label: 'Charges', value: (r) => r.gross_charges, format: (v) => usdFull(v ?? 0) },
  { key: 'bal', label: 'Balance', value: (r) => r.balance, format: (v) => <b>{usdFull(v ?? 0)}</b>, exportText: (r) => r.balance, bar: true },
  { key: 'status', label: 'Status', value: (r) => r.status, align: 'left' },
  { key: 'rc', label: 'Denial root cause', value: (r) => r.denial_root_cause ?? '', align: 'left', render: (r) => r.denial_root_cause ?? <span className="muted">–</span> },
  { key: 'last', label: 'Last activity', value: (r) => r.last_activity, align: 'left' },
];

export function AccountsTable({ rows, pageSize = 25, compact }: { rows: AccountRow[]; pageSize?: number; compact?: boolean }) {
  const [open, setOpen] = useState<AccountRow | null>(null);
  const cols = compact ? COLS.filter((c) => !['fc', 'svc', 'gross', 'last', 'rc'].includes(c.key)) : COLS;
  return (
    <div className={open && !compact ? 'acct-split' : ''}>
      <Grid caption="Accounts" columns={cols} rows={rows.map((r) => ({ id: r.account_id, data: r }))} pageSize={pageSize} dense
        defaultSort={{ key: 'bal', dir: 'desc' }} onRowClick={compact ? undefined : (r) => setOpen(r)} selected={(r) => r.account_id === open?.account_id} />
      {open && !compact && (
        <aside className="acct-panel" aria-label="Account summary">
          <header><b className="mono">{open.account_id}</b><button type="button" className="link" onClick={() => setOpen(null)}>Close</button></header>
          <dl className="kv">
            {Object.entries({
              Hospital: open.facility, Payer: open.payer, 'Financial class': open.financial_class, 'Service line': open.service_line,
              Discharged: open.discharge_date, 'Days since discharge': String(open.days_since_discharge), Charges: usdFull(open.gross_charges),
              Balance: usdFull(open.balance), Status: open.status, 'Denial root cause': open.denial_root_cause ?? 'None', 'Last activity': open.last_activity,
            }).map(([k, v]) => <div key={k} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className="muted small">In production this panel links to the account in the patient accounting system (role-based access, audit-logged). The prototype holds no patient data.</p>
        </aside>
      )}
    </div>
  );
}

export function AccountDetail() {
  const { route, engine, period, sel, valueLabel, go } = useApp();
  const mode = (['open', 'denied', 'dnfb'].includes(route.params.mode) ? route.params.mode : 'open') as Mode;
  const day = mode === 'denied' ? period.endDay : engine.snapshotDayOnOrBefore('ar', period.endDay) ?? period.endDay;
  const rows = useMemo(() => accounts(engine, { mode, day, start: period.startDay, arAge: sel.arAge, accountStatus: sel.accountStatus }, sel, 2000), [engine, mode, day, period.startDay, sel]);
  const total = rows.reduce((a, r) => a + r.balance, 0);
  const avgAge = rows.length ? rows.reduce((a, r) => a + r.days_since_discharge, 0) / rows.length : null;
  const filters = (Object.keys(sel) as (keyof typeof sel)[]).filter((f) => sel[f]?.length)
    .map((f) => `${DIMENSION_LABEL[f]}: ${sel[f]!.map((k) => valueLabel(f, k)).join(', ')}`);
  return (
    <div className="page">
      <CanvasHeader title={MODE_LABEL[mode]} question={mode === 'denied' ? `Claims denied in ${period.label}, largest first.` : `Accounts open at ${period.short} month end, largest balance first.`}
        right={<button type="button" className="btn btn-sm btn-primary" onClick={() => go(WORKLIST_FOR[mode], {}, { drill: true })}>Open the {mode === 'denied' ? 'Denials' : mode === 'dnfb' ? 'DNFB' : 'A/R'} worklist ›</button>} />
      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi static"><div className="kpi-top"><span className="kpi-name">Accounts (sample)</span></div><div className="kpi-value">{rows.length.toLocaleString('en-US')}</div><div className="kpi-row muted small">≈ {(rows.length * engine.weight).toLocaleString('en-US')} accounts in full population</div></div>
        <div className="kpi static"><div className="kpi-top"><span className="kpi-name">{mode === 'denied' ? 'Denied charges (sample)' : 'Open balance (sample)'}</span></div><div className="kpi-value">{usd(total)}</div></div>
        <div className="kpi static"><div className="kpi-top"><span className="kpi-name">Average days from discharge</span></div><div className="kpi-value">{fmt(avgAge, 'days', 0)}</div></div>
        <div className="kpi static"><div className="kpi-top"><span className="kpi-name">Filters applied</span></div><div className="kpi-row small">{filters.length ? filters.join(' · ') : 'None (all accounts)'}</div></div>
      </div>
      <Visual title={MODE_LABEL[mode]} subtitle="Sorted by balance · click a row for the account summary · columns sort"
        table={gridExport(COLS, rows.map((r) => ({ id: r.account_id, data: r })))}
        noData={rows.length ? null : 'No accounts match the current filters.'}
        info="The prototype stores a 1-in-10 sample of accounts, so this list shows sampled accounts. Aggregate measures elsewhere are scaled to the full population. In production this list is the full set, paged from the data service."
        spec={{ type: 'Detail table (paged, sortable, row detail panel)', dimensions: ['Account'], interactions: 'Sort, page, row click opens summary; export respects filters' }}>
        <AccountsTable rows={rows} />
      </Visual>
    </div>
  );
}
