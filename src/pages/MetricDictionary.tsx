// Metric Dictionary (prototype only, not part of the design): every catalog metric with its code,
// plain-language calculation, target and the views where it appears. Export to CSV for Excel keeps
// the latest dictionary as the dashboard changes.

import { useEffect, useMemo, useState } from 'react';
import { DICTIONARY_COLUMNS, dictionaryCsv, dictionaryRows, loadMetricViews, type DictionaryRow } from '../config/metricDictionary';
import { RCM_AREAS } from '../engine/metrics';
import { useApp, type PageId } from '../state/AppState';
import { Grid, type GridColumn } from '../ui/Grid';
import { Icon } from '../ui/icons';
import { PAGE_BY_ID } from '../ui/Shell';

const WRAP = new Set<keyof DictionaryRow>(['name', 'definition', 'formula', 'views']);
const WIDTH: Partial<Record<keyof DictionaryRow, number>> = { name: 200, definition: 320, formula: 260, views: 220 };

export function MetricDictionary() {
  const { go, toast } = useApp();
  const [views, setViews] = useState<Record<string, PageId[]> | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');

  useEffect(() => { loadMetricViews().then(setViews).catch((e: Error) => setErr(e.message)); }, []);

  const all = useMemo(() => (views ? dictionaryRows(views) : []), [views]);
  const list = all.filter((r) => (!area || r.area === area)
    && (!q || `${r.code} ${r.name} ${r.definition} ${r.formula} ${r.id}`.toLowerCase().includes(q.toLowerCase())));
  const cols: GridColumn<DictionaryRow>[] = DICTIONARY_COLUMNS.map((c) => ({
    key: c.key, label: c.label, value: (r) => r[c.key], align: 'left', width: WIDTH[c.key],
    render: c.key === 'code' ? (r) => <b className="mono">{r.code}</b>
      : c.key === 'id' ? (r) => <code className="small">{r.id}</code>
      : WRAP.has(c.key) ? (r) => <span className="wrap">{r[c.key]}</span> : undefined,
  }));

  const doExport = () => {
    const blob = new Blob([dictionaryCsv(all)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metric-dictionary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exported ${all.length} metrics to ${a.download}.`);
  };

  const meta = PAGE_BY_ID.dictionary;
  return (
    <div className="page">
      <div className="canvas-head">
        <div className="canvas-title-row">
          <div>
            <h1>{meta.title} <span className="proto-tag">Prototype only</span></h1>
            <p className="question">{meta.question} Not part of the design. Views are read from the prototype pages, so the export always matches the current build.</p>
          </div>
          <div className="canvas-right">
            <button type="button" className="btn btn-primary" onClick={doExport} disabled={!views} title="CSV file that opens in Excel. Always holds every metric, whatever the search or category.">
              <Icon name="download" size={12} /> Export to Excel (CSV)
            </button>
          </div>
        </div>
      </div>
      <section className="visual" aria-label="Metric dictionary">
        <header className="visual-head">
          <div className="visual-titles">
            <h3>Metric dictionary ({list.length === all.length ? `${all.length} metrics` : `${list.length} of ${all.length} metrics`})</h3>
            <div className="visual-sub">Code = RCM category prefix and number · views use only the metric name or its short name · shortest period = the shortest period type the metric is calculated for · Time recency is not set yet · click a row to analyze the metric</div>
          </div>
          <div className="visual-tools dict-tools">
            <label className="fld inline">RCM category
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">All</option>
                {RCM_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <span className="search-inline"><Icon name="search" size={12} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search metrics" aria-label="Search metrics" /></span>
          </div>
        </header>
        <div className="visual-body">
          {err ? <div className="state state-error" role="alert"><Icon name="warn" size={16} /><span><b>The views could not load.</b> {err}</span></div>
            : !views ? <div className="state" role="status">Reading the views from the prototype pages…</div>
            : <Grid caption="Metric dictionary" columns={cols} rows={list.map((r) => ({ id: r.id, data: r }))} dense
                defaultSort={{ key: 'code', dir: 'asc' }} onRowClick={(r) => go('metric', { id: r.id }, { drill: true })} />}
        </div>
      </section>
    </div>
  );
}
