'use client';

import { useTranslations } from 'next-intl';
import { useMetrics } from '@/features/metrics/useViewportMetrics';
import { LogoMark } from './Icons';
import { LiveClock } from './LiveClock';

export type HeaderProps = {
  tz: string;
  initialAt: string;
  floors: number[];
};

/**
 * Brand and clock only. The controls that used to sit here — the floor tabs,
 * the search button, the language switch, the theme toggle and the kiosk link —
 * are not rendered at all: the map is entered through its own plates, search
 * through ⌘K, and the rest is deliberately off-screen.
 */
export function Header({ tz, initialAt }: HeaderProps) {
  const brand = useTranslations('brand');
  const m = useMetrics();

  return (
    <header
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        height: 'var(--header-h)',
        padding: '0 6px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <LogoMark size={Math.round(m.headerH * 0.47)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 'var(--brand)',
              fontWeight: 800,
              letterSpacing: '-.01em',
              lineHeight: 1.1,
            }}
          >
            {brand('title')}
          </span>
          <span
            style={{
              fontSize: 'var(--brand-sub)',
              color: 'var(--text-dim)',
              fontWeight: 500,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {brand('subtitle')}
          </span>
        </div>
      </div>

      <div
        style={{
          width: 1,
          height: 'calc(var(--header-h) * 0.5)',
          background: 'var(--line)',
          flex: 'none',
        }}
      />

      <LiveClock tz={tz} initialAt={initialAt} />
    </header>
  );
}
