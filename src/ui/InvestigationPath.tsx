// Investigation path: shows the analyst where they are in a drill-down workflow
// (metric -> hospital -> bucket -> payer -> accounts). Each step reflects the live filters,
// so the path builds itself as the user clicks visuals, and any step can be cleared.

import type { ReactNode } from 'react';
import type { SelField } from '../engine/engine';
import { useApp } from '../state/AppState';
import { Icon } from './icons';

export interface PathStep {
  label: string;
  field?: SelField;
  /** Text when the step has no selection. */
  hint: string;
  /** Fixed content (e.g. the headline metric value). */
  value?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Secondary action shown after the main one (e.g. the analytical account list). */
  secondary?: { label: string; onClick: () => void };
}

export function InvestigationPath({ title, steps }: { title: string; steps: PathStep[] }) {
  const { sel, valueLabel, clearField } = useApp();
  let open = false;
  return (
    <div className="ipath" role="navigation" aria-label={title}>
      <span className="ipath-title">{title}</span>
      {steps.map((s, i) => {
        const chosen = s.field ? sel[s.field] ?? [] : [];
        const done = s.value !== undefined || chosen.length > 0 || !!s.action;
        const isNext = !done && !open;
        if (isNext) open = true;
        return (
          <span key={s.label} className={`ipath-step ${done ? 'done' : ''} ${isNext ? 'next' : ''}`}>
            {i > 0 && <span className="ipath-arrow" aria-hidden="true"><Icon name="chevronRight" size={10} /></span>}
            <span className="ipath-num">{i + 1}</span>
            <span className="ipath-label">{s.label}</span>
            {s.value !== undefined && <span className="ipath-val">{s.value}</span>}
            {s.field && chosen.length > 0 && (
              <span className="ipath-val">
                {chosen.length === 1 ? valueLabel(s.field, chosen[0]) : `${chosen.length} selected`}
                <button type="button" className="icon-btn xs" title={`Clear ${s.label}`} onClick={() => clearField(s.field!)}><Icon name="close" size={9} /></button>
              </span>
            )}
            {s.field && chosen.length === 0 && <span className="ipath-hint">{s.hint}</span>}
            {s.action && <button type="button" className="btn btn-sm btn-primary" onClick={s.action.onClick}>{s.action.label}</button>}
            {s.secondary && <button type="button" className="btn btn-sm" onClick={s.secondary.onClick}>{s.secondary.label}</button>}
          </span>
        );
      })}
    </div>
  );
}
