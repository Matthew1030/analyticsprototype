// Worklist service: the operational layer. Builds the items a person works (open denied claims,
// insurance A/R to follow up, unbilled accounts) for the current context filters.
//
// Work fields that the source data does not carry (assignee, work status, next action) are
// derived by fixed rules or a deterministic hash of the account, so the prototype is stable
// between visits. In production they come from the work-queue / task system of record.
// Priority rules are in PRIORITY_RULES and are shown to users, so a priority is never a black box.

import { isoDay } from '../data/dates';
import type { Engine, Selections } from '../engine/engine';
import type { WorkItem, WorklistKind } from './contracts';
import { statusAt } from './analytics';

export const WORKLIST_KINDS: WorklistKind[] = ['denials', 'ar', 'dnfb'];

export const WORKLIST_LABEL: Record<WorklistKind, { title: string; tab: string; item: string; question: string; amount: string; age: string }> = {
  denials: { title: 'Denials worklist', tab: 'Denials', item: 'claims', question: 'Which denied claims do I appeal, correct or close today?', amount: 'Denied $', age: 'Days since denial' },
  ar: { title: 'A/R follow-up worklist', tab: 'A/R follow-up', item: 'accounts', question: 'Which insurance balances do I follow up today?', amount: 'Balance', age: 'Days since discharge' },
  dnfb: { title: 'DNFB worklist', tab: 'DNFB', item: 'accounts', question: 'Which unbilled accounts do I release today?', amount: 'DNFB $', age: 'Days in DNFB' },
};

/** Plain-language priority rules, shown in the worklist header. */
export const PRIORITY_RULES: Record<WorklistKind, string[]> = {
  denials: [
    'High: not yet appealed, and recoverable with expected reimbursement ≥ $2,500, or the appeal deadline is 14 days away or less.',
    'Medium: expected reimbursement ≥ $750, the appeal deadline is 30 days away or less, or an appeal ≥ $2,500 is waiting on the payer.',
    'Low: non-recoverable root causes and denials past the appeal deadline (review for write-off), and all other open denials.',
  ],
  ar: [
    'High: balance ≥ $10,000 and older than 60 days, or pended for records and older than 90 days.',
    'Medium: older than 90 days, or balance ≥ $5,000.',
    'Low: all other open insurance balances.',
  ],
  dnfb: [
    'High: unbilled 7+ days with ≥ $5,000, 4+ days with ≥ $25,000, or 4+ days with no owner.',
    'Medium: unbilled 4+ days, or ≥ $10,000.',
    'Low: other recent discharges. A routine bill hold under 7 days is never High.',
  ],
};

/**
 * Days allowed to appeal a denial, by financial class. Illustrative configuration only:
 * real limits differ by payer contract and plan, and must come from the client's payer setup.
 */
export const APPEAL_DAYS_BY_FC = [120, 60, 90, 60, 180, 90, null] as const;

/** Fictional staff. "Jordan Ellis" is the signed-in prototype user, so "My queue" has items. */
export const CURRENT_USER = 'Jordan Ellis';
const TEAMS: Record<string, string[]> = {
  'Patient Access': ['Nina Alvarez', 'Marcus Lee', CURRENT_USER],
  Billing: ['Owen Price', 'Carla Diaz', 'Victor Hale'],
  Coding: ['Priya Shah', 'Ben Carter'],
  'Clinical Documentation': ['Rachel Moore', 'Ian Fischer'],
  'Charge Capture': ['Eli Turner', 'Hannah Cole'],
  'A/R follow-up': ['Dana Whitfield', 'Luis Romero', 'Grace Kim', 'Sam Okafor', CURRENT_USER],
};
export const ALL_ASSIGNEES = [...new Set(Object.values(TEAMS).flat())].sort();

export const STATUS_OPTIONS: Record<WorklistKind, string[]> = {
  denials: ['New', 'In progress', 'Awaiting information', 'Corrected claim ready', 'Appeal submitted', 'Resolved'],
  ar: ['New', 'In progress', 'Pended: records requested', 'No payer response', 'Follow-up scheduled', 'Resolved'],
  dnfb: ['New', 'In progress', 'Waiting on physician', 'Waiting on department', 'Ready to bill', 'Resolved'],
};

