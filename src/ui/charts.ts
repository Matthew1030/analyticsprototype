// ECharts option builders. One builder per visual type; pages pass data, never raw options.
// Palette: validated reference categorical order (fixed order, never cycled). Status colors are
// reserved for status and never used as series colors. One value axis per chart (no dual axes).

import type { EChartsOption } from 'echarts';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
/** Ordinal blue ramp for ordered categories (aging buckets), light -> dark. */
export const ORDINAL = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export const INK = { primary: '#1b1f24', secondary: '#4b5361', muted: '#7a8291', grid: '#e8eaee', axis: '#c9ced6' };
/** Comparison series (prior period / prior year): neutral gray. */
export const COMPARE = '#a9b0bb';
export const TARGET_COLOR = '#4b5361';
export const SELECTED_OPACITY = 0.3;

const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

const base = {
  animation: false,
  textStyle: { fontFamily: FONT, color: INK.secondary, fontSize: 11 },
  grid: { left: 8, right: 16, top: 26, bottom: 6, containLabel: true },
};

const tooltipBase = {
  backgroundColor: '#ffffff',
  borderColor: '#c9ced6',
  borderWidth: 1,
  padding: [6, 8],
  textStyle: { color: INK.primary, fontSize: 11, fontFamily: FONT },
  extraCssText: 'box-shadow: 0 2px 6px rgba(20,30,40,.12); border-radius: 2px;',
};

const valueAxis = (fmt: (v: number) => string, extra: object = {}) => ({
  type: 'value' as const,
  axisLabel: { color: INK.muted, fontSize: 10, formatter: (v: number) => fmt(v) },
  splitLine: { lineStyle: { color: INK.grid } },
  axisLine: { show: false },
  ...extra,
});
const catAxis = (labels: string[], extra: object = {}) => ({
  type: 'category' as const,
  data: labels,
  axisLabel: { color: INK.secondary, fontSize: 10 },
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
  ...extra,
});

const targetMark = (target: number | null | undefined, fmt: (v: number) => string, axis: 'x' | 'y') =>
  target === null || target === undefined
    ? undefined
    : {
      silent: true, symbol: 'none',
      lineStyle: { color: TARGET_COLOR, type: 'dashed' as const, width: 1 },
      label: { formatter: `Target ${fmt(target)}`, color: INK.secondary, fontSize: 10, position: axis === 'y' ? 'insideEndTop' as const : 'end' as const },
      data: [axis === 'y' ? { yAxis: target } : { xAxis: target }],
    };

export interface Series { name: string; data: (number | null)[]; color?: string }

/** Bar chart. Selected indexes stay solid, others fade (cross-filter feedback). */
export function barOption(o: {
  labels: string[]; series: Series[]; fmt: (v: number) => string; horizontal?: boolean;
  target?: number | null; selected?: number[]; stacked?: boolean; labels_on?: boolean; axisFmt?: (v: number) => string;
  colorBy?: (i: number) => string | undefined;
}): EChartsOption {
  const multi = o.series.length > 1;
  const sel = new Set(o.selected ?? []);
  const showLabels = o.labels_on ?? (!multi && !o.stacked);
  const series = o.series.map((s, si) => ({
    name: s.name, type: 'bar' as const, stack: o.stacked ? 'all' : undefined,
    data: s.data.map((v, i) => ({
      value: v,
      itemStyle: {
        color: o.colorBy?.(i) ?? s.color ?? SERIES[si],
        opacity: sel.size && !sel.has(i) ? SELECTED_OPACITY : 1,
        borderRadius: o.stacked ? 0 : o.horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0],
      },
    })),
    barMaxWidth: o.horizontal ? 16 : 26, barGap: '12%', barCategoryGap: '28%',
    itemStyle: { color: s.color ?? SERIES[si], borderColor: '#fff', borderWidth: o.stacked ? 1 : 0 },
    emphasis: { focus: 'none' as const },
    label: showLabels && si === o.series.length - 1
      ? { show: true, position: o.horizontal ? 'right' as const : 'top' as const, color: INK.secondary, fontSize: 10, formatter: (p: { value: unknown }) => (p.value == null ? '' : o.fmt(p.value as number)) }
      : undefined,
    markLine: si === 0 ? targetMark(o.target, o.fmt, o.horizontal ? 'x' : 'y') : undefined,
  }));
  return {
    ...base,
    grid: { ...base.grid, right: showLabels && o.horizontal ? 52 : 16, top: multi ? 28 : showLabels && !o.horizontal ? 18 : 10, bottom: o.horizontal && o.target != null ? 18 : 6 },
    legend: multi ? { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: INK.secondary, fontSize: 11 }, icon: 'rect' } : undefined,
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(42,120,214,0.06)' } }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: o.horizontal ? valueAxis(o.axisFmt ?? o.fmt, { splitNumber: 3, axisLabel: { show: !showLabels, color: INK.muted, fontSize: 10, formatter: (v: number) => (o.axisFmt ?? o.fmt)(v) } }) : catAxis(o.labels, { axisLabel: { color: INK.secondary, fontSize: 10, interval: 0, rotate: o.labels.length > 9 ? 30 : 0 } }),
    yAxis: o.horizontal ? catAxis(o.labels, { inverse: true, axisLabel: { color: INK.secondary, fontSize: 11, width: 170, overflow: 'truncate' } }) : valueAxis(o.axisFmt ?? o.fmt),
    series,
  } as EChartsOption;
}

