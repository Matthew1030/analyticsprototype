// PROTOTYPE ONLY. Account-level records are excluded from version 1.
// This list shows synthetic claim IDs and no patient fields. It is off by default.

import { useEffect, useMemo, useState } from 'react';
import { isoDay } from '../data/dates';
import { usdFull } from '../format';
import { useApp } from '../state/AppState';
import { Panel } from '../ui/common';
import { DataTable, tableToExport, type Column } from '../ui/DataTable';

interface ClaimRow { i: number }

export function ClaimList() {
  const { ds, period, sel, registerExport } = useApp();
  const c = ds.claims;
  const d = ds.dims;
  const [open, setOpen] = useState<number | null>(null);

  const rows: ClaimRow[] = useMemo(() => {
    const s = (k: keyof typeof sel) => (sel[k]?.length ? new Set(sel[k]) : null);
    const fac = s('facility'), pay = s('payer'), fc = s('financialClass'), svc = s('serviceLine');
    const den = s('denialCategory'), ed = s('editCategory'), wo = s('writeOffReason');
    const out: ClaimRow[] = [];
    for (let i = 0; i < c.n; i++) {
      if (c.dd[i] < period.startDay || c.dd[i] > period.endDay) continue;
      if (fac && !fac.has(c.fac[i])) continue;
      if (pay && !pay.has(c.payer[i])) continue;
      if (fc && !fc.has(d.payers[c.payer[i]].fc)) continue;
      if (svc && !svc.has(c.svc[i])) continue;
      if (den && !(c.denR[i] >= 0 && den.has(d.denialReasons[c.denR[i]].category))) continue;
      if (ed && !ed.has(c.edit[i])) continue;
      if (wo && !wo.has(c.woR[i])) continue;
      out.push({ i });
    }
    return out;
  }, [c, d, period, sel]);

  const date = (v: number) => (v < 0 ? '' : isoDay(v));
  const status = (i: number) => {
    if (c.closeD[i] >= 0) return c.woAmt[i] > 0 ? 'Written off' : c.bdAmt[i] > 0 ? 'Bad debt' : 'Paid';
    if (c.denD[i] >= 0) return 'Denied, open';
    if (c.sbd[i] >= 0) return 'Submitted, open';
    if (c.fbd[i] >= 0) return 'Billed, not submitted';
    return 'Not final billed';
  };
  const columns: Column<ClaimRow>[] = [
    { key: 'id', label: 'Claim ID (synthetic)', value: (r) => `CLM-${c.id[r.i]}` },
    { key: 'fac', label: 'Facility', value: (r) => d.facilities[c.fac[r.i]].name },
    { key: 'payer', label: 'Payer', value: (r) => d.payers[c.payer[r.i]].name },
    { key: 'svc', label: 'Service line', value: (r) => d.serviceLines[c.svc[r.i]].name },
    { key: 'dd', label: 'Discharge', value: (r) => date(c.dd[r.i]) },
    { key: 'gross', label: 'Gross charges', value: (r) => c.gross[r.i], align: 'right', text: (r) => usdFull(c.gross[r.i]) },
    { key: 'den', label: 'Denial reason', value: (r) => (c.denR[r.i] >= 0 ? d.denialReasons[c.denR[r.i]].name : '') },
    { key: 'status', label: 'Status', value: (r) => status(r.i) },
  ];

  useEffect(() => {
    registerExport({ title: `Claim list (prototype) ${period.label}`, ...tableToExport(columns, rows) });
    return () => registerExport(null);
  });

  const i = open;
  return (
    <div className="page">
      <div className="banner-warn" role="note">
        Prototype only. Version 1 does not show account-level records. All claims are synthetic and carry no patient identifiers.
      </div>
      <div className={i !== null ? 'grid-2 wide-left' : ''}>
        <Panel title={`Claims discharged in ${period.label}`} qlik="Table">
          <DataTable caption="Claim list" columns={columns} rows={rows} pageSize={15} onRowClick={(r) => setOpen(r.i)}
            rowClass={(r) => (r.i === open ? 'row-on' : '')} />
        </Panel>
        {i !== null && (
          <aside className="panel claim-panel" aria-label="Claim detail">
            <header className="panel-head">
              <h3>Claim CLM-{c.id[i]}</h3>
              <button type="button" className="btn-ghost" onClick={() => setOpen(null)} aria-label="Close claim detail">Close ✕</button>
            </header>
            <dl className="kv">
              {[
                ['Facility', d.facilities[c.fac[i]].name],
                ['Payer', d.payers[c.payer[i]].name],
                ['Financial class', d.financialClasses[d.payers[c.payer[i]].fc]],
                ['Service line', `${d.serviceLines[c.svc[i]].name} (${d.serviceLines[c.svc[i]].patientType})`],
                ['Discharge date', date(c.dd[i])],
                ['Final bill date', date(c.fbd[i]) || 'Not final billed'],
                ['Submit date', date(c.sbd[i]) || 'Not submitted'],
                ['DNFB hold reason', d.dnfbHolds[c.hold[i]].name],
                ['Gross charges', usdFull(c.gross[i])],
                ['Expected net revenue', usdFull(c.net[i])],
                ['Clean on first submission', c.clean[i] === 1 ? 'Yes' : c.clean[i] === 0 ? `No (${d.editCategories[c.edit[i]]?.name ?? 'edit'})` : '–'],
                ['Initial denial', c.denR[i] >= 0 ? `${d.denialReasons[c.denR[i]].name} on ${date(c.denD[i])}` : 'None'],
                ['Payments posted', c.payAmt[i] + c.pos[i] > 0 ? `${usdFull(c.payAmt[i] + c.pos[i])}${c.payD[i] >= 0 ? ` (last ${date(c.payD[i])})` : ''}` : 'None'],
                ['Denial write-off', c.woAmt[i] > 0 ? `${usdFull(c.woAmt[i])} (${d.writeOffReasons[c.woR[i]].name})` : 'None'],
                ['Bad debt transfer', c.bdAmt[i] > 0 ? usdFull(c.bdAmt[i]) : 'None'],
                ['Status', status(i)],
              ].map(([k, v]) => (
                <div key={k} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}