const DENIAL_ACTION: Record<string, string> = {
  Eligibility: 'Verify coverage and rebill',
  Authorization: 'Request retro-authorization',
  'Medical necessity': 'Prepare clinical appeal',
  Coding: 'Coding review and corrected claim',
  Documentation: 'Send records for CDI review',
  'Coordination of benefits': 'Obtain primary EOB and update COB',
  'Duplicate claim': 'Confirm original claim status',
  'Timely filing': 'Appeal with proof of timely filing',
  'Missing information / records': 'Submit requested information',
};

const DNFB_ACTION = [
  'Release after bill hold',
  'Code the account',
  'Follow up physician query',
  'Reconcile charges',
  'Complete registration',
  'Resolve billing edit',
  'Assign an owner',
];

/** Deterministic 0–1 value per account and purpose. */
function hash(id: number, salt: number): number {
  let x = (id * 2654435761 + salt * 40503) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0;
  return (x % 10000) / 10000;
}

const pick = <T,>(list: readonly T[], h: number): T => list[Math.min(list.length - 1, Math.floor(h * list.length))];
const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 } as const;

function priority(p: WorkItem['priority'], why: string) {
  return { priority: p, priority_rank: PRIORITY_RANK[p], priority_why: why };
}

export interface WorklistQuery { kind: WorklistKind; day: number }

/** The open work items for the context filters, highest priority and amount first. */
export function worklist(e: Engine, q: WorklistQuery, sel: Selections): WorkItem[] {
  if (q.kind === 'denials') return denialItems(e, q.day, sel);
  if (q.kind === 'ar') return arItems(e, q.day, sel);
  return dnfbItems(e, q.day, sel);
}

function common(e: Engine, i: number) {
  const c = e.ds.acc;
  const d = e.ds.dims;
  const svc = d.serviceLines[c.svc[i]];
  return {
    account: `A${Math.round(c.id[i])}`,
    facility_key: c.fac[i], facility: d.facilities[c.fac[i]].short,
    payer_key: c.payer[i], payer: d.payers[c.payer[i]].name, financial_class: d.financialClasses[c.fc[i]],
    service_line: svc.name, department: svc.department, discharge_date: isoDay(c.dd[i]),
  };
}

function sortItems(items: WorkItem[]) {
  return items.sort((a, b) => b.priority_rank - a.priority_rank || b.amount - a.amount);
}

