// ECharts option builders. Each one maps to a native Qlik object type (noted per builder).
// Palette: validated reference categorical order, fixed order, never cycled.

import type { EChartsOption } from 'echarts';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7' };
export const TARGET_COLOR = '#52514e';
export const TOTAL_COLOR = '#898781';

const base = {
  animation: false,
  textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: INK.secondary },
  grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
};

const valueAxis = (fmt: (v: number) => string, extra: object = {}) => ({
  type: 'value' as const,
  axisLabel: { color: INK.muted, formatter: (v: number) => fmt(v) },
  splitLine: { lineStyle: { color: INK.grid } },
  axisLine: { show: false },
  ...extra,
});
const catAxis = (labels: string[], extra: object = {}) => ({
  type: 'category' as const,
  data: labels,
  axisLabel: { color: INK.secondary },
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
  ...extra,
});

const targetLine = (target: number | null | undefined, fmt: (v: number) => string, label = 'Target') =>
  target === null || target === undefined
    ? undefined
    : {
      silent: true, symbol: 'none',
      lineStyle: { color: TARGET_COLOR, type: 'dashed' as const, width: 1.5 },
      label: { formatter: `${label} ${fmt(target)}`, color: INK.secondary, position: 'insideEndTop' as const },
      data: [{ yAxis: target }],
    };

export interface Series { name: string; data: (number | null)[]; color?: string }

/** Qlik: Bar chart (vertical or horizontal; grouped when several series). */
export function barOption(o: {
  labels: string[]; series: Series[]; fmt: (v: number) => string; horizontal?: boolean;
  target?: number | null; highlight?: number[]; stacked?: boolean;
}): EChartsOption {
  const showLegend = o.series.length > 1;
  const highlight = new Set(o.highlight ?? []);
  const series = o.series.map((s, si) => ({
    name: s.name, type: 'bar' as const, stack: o.stacked ? 'all' : undefined,
    data: s.data.map((v, i) => ({
      value: v,
      itemStyle: {
        color: s.color ?? SERIES[si],
        opacity: highlight.size && !highlight.has(i) ? 0.35 : 1,
        borderRadius: o.stacked ? 0 : o.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
      },
    })),
    barMaxWidth: 28, barGap: '15%',
    itemStyle: { color: s.color ?? SERIES[si], borderColor: '#fcfcfb', borderWidth: o.stacked ? 1 : 0 },
    label: o.series.length === 1 && !o.stacked
      ? { show: true, position: o.horizontal ? 'right' as const : 'top' as const, color: INK.secondary, fontSize: 11, formatter: (p: { value: unknown }) => (p.value === null ? '' : o.fmt(p.value as number)) }
      : undefined,
    markLine: si === 0 ? (o.horizontal
      ? (o.target == null ? undefined : { silent: true, symbol: 'none', lineStyle: { color: TARGET_COLOR, type: 'dashed' as const }, label: { formatter: `Target ${o.fmt(o.target)}`, color: INK.secondary, position: 'start' as const, distance: 4 }, data: [{ xAxis: o.target }] })
      : targetLine(o.target, o.fmt)) : undefined,
  }));
  const labelled = o.series.length === 1 && !o.stacked;
  return {
    ...base,
    grid: { ...base.grid, left: 16, right: labelled && o.horizontal ? 56 : 16, top: showLegend ? 32 : labelled && !o.horizontal ? 24 : 16, bottom: o.horizontal && o.target != null ? 20 : 8 },
    legend: showLegend ? { top: 0, left: 0, textStyle: { color: INK.secondary }, icon: 'roundRect' } : undefined,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: o.horizontal ? valueAxis(o.fmt) : catAxis(o.labels, { axisLabel: { color: INK.secondary, interval: 0, rotate: o.labels.length > 8 ? 30 : 0 } }),
    yAxis: o.horizontal ? catAxis(o.labels, { inverse: true }) : valueAxis(o.fmt),
    series,
  } as EChartsOption;
}

/** Qlik: Line chart, with a target reference line. */
export function lineOption(o: { labels: string[]; series: Series[]; fmt: (v: number) => string; target?: number | null; min?: number }): EChartsOption {
  return {
    ...base,
    legend: o.series.length > 1 ? { top: 0, left: 0, textStyle: { color: INK.secondary } } : undefined,
    tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels, { boundaryGap: false }),
    yAxis: valueAxis(o.fmt, { scale: o.min === undefined, min: o.min }),
    series: o.series.map((s, si) => ({
      name: s.name, type: 'line' as const, data: s.data, showSymbol: true, symbolSize: 7, connectNulls: false,
      lineStyle: { width: 2, color: s.color ?? SERIES[si] }, itemStyle: { color: s.color ?? SERIES[si] },
      markLine: si === 0 ? targetLine(o.target, o.fmt) : undefined,
    })),
  } as EChartsOption;
}