/** Line chart with optional target line, comparison series and a highlighted point. */
export function lineOption(o: {
  labels: string[]; series: Series[]; fmt: (v: number) => string; target?: (number | null)[] | number | null;
  min?: number; selectedIndex?: number; area?: boolean; dashed?: string[];
}): EChartsOption {
  const targetSeries = Array.isArray(o.target) ? o.target : null;
  const dashed = new Set(o.dashed ?? []);
  // Keep the target visible: stretch the auto-scaled axis to include it.
  const tVals = (targetSeries ?? (o.target != null ? [o.target as number] : [])).filter((v): v is number => v != null);
  const tMin = tVals.length ? Math.min(...tVals) : null;
  const tMax = tVals.length ? Math.max(...tVals) : null;
  const pad = (r: { min: number; max: number }) => (r.max - r.min) * 0.08 || Math.abs(r.max) * 0.05 || 1;
  return {
    ...base,
    grid: { ...base.grid, top: 28 },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: INK.secondary, fontSize: 11 }, icon: 'rect' },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels, { boundaryGap: false }),
    yAxis: valueAxis(o.fmt, {
      scale: o.min === undefined,
      min: o.min ?? ((r: { min: number; max: number }) => niceFloor(Math.min(r.min, tMin ?? r.min) - pad(r))),
      max: (r: { min: number; max: number }) => niceCeil(Math.max(r.max, tMax ?? r.max) + pad(r)),
    }),
    series: [
      ...o.series.map((s, si) => ({
        name: s.name, type: 'line' as const, data: s.data, connectNulls: false,
        showSymbol: true, symbolSize: si === 0 ? 6 : 4, symbol: 'circle',
        lineStyle: { width: si === 0 ? 2 : 1.5, color: s.color ?? SERIES[si], type: dashed.has(s.name) ? 'dashed' as const : 'solid' as const },
        itemStyle: { color: s.color ?? SERIES[si], borderColor: '#fff', borderWidth: 1 },
        areaStyle: o.area && si === 0 ? { color: 'rgba(42,120,214,0.07)' } : undefined,
        z: 10 - si,
        markLine: si === 0 && !targetSeries ? targetMark(o.target as number | null | undefined, o.fmt, 'y') : undefined,
        markPoint: si === 0 && o.selectedIndex !== undefined && s.data[o.selectedIndex] != null ? {
          symbol: 'circle', symbolSize: 11, silent: true,
          itemStyle: { color: '#fff', borderColor: s.color ?? SERIES[0], borderWidth: 3 },
          label: { show: false },
          data: [{ coord: [o.selectedIndex, s.data[o.selectedIndex]] }],
        } : undefined,
      })),
      ...(targetSeries ? [{
        name: 'Target', type: 'line' as const, data: targetSeries, step: 'middle' as const, showSymbol: false,
        lineStyle: { width: 1, color: TARGET_COLOR, type: 'dashed' as const }, itemStyle: { color: TARGET_COLOR }, z: 1,
      }] : []),
    ],
  } as EChartsOption;
}

