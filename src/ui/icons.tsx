// Small line icons (16px grid). Kept inline so the prototype has no icon dependency.

const P: Record<string, string> = {
  info: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 7v4.5M8 4.6v.1',
  table: 'M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10',
  focus: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  download: 'M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11',
  chart: 'M2 13.5h12M4 11V7M7 11V4M10 11V8M13 11V5.5',
  filter: 'M2 3h12L9.5 8.5V13l-3 1.5v-6z',
  chevronLeft: 'M10 3 5 8l5 5',
  chevronRight: 'M6 3l5 5-5 5',
  chevronDown: 'M3 6l5 5 5-5',
  back: 'M13 8H3M7 4 3 8l4 4',
  drill: 'M3 3v6.5h8M8.5 7 11 9.5 8.5 12',
  refresh: 'M13 4v3.5H9.5M3 12V8.5h3.5M12.6 7A5 5 0 0 0 3.8 5.2M3.4 9a5 5 0 0 0 8.8 1.8',
  more: 'M3.5 8h.1M8 8h.1M12.5 8h.1',
  database: 'M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2Zm0 0v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
  warn: 'M8 2 14.5 13.5h-13zM8 6.5v3.5M8 11.8v.1',
  clear: 'M2 3h12L9.5 8.5V13l-3 1.5v-6zM11 11.5l3 3M14 11.5l-3 3',
  bookmark: 'M4 2h8v12l-4-3-4 3z',
  share: 'M11.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11.5 14.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.3 7l3.4-2M6.3 9l3.4 2',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM10.5 10.5 14 14',
  code: 'M5 4 1.5 8 5 12M11 4l3.5 4-3.5 4M9.5 2.5l-3 11',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 14, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name]} />
    </svg>
  );
}
