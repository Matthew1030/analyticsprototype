import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';

interface Props {
  option: EChartsOption;
  height?: number;
  /** Click on a data point: category index and series name. */
  onClick?: (index: number, seriesName: string) => void;
  ariaLabel: string;
}

export function Chart({ option, height = 260, onClick, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    inst.current = c;
    c.on('click', (p) => {
      if (p.seriesName === 'base') return;
      clickRef.current?.(p.dataIndex, p.seriesName ?? '');
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    const onPrint = () => c.resize();
    window.addEventListener('beforeprint', onPrint);
    return () => { ro.disconnect(); window.removeEventListener('beforeprint', onPrint); c.dispose(); };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      className={onClick ? 'chart clickable' : 'chart'}
      style={{ height }}
    />
  );
}