/** Stacked columns over time (e.g. A/R by aging bucket per month). */
export function stackedColumnsOption(o: { labels: string[]; series: Series[]; fmt: (v: number) => string; selectedSeries?: number[]; percent?: boolean }): EChartsOption {
  const sel = new Set(o.selectedSeries ?? []);
  return {
    ...base,
    grid: { ...base.grid, top: 30 },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, icon: 'rect', textStyle: { color: INK.secondary, fontSize: 10 } },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(42,120,214,0.06)' } }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels),
    yAxis: valueAxis(o.fmt, o.percent ? { max: 1 } : {}),
    series: o.series.map((s, si) => ({
      name: s.name, type: 'bar' as const, stack: 'all', data: s.data, barMaxWidth: 28, barCategoryGap: '30%',
      itemStyle: { color: s.color ?? SERIES[si], borderColor: '#fff', borderWidth: 1, opacity: sel.size && !sel.has(si) ? SELECTED_OPACITY : 1 },
    })),
  } as EChartsOption;
}

/** Pareto / concentration: share bars and cumulative share line on one percent axis. */
export function paretoOption(o: { labels: string[]; shares: number[]; fmt: (v: number) => string; selected?: number[] }): EChartsOption {
  let run = 0;
  const cum = o.shares.map((v) => (run += v));
  const sel = new Set(o.selected ?? []);
  return {
    ...base,
    grid: { ...base.grid, top: 28, bottom: 6 },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: INK.secondary, fontSize: 11 } },
    tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels, { axisLabel: { color: INK.secondary, fontSize: 10, interval: 0, rotate: 32, width: 90, overflow: 'truncate' } }),
    yAxis: valueAxis(o.fmt, { max: 1 }),
    series: [
      { name: 'Share of A/R', type: 'bar', barMaxWidth: 24, data: o.shares.map((v, i) => ({ value: v, itemStyle: { color: SERIES[0], opacity: sel.size && !sel.has(i) ? SELECTED_OPACITY : 1, borderRadius: [2, 2, 0, 0] } })) },
      { name: 'Cumulative share', type: 'line', data: cum, symbolSize: 5, lineStyle: { width: 1.5, color: SERIES[1] }, itemStyle: { color: SERIES[1] },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: TARGET_COLOR, type: 'dashed', width: 1 }, label: { formatter: '80%', fontSize: 10, color: INK.secondary }, data: [{ yAxis: 0.8 }] } },
    ],
  } as EChartsOption;
}

/** Scatter with quadrant reference lines (e.g. payer denial rate vs A/R days). */
export function scatterOption(o: {
  points: { name: string; x: number | null; y: number | null; size: number }[];
  xName: string; yName: string; xFmt: (v: number) => string; yFmt: (v: number) => string; xRef?: number; yRef?: number; selected?: number[];
}): EChartsOption {
  const maxSize = Math.max(...o.points.map((p) => p.size), 1);
  const sel = new Set(o.selected ?? []);
  return {
    ...base,
    grid: { left: 12, right: 24, top: 18, bottom: 28, containLabel: true },
    tooltip: {
      ...tooltipBase, trigger: 'item',
      formatter: (p: unknown) => {
        const d = (p as { data: { name: string; value: number[] } }).data;
        return `<b>${d.name}</b><br/>${o.xName}: ${o.xFmt(d.value[0])}<br/>${o.yName}: ${o.yFmt(d.value[1])}`;
      },
    },
    xAxis: valueAxis(o.xFmt, { name: o.xName, nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: INK.muted, fontSize: 10 }, scale: true }),
    yAxis: valueAxis(o.yFmt, { name: o.yName, nameTextStyle: { color: INK.muted, fontSize: 10, align: 'left' }, scale: true }),
    series: [{
      type: 'scatter',
      data: o.points.filter((p) => p.x !== null && p.y !== null).map((p, i) => ({
        name: p.name, value: [p.x, p.y], symbolSize: 8 + 26 * Math.sqrt(p.size / maxSize),
        itemStyle: { color: SERIES[0], opacity: sel.size && !sel.has(i) ? SELECTED_OPACITY : 0.75, borderColor: '#fff', borderWidth: 2 },
      })),
      label: {
        show: true, position: 'right', fontSize: 10, color: INK.secondary,
        // Label only points outside the reference quadrant, so labels do not pile up.
        formatter: (p: { name: string; value: number[] }) => ((o.xRef === undefined || p.value[0] > o.xRef) || (o.yRef === undefined || p.value[1] > o.yRef)
          ? p.name.replace('UnitedHealthcare', 'UHC').replace('Medicare Advantage', 'MA').replace(' / Auto / Tricare', '') : ''),
      },
      markLine: {
        silent: true, symbol: 'none', lineStyle: { color: INK.axis, type: 'dashed', width: 1 }, label: { show: false },
        data: [...(o.xRef !== undefined ? [{ xAxis: o.xRef }] : []), ...(o.yRef !== undefined ? [{ yAxis: o.yRef }] : [])],
      },
    }],
  } as EChartsOption;
}

