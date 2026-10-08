// Worklists ("Act"): what specifically needs to be worked. Operational, table-first screens for
// denials, insurance A/R follow-up and DNFB. They answer "what do I work next?", not "what is
// happening?", so they have queues, search, facets, priority, ownership, status, bulk actions
// and a row detail panel instead of charts.
//
// Context from Analytics (hospital, payer, denial category, aging bucket, hold reason ...) arrives
// through the shared filters, so a drill path ends on exactly the items behind the finding.

import { useMemo, useState } from 'react';
import type { SelField } from '../engine/engine';
import { fmtDate, usd, usdFull } from '../format';
import type { WorkItem, WorklistKind } from '../services/contracts';
import { ALL_ASSIGNEES, CURRENT_USER, PRIORITY_RULES, STATUS_OPTIONS, WORKLIST_LABEL, worklist } from '../services/worklists';
import { FIELD_LABEL, useApp, type PageId, type WorkEdit } from '../state/AppState';
import { InfoIcon } from '../ui/common';
import { Grid, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { Crumbs } from '../ui/Shell';
import { downloadCsv } from '../ui/Visual';

type Queue = 'open' | 'mine' | 'unassigned' | 'high' | 'urgent' | 'resolved';

const URGENT: Record<WorklistKind, { label: string; test: (r: WorkItem) => boolean }> = {
  denials: { label: 'Deadline ≤ 14 days', test: (r) => r.days_to_deadline !== null && r.days_to_deadline >= 0 && r.days_to_deadline <= 14 },
  ar: { label: 'No activity 30+ days', test: (r) => r.last_activity_days >= 30 },
  dnfb: { label: 'Unbilled 7+ days', test: (r) => r.age >= 7 },
};

/** Context fields that apply to each worklist (shown as chips, set from Analytics). */
const CONTEXT_FIELDS: Record<WorklistKind, SelField[]> = {
  denials: ['region', 'facilityType', 'facility', 'financialClass', 'payer', 'patientType', 'serviceLine', 'denialCategory', 'rootCause'],
  ar: ['region', 'facilityType', 'facility', 'financialClass', 'payer', 'patientType', 'serviceLine', 'arAge', 'accountStatus'],
  dnfb: ['region', 'facilityType', 'facility', 'patientType', 'serviceLine', 'dnfbHold'],
};
const ANALYSIS_PAGE: Record<WorklistKind, PageId> = { denials: 'denials', ar: 'ar', dnfb: 'billing' };

interface Facets { facility: string; payer: string; category: string; priority: string; status: string; assignee: string }
const NO_FACETS: Facets = { facility: '', payer: '', category: '', priority: '', status: '', assignee: '' };

export function Worklist({ kind }: { kind: WorklistKind }) {
  const { engine, sel, ds, workEdits, editWork, toast, go } = useApp();
  const L = WORKLIST_LABEL[kind];
  const base = useMemo(() => worklist(engine, { kind, day: ds.meta.asOfDay }, sel), [engine, kind, sel, ds]);
  const items = useMemo(() => base.map((r) => applyEdit(r, workEdits[r.id])), [base, workEdits]);
  const [queue, setQueue] = useState<Queue>('open');
  const [q, setQ] = useState('');
  const [facets, setFacets] = useState<Facets>(NO_FACETS);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const inQueue = (r: WorkItem, k: Queue) => {
    if (k === 'resolved') return r.status === 'Resolved';
    if (r.status === 'Resolved') return false;
    if (k === 'mine') return r.assignee === CURRENT_USER;
    if (k === 'unassigned') return !r.assignee;
    if (k === 'high') return r.priority === 'High';
    if (k === 'urgent') return URGENT[kind].test(r);
    return true;
  };
  const queues: { k: Queue; label: string }[] = [
    { k: 'open', label: 'All open' }, { k: 'mine', label: 'My queue' }, { k: 'unassigned', label: 'Unassigned' },
    { k: 'high', label: 'High priority' }, { k: 'urgent', label: URGENT[kind].label }, { k: 'resolved', label: 'Resolved' },
  ];
  const counts = useMemo(() => Object.fromEntries(queues.map((x) => [x.k, items.filter((r) => inQueue(r, x.k)).length])), [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => inQueue(r, queue)
      && (!facets.facility || r.facility === facets.facility) && (!facets.payer || r.payer === facets.payer)
      && (!facets.category || r.category === facets.category) && (!facets.priority || r.priority === facets.priority)
      && (!facets.status || r.status === facets.status)
      && (!facets.assignee || (facets.assignee === '(Unassigned)' ? !r.assignee : r.assignee === facets.assignee))
      && (!needle || [r.account, r.claim, r.facility, r.payer, r.category, r.reason, r.assignee, r.next_action, r.status].some((x) => x?.toLowerCase().includes(needle))));
  }, [items, queue, facets, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = shown.reduce((a, r) => a + r.amount, 0);
  const open = openId ? items.find((r) => r.id === openId) ?? null : null;
  const options = (f: (r: WorkItem) => string | null) => [...new Set(items.map(f).filter((x): x is string => !!x))].sort();
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)));
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = (patch: WorkEdit, msg: string) => {
    const ids = [...checked];
    editWork(ids, patch);
    toast(`${msg} for ${ids.length} ${L.item}. Prototype: saved in this browser only.`);
    setChecked(new Set());
  };
  const filtersOn = q || Object.values(facets).some(Boolean);

  const cols = columns(kind, { checked, toggle, allChecked, toggleAll });
  const doExport = () => {
    const c = cols.filter((x) => x.key !== 'sel');
    downloadCsv(L.title, { columns: c.map((x) => x.text ?? String(x.label)), rows: shown.map((r) => c.map((x) => { const v = x.exportText ? x.exportText(r) : x.value(r); return v ?? ''; })) },
      [['Queue', queues.find((x) => x.k === queue)!.label], ['As of', fmtDate(ds.meta.asOfDay)]]);
    toast(`Exported ${shown.length} ${L.item}.`);
  };

  return (
    <div className="wl">
      <header className="wl-head">
        <div>
          <Crumbs />
          <h1>{L.title}</h1>
          <p className="question">{L.question} <span className="muted">Open items as of {fmtDate(ds.meta.asOfDay)}.</span></p>
        </div>
        <div className="wl-head-right">
          <span className="wl-rules">Priority rules <InfoIcon title="How priority is set" text={<>{PRIORITY_RULES[kind].map((t) => <span key={t} className="info-row">{t}</span>)}<span className="info-row muted small">Rules are configuration. Within a priority, larger amounts come first.</span></>} /></span>
          <button type="button" className="btn btn-sm" onClick={() => go(ANALYSIS_PAGE[kind], {}, { drill: true })}><Icon name="chart" size={12} /> Analyze these</button>
          <button type="button" className="btn btn-sm" onClick={doExport}><Icon name="download" size={12} /> Export</button>
        </div>
      </header>

      <ContextBar kind={kind} />

      <div className="wl-queues" role="tablist" aria-label="Queues">
        {queues.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={queue === x.k} className={`wl-queue ${queue === x.k ? 'on' : ''} ${x.k === 'high' || x.k === 'urgent' ? 'hot' : ''}`} onClick={() => { setQueue(x.k); setChecked(new Set()); }}>
            {x.label}<span className="wl-count">{counts[x.k].toLocaleString('en-US')}</span>
          </button>
        ))}
      </div>

      <div className="wl-toolbar">
        <span className="search-inline wl-search"><Icon name="search" size={12} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search account, payer, reason, owner…`} aria-label="Search the worklist" />
        </span>
        <Facet label="Hospital" value={facets.facility} options={options((r) => r.facility)} onChange={(v) => setFacets({ ...facets, facility: v })} />
        {kind !== 'dnfb' && <Facet label="Payer" value={facets.payer} options={options((r) => r.payer)} onChange={(v) => setFacets({ ...facets, payer: v })} />}
        <Facet label={kind === 'denials' ? 'Category' : kind === 'ar' ? 'Account status' : 'DNFB reason'} value={facets.category} options={options((r) => r.category)} onChange={(v) => setFacets({ ...facets, category: v })} />
        <Facet label="Priority" value={facets.priority} options={['High', 'Medium', 'Low']} onChange={(v) => setFacets({ ...facets, priority: v })} />
        <Facet label="Status" value={facets.status} options={STATUS_OPTIONS[kind]} onChange={(v) => setFacets({ ...facets, status: v })} />
        <Facet label={kind === 'dnfb' ? 'Owner' : 'Assigned to'} value={facets.assignee} options={['(Unassigned)', ...options((r) => r.assignee)]} onChange={(v) => setFacets({ ...facets, assignee: v })} />
        {filtersOn && <button type="button" className="link" onClick={() => { setQ(''); setFacets(NO_FACETS); }}>Reset</button>}
        <span className="wl-total"><b>{shown.length.toLocaleString('en-US')}</b> {L.item} · <b>{usd(total)}</b></span>
      </div>

      {checked.size > 0 && (
        <div className="wl-bulk" role="region" aria-label="Bulk actions">
          <b>{checked.size} selected</b>
          <button type="button" className="btn btn-sm" onClick={() => bulk({ assignee: CURRENT_USER }, 'Assigned to you')}>Assign to me</button>
          <select className="sel-xs" value="" onChange={(e) => e.target.value && bulk({ assignee: e.target.value === '(Unassigned)' ? null : e.target.value }, `Assigned to ${e.target.value}`)} aria-label="Assign selected to">
            <option value="">Assign to…</option>
            {['(Unassigned)', ...ALL_ASSIGNEES].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="sel-xs" value="" onChange={(e) => e.target.value && bulk({ status: e.target.value }, `Status set to "${e.target.value}"`)} aria-label="Set status of selected">
            <option value="">Set status…</option>
            {STATUS_OPTIONS[kind].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="link" onClick={() => setChecked(new Set())}>Clear selection</button>
        </div>
      )}

      <div className={`wl-main ${open ? 'with-panel' : ''}`}>
        <div className="wl-table">
          <Grid caption={L.title} columns={cols} rows={shown.map((r) => ({ id: r.id, data: r }))} pageSize={50} dense
            selected={(r) => r.id === openId} onRowClick={(r) => setOpenId(r.id === openId ? null : r.id)}
            footnote={<>Prototype lists a 1-in-10 sample of accounts; dollar amounts are per account. Assignee, status and next action are simulated.</>} />
        </div>
        {open && <ItemPanel item={open} kind={kind} onClose={() => setOpenId(null)} />}
      </div>
    </div>
  );
}

function applyEdit(r: WorkItem, e?: WorkEdit): WorkItem {
  if (!e) return r;
  return { ...r, assignee: e.assignee !== undefined ? e.assignee : r.assignee, status: e.status ?? r.status };
}

function Facet({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className={`wl-facet ${value ? 'on' : ''}`}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** The analysis context this worklist inherits (from a drill path or the Analytics filters). */
function ContextBar({ kind }: { kind: WorklistKind }) {
  const { sel, valueLabel, clearField, trail, back } = useApp();
  const fields = CONTEXT_FIELDS[kind].filter((f) => (sel[f]?.length ?? 0) > 0);
  const ignored = (Object.keys(sel) as SelField[]).filter((f) => (sel[f]?.length ?? 0) > 0 && !CONTEXT_FIELDS[kind].includes(f));
  if (!fields.length && !ignored.length) return null;
  const from = trail[trail.length - 1];
  return (
    <div className="wl-context" role="region" aria-label="Context from Analytics">
      <span className="wl-context-lead"><Icon name="filter" size={12} /> Context from Analytics</span>
      {fields.map((f) => (
        <span key={f} className="applied-chip">
          <span className="chip-field">{FIELD_LABEL[f]}</span>
          <span className="chip-val static">{sel[f]!.length <= 2 ? sel[f]!.map((k) => valueLabel(f, k)).join(', ') : `${sel[f]!.length} values`}</span>
          <button type="button" className="chip-x" aria-label={`Remove ${FIELD_LABEL[f]}`} onClick={() => clearField(f)}><Icon name="close" size={9} /></button>
        </span>
      ))}
      {ignored.length > 0 && <span className="muted small">Not applied here: {ignored.map((f) => FIELD_LABEL[f]).join(', ')}</span>}
      <button type="button" className="link" onClick={() => fields.forEach(clearField)}>Clear context</button>
      {from && <button type="button" className="link wl-context-back" onClick={back}><Icon name="back" size={11} /> Back to analysis</button>}
    </div>
  );
}

// ---------------------------------------------------------------- columns

const PRI_CLASS = { High: 'pri-high', Medium: 'pri-med', Low: 'pri-low' } as const;

function Assignee({ name }: { name: string | null }) {
  if (!name) return <span className="wl-unassigned">Unassigned</span>;
  const ini = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return <span className="wl-person"><span className={`wl-avatar ${name === CURRENT_USER ? 'me' : ''}`} aria-hidden="true">{ini}</span>{name}{name === CURRENT_USER ? <span className="muted"> (you)</span> : null}</span>;
}

function columns(kind: WorklistKind, s: { checked: Set<string>; toggle: (id: string) => void; allChecked: boolean; toggleAll: () => void }): GridColumn<WorkItem>[] {
  const L = WORKLIST_LABEL[kind];
  const sel: GridColumn<WorkItem> = {
    key: 'sel', text: 'Select', sortable: false, width: 28, align: 'center', value: () => null, exportText: () => '',
    label: <input type="checkbox" checked={s.allChecked} onChange={s.toggleAll} aria-label="Select all items in this view" />,
    render: (r) => <input type="checkbox" checked={s.checked.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => s.toggle(r.id)} aria-label={`Select ${r.account}`} />,
  };
  const pri: GridColumn<WorkItem> = { key: 'pri', label: 'Priority', value: (r) => r.priority_rank * 1e9 + r.amount, align: 'left', width: 78,
    render: (r) => <span className={`wl-pri ${PRI_CLASS[r.priority]}`} title={r.priority_why}>{r.priority}</span>, exportText: (r) => r.priority };
  const acct: GridColumn<WorkItem> = { key: 'acct', label: kind === 'denials' ? 'Claim' : 'Account', value: (r) => r.account, align: 'left',
    render: (r) => <span className="mono" title={r.claim ? `Claim ${r.claim} · account ${r.account}` : undefined}>{r.claim ?? r.account}</span>, exportText: (r) => (r.claim ? `${r.claim} / ${r.account}` : r.account) };
  const fac: GridColumn<WorkItem> = { key: 'fac', label: 'Hospital', value: (r) => r.facility, align: 'left' };
  const payer: GridColumn<WorkItem> = { key: 'payer', label: 'Payer', value: (r) => r.payer, align: 'left', render: (r) => <span className="wl-trunc" title={r.payer}>{r.payer}</span> };
  const amt: GridColumn<WorkItem> = { key: 'amt', label: L.amount, value: (r) => r.amount, format: (v) => <b>{usdFull(v ?? 0)}</b>, exportText: (r) => Math.round(r.amount) };
  const age: GridColumn<WorkItem> = { key: 'age', label: kind === 'denials' ? 'Age' : kind === 'ar' ? 'Age' : 'Days in DNFB', text: L.age, value: (r) => r.age, heat: 'high', info: L.age };
  const status: GridColumn<WorkItem> = { key: 'status', label: 'Status', value: (r) => r.status, align: 'left', render: (r) => <span className={`wl-status ${r.status === 'New' ? 'new' : r.status === 'Resolved' ? 'done' : ''}`}>{r.status}</span> };
  const who: GridColumn<WorkItem> = { key: 'who', label: kind === 'dnfb' ? 'Owner' : 'Assigned to', value: (r) => r.assignee ?? '', align: 'left', render: (r) => <Assignee name={r.assignee} /> };
  const next: GridColumn<WorkItem> = { key: 'next', label: 'Next action', value: (r) => r.next_action, align: 'left', render: (r) => <span className="wl-next">{r.next_action}</span> };
  if (kind === 'denials') return [sel, pri, acct, fac, payer,
    { key: 'cat', label: 'Denial category', value: (r) => r.category, align: 'left' },
    { key: 'reason', label: 'Denial reason', value: (r) => r.reason, align: 'left', render: (r) => <span className="wl-reason" title={r.reason ?? ''}>{r.reason}{r.recoverable === false && <span className="muted"> · non-recoverable</span>}</span> },
    amt, age,
    { key: 'due', label: 'Appeal due', value: (r) => r.days_to_deadline, info: 'Days until the appeal deadline. Deadlines use illustrative limits by financial class; real limits come from payer contracts.',
      render: (r) => (r.days_to_deadline === null ? <span className="muted">{r.status === 'Appeal submitted' ? 'Appealed' : '–'}</span> : r.days_to_deadline < 0 ? <span className="txt-off">Past due</span> : <span className={r.days_to_deadline <= 14 ? 'txt-off' : ''}>{r.days_to_deadline} d</span>),
      exportText: (r) => r.days_to_deadline ?? '' },
    status, who, next];
  if (kind === 'ar') return [sel, pri, acct, fac, payer, amt, age,
    { key: 'bucket', label: 'Aging bucket', value: (r) => r.age, align: 'left', render: (r) => r.aging_bucket, exportText: (r) => r.aging_bucket ?? '' },
    { key: 'last', label: 'Last activity', value: (r) => r.last_activity_days, render: (r) => <span className={r.last_activity_days >= 30 ? 'txt-watch' : ''}>{r.last_activity_days} d ago</span>, exportText: (r) => r.last_activity },
    { key: 'exp', label: 'Expected payment', value: (r) => r.expected, format: (v) => usdFull(v ?? 0), exportText: (r) => Math.round(r.expected ?? 0) },
    status, who, next];
  return [sel, pri, acct, fac, amt, age,
    { key: 'reason', label: 'DNFB reason', value: (r) => r.reason, align: 'left' },
    { key: 'dept', label: 'Department', value: (r) => r.department, align: 'left' },
    who, status, next];
}

// ---------------------------------------------------------------- detail panel

function ItemPanel({ item, kind, onClose }: { item: WorkItem; kind: WorklistKind; onClose: () => void }) {
  const { editWork, workEdits, toast, go, selectOnly } = useApp();
  const [note, setNote] = useState('');
  const notes = workEdits[item.id]?.notes ?? [];
  const L = WORKLIST_LABEL[kind];
  const set = (patch: WorkEdit, msg: string) => { editWork([item.id], patch); toast(`${msg}. Prototype: saved in this browser only.`); };
  const kv: [string, string][] = [
    ...(item.claim ? [['Claim', item.claim] as [string, string]] : []),
    ['Hospital', item.facility], ['Payer', `${item.payer} (${item.financial_class})`], ['Service line', `${item.service_line} · ${item.department}`],
    ['Discharged', item.discharge_date], [L.amount, usdFull(item.amount)],
    ...(item.expected !== null ? [[kind === 'dnfb' ? 'Expected reimbursement' : 'Expected payment', usdFull(item.expected)] as [string, string]] : []),
    [L.age, String(item.age)],
    ...(kind === 'denials' ? [['Denial category', item.category ?? ''], ['Denial reason', item.reason ?? ''], ['Recoverable', item.recoverable ? 'Yes' : 'No'], ['Appeal deadline', item.deadline ?? 'None']] as [string, string][] : []),
    ...(kind === 'ar' ? [['Aging bucket', item.aging_bucket ?? ''], ['Account status', item.category ?? '']] as [string, string][] : []),
    ...(kind === 'dnfb' ? [['DNFB reason', item.reason ?? ''], ['Owning team', item.team]] as [string, string][] : []),
    ['Last activity', item.last_activity],
  ];
  return (
    <aside className="wl-panel" aria-label={`Work item ${item.account}`}>
      <header>
        <div><b className="mono">{item.account}</b> <span className={`wl-pri ${PRI_CLASS[item.priority]}`}>{item.priority}</span></div>
        <button type="button" className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={12} /></button>
      </header>
      <div className="wl-panel-next">
        <span className="muted small">Next action</span>
        <b>{item.next_action}</b>
        <span className="muted small">Why {item.priority.toLowerCase()} priority: {item.priority_why}</span>
      </div>
      <div className="wl-panel-actions">
        <label>Status
          <select value={item.status} onChange={(e) => set({ status: e.target.value }, `Status set to "${e.target.value}"`)}>
            {[...new Set([item.status, ...STATUS_OPTIONS[kind]])].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>{kind === 'dnfb' ? 'Owner' : 'Assigned to'}
          <select value={item.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value || null }, e.target.value ? `Assigned to ${e.target.value}` : 'Unassigned')}>
            <option value="">Unassigned</option>
            {ALL_ASSIGNEES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        {item.assignee !== CURRENT_USER && <button type="button" className="btn btn-sm btn-primary" onClick={() => set({ assignee: CURRENT_USER }, 'Assigned to you')}>Assign to me</button>}
      </div>
      <dl className="kv">{kv.map(([k, v]) => <div key={k} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h4 className="wl-panel-h">Activity</h4>
      <ol className="wl-timeline">
        {[...item.timeline, ...notes.map((n) => ({ date: n.at, event: `Note: ${n.text}` }))].map((t, i) => <li key={i}><span className="muted">{t.date}</span>{t.event}</li>)}
      </ol>
      <div className="wl-note">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a work note" rows={2} aria-label="Work note" />
        <button type="button" className="btn btn-sm" disabled={!note.trim()} onClick={() => { editWork([item.id], { notes: [{ at: new Date().toISOString().slice(0, 10), text: note.trim() }] }); setNote(''); toast('Note added. Prototype: saved in this browser only.'); }}>Add note</button>
      </div>
      <div className="wl-panel-links">
        <button type="button" className="link" onClick={() => { selectOnly('facility', [item.facility_key]); go('facility', { id: String(item.facility_key) }, { drill: true }); }}>Hospital profile ›</button>
        <button type="button" className="link" onClick={() => toast('In production this opens the account in the patient accounting system (role-based access, audit-logged).')}>Open in patient accounting ›</button>
      </div>
    </aside>
  );
}