function denialItems(e: Engine, day: number, sel: Selections): WorkItem[] {
  const c = e.ds.acc;
  const d = e.ds.dims;
  const idx = e.accountsByDate('denD', day - 730, day, sel, 'denial');
  const out: WorkItem[] = [];
  for (const i of idx) {
    if (c.payD[i] !== -1 && c.payD[i] <= day) continue; // paid or overturned
    if (c.woD[i] !== -1 && c.woD[i] <= day) continue; // written off
    const id = Math.round(c.id[i]);
    const rc = d.rootCauses[c.rc[i]];
    const cat = d.denialCategories[rc.category];
    const age = day - c.denD[i];
    const limit = APPEAL_DAYS_BY_FC[c.fc[i]];
    const toDeadline = limit === null ? null : c.denD[i] + limit - day;
    const appealDay = c.apl[i] ? Math.min(day, c.denD[i] + 6 + Math.floor(hash(id, 1) * 20)) : -1;
    const appealed = appealDay !== -1 && appealDay <= day && age > 5;
    const pastDeadline = toDeadline !== null && toDeadline < 0 && !appealed;
    const team = cat.owner;
    const h = hash(id, 2);
    const status = appealed ? 'Appeal submitted' : age <= 3 ? 'New' : pick(['In progress', 'In progress', 'Awaiting information', 'Corrected claim ready'], h);
    const unassigned = (status === 'New' && hash(id, 3) < 0.6) || hash(id, 4) < 0.06;
    const net = c.denNet[i];
    const p = pastDeadline
      ? priority('Low', 'Past the appeal deadline: review for write-off.')
      : appealed
        ? priority(net >= 2500 ? 'Medium' : 'Low', 'Appeal submitted: follow up with the payer.')
      : !rc.recoverable
        ? priority('Low', 'Root cause is not usually recoverable: review for write-off.')
      : (rc.recoverable && net >= 2500) || (toDeadline !== null && toDeadline <= 14)
        ? priority('High', toDeadline !== null && toDeadline <= 14 ? `Appeal deadline in ${toDeadline} days.` : 'Recoverable, expected reimbursement ≥ $2,500.')
        : net >= 750 || (toDeadline !== null && toDeadline <= 30)
          ? priority('Medium', toDeadline !== null && toDeadline <= 30 ? `Appeal deadline in ${toDeadline} days.` : 'Expected reimbursement ≥ $750.')
          : priority('Low', 'Lower value, deadline more than 30 days away.');
    const last = Math.max(c.denD[i], appealed ? appealDay : -1, day - Math.floor(hash(id, 5) * Math.min(age, 12)));
    out.push({
      id: `D${id}`, kind: 'denials', ...common(e, i),
      claim: `C${id + 9_000_000}`,
      amount: c.denAmt[i], expected: net, age,
      aging_bucket: null,
      category: cat.name, reason: rc.name, recoverable: rc.recoverable,
      deadline: limit === null ? null : isoDay(c.denD[i] + limit), days_to_deadline: appealed ? null : toDeadline,
      last_activity: isoDay(last), last_activity_days: day - last,
      ...p,
      status, assignee: unassigned ? null : pick(TEAMS[team] ?? TEAMS.Billing, hash(id, 6)), team,
      next_action: pastDeadline ? 'Review for write-off' : appealed ? 'Follow up on appeal' : rc.recoverable ? DENIAL_ACTION[cat.name] ?? 'Review denial' : 'Review for write-off',
      timeline: [
        { date: isoDay(c.dd[i]), event: 'Discharged' },
        ...(c.fbd[i] !== -1 ? [{ date: isoDay(c.fbd[i]), event: 'Final billed' }] : []),
        ...(c.sbd[i] !== -1 ? [{ date: isoDay(c.sbd[i]), event: `Claim submitted to ${d.payers[c.payer[i]].name}` }] : []),
        { date: isoDay(c.denD[i]), event: `Denied: ${rc.name}` },
        ...(appealed ? [{ date: isoDay(appealDay), event: 'Appeal submitted' }] : []),
      ],
    });
  }
  return sortItems(out);
}

function arItems(e: Engine, day: number, sel: Selections): WorkItem[] {
  const c = e.ds.acc;
  const d = e.ds.dims;
  const ages = sel.arAge?.length ? sel.arAge.map((k) => d.arAge[k]) : null;
  const idx = e.openAccounts(day, sel, (i) => c.fc[i] !== 6 && c.sbd[i] !== -1 && c.sbd[i] <= day);
  const out: WorkItem[] = [];
  for (const i of idx) {
    const st = statusAt(e, i, day);
    if (st !== 2 && st !== 5) continue; // denied claims live on the denials worklist
    if (sel.accountStatus?.length && !sel.accountStatus.includes(st)) continue;
    const age = day - c.dd[i];
    if (ages && !ages.some((b) => age >= b.min && age <= b.max)) continue;
    const cash = c.pos[i] + (c.payD[i] !== -1 && c.payD[i] <= day ? c.payAmt[i] : 0);
    const balance = Math.max(0, c.gross[i] - cash);
    if (balance <= 0) continue;
    const id = Math.round(c.id[i]);
    const bucket = d.arAge.find((b) => age >= b.min && age <= b.max)?.name ?? '';
    const sinceSubmit = day - c.sbd[i];
    const lastDay = Math.max(c.sbd[i], day - Math.floor(hash(id, 7) * Math.min(sinceSubmit, 60)));
    const quiet = day - lastDay;
    const pended = st === 5;
    const status = pended ? 'Pended: records requested' : sinceSubmit <= 7 ? 'New' : quiet > 30 ? 'No payer response' : pick(['In progress', 'Follow-up scheduled'], hash(id, 8));
    const p = (balance >= 10000 && age > 60) || (pended && age > 90)
      ? priority('High', pended && age > 90 ? 'Pended for records, older than 90 days.' : 'Balance ≥ $10,000, older than 60 days.')
      : age > 90 || balance >= 5000
        ? priority('Medium', age > 90 ? 'Older than 90 days.' : 'Balance ≥ $5,000.')
        : priority('Low', 'Recent, lower balance.');
    out.push({
      id: `R${id}`, kind: 'ar', ...common(e, i),
      claim: `C${id + 9_000_000}`,
      amount: balance, expected: Math.max(0, c.net[i] - cash), age, aging_bucket: bucket,
      category: d.accountStatus[st], reason: null, recoverable: null, deadline: null, days_to_deadline: null,
      last_activity: isoDay(lastDay), last_activity_days: quiet,
      ...p,
      status, assignee: hash(id, 9) < 0.1 ? null : pick(TEAMS['A/R follow-up'], hash(id, 10)), team: 'A/R follow-up',
      next_action: pended ? 'Send requested medical records' : age > 120 ? 'Escalate to payer representative' : quiet > 30 ? 'Call payer for claim status' : 'Check claim status on payer portal',
      timeline: [
        { date: isoDay(c.dd[i]), event: 'Discharged' },
        ...(c.fbd[i] !== -1 ? [{ date: isoDay(c.fbd[i]), event: 'Final billed' }] : []),
        { date: isoDay(c.sbd[i]), event: `Claim submitted to ${d.payers[c.payer[i]].name}` },
        ...(pended ? [{ date: isoDay(Math.min(day, c.sbd[i] + 30)), event: 'Payer pended claim: medical records requested' }] : []),
        ...(lastDay > c.sbd[i] ? [{ date: isoDay(lastDay), event: 'Last follow-up' }] : []),
      ],
    });
  }
  return sortItems(out);
}

