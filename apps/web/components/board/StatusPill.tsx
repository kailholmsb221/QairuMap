'use client';

import type { PillKind } from '@/features/board/selectors';

const TOKEN: Record<PillKind, string> = {
  live: 'var(--status-live)',
  ending: 'var(--status-ending)',
  soon: 'var(--status-soon)',
  upcoming: 'var(--status-soon)',
  cancelled: 'var(--status-cancelled)',
  moved: 'var(--status-moved)',
  delayed: 'var(--status-delayed)',
};

export type StatusPillProps = {
  kind: PillKind;
  label: string;
  minWidth?: number | string;
  height?: number | string;
  fontSize?: number | string;
};

/** `pill()` from the design export: colour at 16 % behind, 35 % border, text on top. */
export function StatusPill({ kind, label, minWidth, height, fontSize }: StatusPillProps) {
  const c = TOKEN[kind];
  const outline = kind === 'upcoming';
  return (
    <span
      className={`pill${kind === 'soon' ? ' blink' : ''}`}
      data-pill={kind}
      style={{
        minWidth: minWidth ?? 'var(--pill-w)',
        height: height ?? 'var(--pill-h)',
        padding: '0 10px',
        fontSize: fontSize ?? 'var(--pill-font)',
        color: c,
        background: outline ? 'transparent' : `color-mix(in srgb, ${c} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} ${outline ? 55 : 35}%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