/** Waterfall (bridge): start total, signed steps, end total. Built as a stacked bar with a hidden base. */
export function waterfallOption(o: { start: { label: string; value: number }; steps: { label: string; value: number }[]; end: { label: string; value: number }; fmt: (v: number) => string; goodWhenUp?: boolean }): EChartsOption {
  const labels = [o.start.label, ...o.steps.map((s) => s.label), o.end.label];
  const hidden: (number | string)[] = [0];
  const up: (number | string)[] = ['-'];
  const down: (number | string)[] = ['-'];
  const total: (number | string)[] = [o.start.value];
  let run = o.start.value;
  for (const s of o.steps) {
    if (s.value >= 0) { hidden.push(run); up.push(s.value); down.push('-'); run += s.value; }
    else { run += s.value; hidden.push(run); up.push('-'); down.push(-s.value); }
    total.push('-');
  }
  hidden.push(0); up.push('-'); down.push('-'); total.push(o.end.value);
  let low = Math.min(o.start.value, o.end.value);
  let r2 = o.start.value;
  for (const s of o.steps) { r2 += s.value; low = Math.min(low, r2); }
  const high = Math.max(o.start.value, o.end.value);
  const span = Math.max(high - low, Math.abs(high) * 0.02);
  const mag = Math.pow(10, Math.floor(Math.log10(span)));
  const axisMin = Math.max(0, Math.floor((low - span * 0.8) / mag) * mag);
  const incColor = SERIES[0];
  const decColor = SERIES[1];
  return {
    ...base,
    grid: { ...base.grid, top: 28 },
    legend: { top: 0, left: 0, data: ['Increase', 'Decrease', 'Total'], itemWidth: 10, itemHeight: 10, textStyle: { color: INK.secondary, fontSize: 11 } },
    tooltip: {
      ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps: unknown) => {
        const i = (ps as { dataIndex: number }[])[0].dataIndex;
        if (i === 0) return `${labels[0]}: <b>${o.fmt(o.start.value)}</b>`;
        if (i === labels.length - 1) return `${labels[i]}: <b>${o.fmt(o.end.value)}</b>`;
        const v = o.steps[i - 1].value;
        return `${labels[i]}: <b>${v >= 0 ? '+' : '−'}${o.fmt(Math.abs(v))}</b>`;
      },
    },
    xAxis: catAxis(labels, { axisLabel: { color: INK.secondary, fontSize: 10, interval: 0, rotate: labels.length > 7 ? 28 : 0, width: 100, overflow: 'truncate' } }),
    yAxis: valueAxis(o.fmt, { min: axisMin }),
    series: [
      { name: 'base', type: 'bar', stack: 'w', data: hidden, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, tooltip: { show: false } },
      { name: 'Total', type: 'bar', stack: 'w', data: total, barMaxWidth: 36, itemStyle: { color: COMPARE, borderRadius: [2, 2, 0, 0] },
        label: { show: true, position: 'top', fontSize: 10, color: INK.secondary, formatter: (p: { value: unknown }) => (p.value === '-' ? '' : o.fmt(p.value as number)) } },
      { name: 'Increase', type: 'bar', stack: 'w', data: up, barMaxWidth: 36, itemStyle: { color: incColor },
        label: { show: true, position: 'top', fontSize: 10, color: INK.secondary, formatter: (p: { value: unknown }) => (p.value === '-' ? '' : `+${o.fmt(p.value as number)}`) } },
      { name: 'Decrease', type: 'bar', stack: 'w', data: down, barMaxWidth: 36, itemStyle: { color: decColor },
        label: { show: true, position: 'bottom', fontSize: 10, color: INK.secondary, formatter: (p: { value: unknown }) => (p.value === '-' ? '' : `−${o.fmt(p.value as number)}`) } },
    ],
  } as EChartsOption;
}