function dnfbItems(e: Engine, day: number, sel: Selections): WorkItem[] {
  const c = e.ds.acc;
  const d = e.ds.dims;
  const holds = sel.dnfbHold?.length ? new Set(sel.dnfbHold) : null;
  const idx = e.openAccounts(day, sel, (i) => c.fbd[i] === -1 || c.fbd[i] > day);
  const out: WorkItem[] = [];
  for (const i of idx) {
    const hold = c.hold[i];
    if (holds && !holds.has(hold)) continue;
    const id = Math.round(c.id[i]);
    const h = d.dnfbHolds[hold];
    const days = day - c.dd[i];
    const amount = c.gross[i];
    const unowned = hold === 6;
    const status = unowned || days <= 1 ? 'New' : hold === 2 ? 'Waiting on physician' : hold === 3 || hold === 4 ? pick(['In progress', 'Waiting on department'], hash(id, 11)) : 'In progress';
    const p = hold === 0 && days < 7
      ? priority(amount >= 10000 ? 'Medium' : 'Low', 'Routine bill hold: releases on schedule.')
      : (days >= 7 && amount >= 5000) || (days >= 4 && amount >= 25000) || (unowned && days >= 4)
      ? priority('High', unowned && days >= 4 ? 'No owner, unbilled 4+ days.' : `Unbilled ${days} days, ≥ ${amount >= 25000 ? '$25,000' : '$5,000'}.`)
      : days >= 4 || amount >= 10000
        ? priority('Medium', days >= 4 ? 'Unbilled 4+ days.' : 'DNFB ≥ $10,000.')
        : priority('Low', hold === 0 ? 'Routine bill hold.' : 'Recent discharge.');
    const codeDone = c.codeD[i] !== -1 && c.codeD[i] <= day;
    const last = Math.max(c.dd[i], codeDone ? c.codeD[i] : -1);
    out.push({
      id: `U${id}`, kind: 'dnfb', ...common(e, i),
      claim: null,
      amount, expected: c.net[i], age: days, aging_bucket: d.dnfbAge.find((b) => days >= b.min && days <= b.max)?.name ?? null,
      category: h.name, reason: h.name, recoverable: null, deadline: null, days_to_deadline: null,
      last_activity: isoDay(last), last_activity_days: day - last,
      ...p,
      status, assignee: unowned ? null : pick(TEAMS[h.owner] ?? TEAMS.Billing, hash(id, 12)), team: h.owner,
      next_action: DNFB_ACTION[hold] ?? 'Review account',
      timeline: [
        { date: isoDay(c.dd[i]), event: 'Discharged' },
        ...(codeDone ? [{ date: isoDay(c.codeD[i]), event: 'Coding complete' }] : []),
        { date: isoDay(day), event: `On hold: ${h.name}` },
      ],
    });
  }
  return sortItems(out);
}