/** Qlik: Combo chart (bars plus a line on a second axis). */
export function comboOption(o: {
  labels: string[]; bars: Series[]; line: Series; barFmt: (v: number) => string; lineFmt: (v: number) => string;
  lineTarget?: number | null; stacked?: boolean;
}): EChartsOption {
  return {
    ...base,
    grid: { ...base.grid, top: 40 },
    legend: { top: 0, left: 0, textStyle: { color: INK.secondary } },
    tooltip: {
      trigger: 'axis',
      formatter: (ps: unknown) => {
        const arr = ps as { seriesName: string; value: number | null; marker: string; axisValue: string; seriesIndex: number }[];
        const rows = arr.map((p) => `${p.marker} ${p.seriesName}: <b>${p.value == null ? '–' : p.seriesIndex === o.bars.length ? o.lineFmt(p.value) : o.barFmt(p.value)}</b>`);
        return [arr[0]?.axisValue, ...rows].join('<br/>');
      },
    },
    xAxis: catAxis(o.labels),
    yAxis: [
      valueAxis(o.barFmt),
      valueAxis(o.lineFmt, { splitLine: { show: false }, scale: true }),
    ],
    series: [
      ...o.bars.map((b, i) => ({
        name: b.name, type: 'bar' as const, data: b.data, stack: o.stacked ? 'bars' : undefined, barMaxWidth: 26,
        itemStyle: { color: b.color ?? (o.stacked ? ['#b7d3f6', '#6da7ec', '#2a78d6', '#184f95'][i] : '#9ec5f4'), borderColor: '#fcfcfb', borderWidth: o.stacked ? 1 : 0 },
      })),
      {
        name: o.line.name, type: 'line' as const, yAxisIndex: 1, data: o.line.data, symbolSize: 7,
        lineStyle: { width: 2, color: o.line.color ?? SERIES[1] }, itemStyle: { color: o.line.color ?? SERIES[1] },
        markLine: targetLine(o.lineTarget, o.lineFmt),
      },
    ],
  } as EChartsOption;
}

/** Qlik: Waterfall chart. Built here as a stacked bar with a hidden base. */
export function waterfallOption(o: { start: { label: string; value: number }; steps: { label: string; value: number }[]; end: { label: string; value: number }; fmt: (v: number) => string }): EChartsOption {
  const labels = [o.start.label, ...o.steps.map((s) => s.label), o.end.label];
  const hidden: (number | string)[] = [];
  const up: (number | string)[] = [];
  const down: (number | string)[] = [];
  const total: (number | string)[] = [];
  let run = o.start.value;
  hidden.push(0); up.push('-'); down.push('-'); total.push(o.start.value);
  for (const s of o.steps) {
    if (s.value >= 0) { hidden.push(run); up.push(s.value); down.push('-'); run += s.value; }
    else { run += s.value; hidden.push(run); up.push('-'); down.push(-s.value); }
    total.push('-');
  }
  hidden.push(0); up.push('-'); down.push('-'); total.push(o.end.value);
  const deltas = [null, ...o.steps.map((s) => s.value), null];
  // Start the axis near the lowest running total so the changes are readable.
  // (The Qlik waterfall also lets the axis start above zero.)
  let low = Math.min(o.start.value, o.end.value);
  let r2 = o.start.value;
  for (const s of o.steps) { r2 += s.value; low = Math.min(low, r2); }
  const high = Math.max(o.start.value, o.end.value);
  const span = Math.max(high - low, Math.abs(high) * 0.02);
  const mag = Math.pow(10, Math.floor(Math.log10(span)));
  const axisMin = Math.max(0, Math.floor((low - span * 0.6) / mag) * mag);
  const tip = (i: number) => (i === 0 ? `${labels[0]}: ${o.fmt(o.start.value)}` : i === labels.length - 1 ? `${labels[i]}: ${o.fmt(o.end.value)}` : `${labels[i]}: ${deltas[i]! >= 0 ? '+' : ''}${o.fmt(deltas[i]!)}`);
  return {
    ...base,
    legend: { top: 0, left: 0, data: ['Increase', 'Decrease', 'Period total'], textStyle: { color: INK.secondary } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: unknown) => tip((ps as { dataIndex: number }[])[0].dataIndex) },
    xAxis: catAxis(labels, { axisLabel: { color: INK.secondary, interval: 0, rotate: labels.length > 7 ? 25 : 0 } }),
    yAxis: valueAxis(o.fmt, { min: axisMin }),
    series: [
      { name: 'base', type: 'bar', stack: 'w', data: hidden, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, tooltip: { show: false } },
      { name: 'Period total', type: 'bar', stack: 'w', data: total, itemStyle: { color: TOTAL_COLOR, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 40,
        label: { show: true, position: 'top', color: INK.secondary, formatter: (p: { value: unknown }) => (p.value === '-' ? '' : o.fmt(p.value as number)) } },
      { name: 'Increase', type: 'bar', stack: 'w', data: up, itemStyle: { color: SERIES[0] }, barMaxWidth: 40,
        label: { show: true, position: 'top', color: INK.secondary, formatter: (p: { value: unknown }) => (p.value === '-' ? '' : `+${o.fmt(p.value as number)}`) } },
      { name: 'Decrease', type: 'bar', stack: 'w', data: down, itemStyle: { color: SERIES[1] }, barMaxWidth: 40,
        label: { show: true, position: 'bottom', color: INK.secondary, formatter: (p: { value: unknown }) => (p.value === '-' ? '' : `−${o.fmt(p.value as number)}`) } },
    ],
  } as EChartsOption;
}

/** Small trend line inside a KPI tile (Qlik: KPI object with a trend line chart beside it). */
export function sparkOption(values: (number | null)[], color = SERIES[0]): EChartsOption {
  return {
    animation: false,
    grid: { left: 2, right: 2, top: 4, bottom: 4 },
    xAxis: { type: 'category', show: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{ type: 'line', data: values, showSymbol: false, lineStyle: { width: 2, color }, silent: true }],
  };
}