/** Bars and lines that share ONE value axis (e.g. cash collected vs cash goal, both in dollars). */
export function barLineOption(o: { labels: string[]; bars: Series[]; lines: Series[]; fmt: (v: number) => string; selectedIndex?: number }): EChartsOption {
  return {
    ...base,
    grid: { ...base.grid, top: 28 },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 11 } },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(42,120,214,0.06)' } }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels),
    yAxis: valueAxis(o.fmt),
    series: [
      ...o.bars.map((b, i) => ({
        name: b.name, type: 'bar' as const, barMaxWidth: 22, barGap: '10%',
        data: b.data.map((v, j) => ({ value: v, itemStyle: { color: b.color ?? SERIES[i], borderRadius: [2, 2, 0, 0], opacity: o.selectedIndex !== undefined && j !== o.selectedIndex ? 0.55 : 1 } })),
      })),
      ...o.lines.map((l, i) => ({
        name: l.name, type: 'line' as const, data: l.data, symbolSize: 5, step: undefined,
        lineStyle: { width: 1.5, color: l.color ?? TARGET_COLOR, type: i === 0 ? 'dashed' as const : 'solid' as const }, itemStyle: { color: l.color ?? TARGET_COLOR },
      })),
    ],
  } as EChartsOption;
}

function step(v: number) {
  const a = Math.abs(v) || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(a)) - 1);
  return mag;
}
function niceFloor(v: number) { const st = step(v); return Math.floor(v / st) * st; }
function niceCeil(v: number) { const st = step(v); return Math.ceil(v / st) * st; }

/**
 * Executive trend: one series, the target as a dashed line, and a faint tint on the side of the
 * target that misses it (conditional formatting, not decoration). No legend: the title names it.
 */
export function eltTrendOption(o: { labels: string[]; values: (number | null)[]; target: number | null; fmt: (v: number) => string; direction: 'up' | 'down' | 'none' }): EChartsOption {
  const vals = o.values.filter((v): v is number => v != null);
  const lo = Math.min(...vals, o.target ?? Infinity);
  const hi = Math.max(...vals, o.target ?? -Infinity);
  const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.05 || 1;
  const min = niceFloor(lo - pad);
  const max = niceCeil(hi + pad);
  const last = o.values.length - 1;
  const missZone = o.target === null || o.direction === 'none' ? undefined : {
    silent: true, itemStyle: { color: 'rgba(187,51,40,0.045)' },
    data: [[{ yAxis: o.direction === 'down' ? o.target : min }, { yAxis: o.direction === 'down' ? max : o.target }]],
  };
  return {
    ...base,
    grid: { left: 4, right: 14, top: 12, bottom: 4, containLabel: true },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels, { boundaryGap: false, axisLabel: { color: INK.muted, fontSize: 10, interval: (i: number) => i === 0 || i === last || i === Math.floor(last / 2) } }),
    yAxis: { ...valueAxis(o.fmt, { min, max, splitNumber: 3 }), splitLine: { lineStyle: { color: '#f0f2f5' } } },
    series: [{
      name: 'Actual', type: 'line', data: o.values, smooth: false, showSymbol: false, symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 2, color: SERIES[0] }, itemStyle: { color: SERIES[0], borderColor: '#fff', borderWidth: 2 },
      areaStyle: { color: 'rgba(42,120,214,0.06)' },
      markLine: o.target === null ? undefined : { ...targetMark(o.target, o.fmt, 'y'), label: { show: false } },
      markArea: missZone,
      markPoint: o.values[last] == null ? undefined : { symbol: 'circle', symbolSize: 8, silent: true, itemStyle: { color: SERIES[0], borderColor: '#fff', borderWidth: 2 }, label: { show: false }, data: [{ coord: [last, o.values[last]] }] },
    }],
  } as EChartsOption;
}
