// Page layout parts shared by the analytical pages.
// TabBox: a tabbed container (one object in a BI tool) whose open tab is kept in the URL, so Back
// from a drill-through returns to the same tab. Band: the numbered section heading of the standard
// stage-page layout (Performance → Trend → Where → Why → Act), so every page reads in the same order.

import { Fragment, useMemo, type ReactNode } from 'react';
import type { Engine, Selections } from '../engine/engine';
import { evaluate, METRIC_BY_ID } from '../engine/metrics';
import type { Period } from '../engine/periods';
import { statusOf, STATUS_RANK, type Status } from '../engine/status';
import { useApp } from '../state/AppState';
import { StatusMark } from './common';

// ---------------------------------------------------------------- status of a metric group

export interface GroupStatus { status: Status; off: number; watch: number }

/** Worst status among the metrics that have targets, with the off-target and watch counts. */
export function groupStatus(e: Engine, ids: string[], p: Period, sel: Selections): GroupStatus {
  let worst: Status = null;
  let off = 0, watch = 0;
  for (const id of ids) {
    const m = METRIC_BY_ID[id];
    const v = evaluate(m, e, p, sel);
    const s = statusOf(v.value, v.target, m.direction, v.watch);
    if (s === 'Off target') off++;
    if (s === 'Watch') watch++;
    if (s && (worst === null || STATUS_RANK[s] < STATUS_RANK[worst])) worst = s;
  }
  return { status: worst, off, watch };
}

export const statusText = (off: number, watch: number) => (off ? `${off} off target` : watch ? `${watch} on watch` : 'On target');

/** Status of each metric group for the current period and filters. */
export function useGroupStatus(groups: string[][]): GroupStatus[] {
  const { engine, period, sel } = useApp();
  return useMemo(() => groups.map((ids) => groupStatus(engine, ids, period, sel)), [engine, period, sel, groups]);
}

// ---------------------------------------------------------------- tabbed container

export interface TabDef {
  id: string;
  label: string;
  /** Step number in front of the label (e.g. the stage number in the cycle). */
  num?: number;
  /** Metric status shown in the tab label. */
  status?: GroupStatus;
  /** The landing tab, styled apart from the others (e.g. Overview). */
  home?: boolean;
}

/** The open tab id: the URL parameter when it names a tab, otherwise the first tab. */
export function useTab(tabs: TabDef[], param = 'tab'): [string, (id: string) => void] {
  const { route, setParams } = useApp();
  const cur = tabs.some((t) => t.id === route.params[param]) ? route.params[param] : tabs[0].id;
  const open = (id: string) => {
    const { [param]: _, ...rest } = route.params;
    setParams(id === tabs[0].id ? rest : { ...rest, [param]: id });
  };
  return [cur, open];
}

export function TabBox({ id, tabs, current, onOpen, label, spec, children }: {
  id: string; tabs: TabDef[]; current: string; onOpen: (id: string) => void; label: string;
  /** Build annotation (shown with "Show build annotations"). */
  spec?: ReactNode; children: ReactNode;
}) {
  const { specMode } = useApp();
  return (
    <section className="tabbox" aria-label={label}>
      <div className="tabbox-bar" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`${id}-tab-${t.id}`} aria-selected={current === t.id} aria-controls={`${id}-panel`}
            className={`tabbox-tab ${t.home ? 'tabbox-tab-home' : ''} ${current === t.id ? 'on' : ''}`}
            title={t.status ? `${t.label}: ${statusText(t.status.off, t.status.watch)}` : t.label} onClick={() => onOpen(t.id)}>
            {t.num !== undefined && <span className="tabbox-num">{t.num}</span>}{t.label}{t.status && <StatusMark status={t.status.status} compact />}
          </button>
        ))}
      </div>
      <div className="tabbox-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current}`}>
        {children}
      </div>
      {specMode && spec && <footer className="spec-note">{spec}</footer>}
    </section>
  );
}

// ---------------------------------------------------------------- bands (standard page layout)

export type BandType = 'kpi' | 'trend' | 'where' | 'why' | 'act';

/** The standard order of every stage page. The number is fixed, so "Why" is always 4. */
export const BANDS: Record<BandType, { n: number; title: string; question: string }> = {
  kpi: { n: 1, title: 'Performance', question: 'Are we on target?' },
  trend: { n: 2, title: 'Trend', question: 'Is it getting better or worse?' },
  where: { n: 3, title: 'Where', question: 'Which hospitals and payers?' },
  why: { n: 4, title: 'Why', question: 'What drives it?' },
  act: { n: 5, title: 'Act', question: 'What do we work, and where is the detail?' },
};

export function Band({ type, note, actions }: { type: BandType; note?: string; actions?: ReactNode }) {
  const b = BANDS[type];
  return (
    <div className={`band band-${type}`}>
      <span className="band-num" aria-hidden="true">{b.n}</span>
      <h2>{b.title}</h2>
      <span className="band-q">{note ?? b.question}</span>
      {actions && <span className="band-actions">{actions}</span>}
    </div>
  );
}

const rowCls = (n: number) => `row ${n >= 3 ? 'cols-3' : n === 2 ? 'cols-2' : ''}`;
const Row = ({ items }: { items: ReactNode[] }) => <div className={rowCls(items.length)}>{items.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</div>;

/** One row of visuals, or several rows (a list of lists). */
type Rows = ReactNode[] | ReactNode[][];
const Rows = ({ items }: { items: Rows }) => (Array.isArray(items[0])
  ? <>{(items as ReactNode[][]).map((r, i) => <Row key={i} items={r} />)}</>
  : <Row items={items as ReactNode[]} />);

/**
 * Bands 2 to 5 of the standard layout. Each band takes one row of visuals (2 → two columns,
 * 3 → three) or a list of rows. A band with no content is left out; the numbers stay fixed.
 */
export function Bands({ trend, where, why, act, actNote, actActions }: {
  trend?: Rows; where?: Rows; why?: Rows; act?: ReactNode; actNote?: string; actActions?: ReactNode;
}) {
  return (
    <>
      {trend && <><Band type="trend" /><Rows items={trend} /></>}
      {where && <><Band type="where" /><Rows items={where} /></>}
      {why && <><Band type="why" /><Rows items={why} /></>}
      {(act || actActions) && <><Band type="act" note={actNote} actions={actActions} />{act}</>}
    </>
  );
}
