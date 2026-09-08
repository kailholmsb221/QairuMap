'use client';

import { useTranslations } from 'next-intl';
import type { Connection } from '@/lib/store/boardStore';

const COLOR: Record<Connection, string> = {
  online: 'var(--status-live)',
  reconnecting: 'var(--status-soon)',
  offline: 'var(--status-cancelled)',
};

export function ConnectionDot({ connection }: { connection: Connection }) {
  const t = useTranslations('ticker');
  const c = COLOR[connection];
  return (
    <div
      data-testid="connection"
      data-connection={connection}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: '100%',
        padding: '0 16px',
        borderLeft: '1px solid var(--line)',
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 8,
          height: 8,
          borderRadius: 99,
          background: c,
          boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 18%, transparent)`,
          flex: 'none',
        }}
      />
      <span
        className="mono"
        style={{
          fontSize: 'calc(var(--ticker-font) - 3px)',
          fontWeight: 700,
          letterSpacing: '.1em',
          color: c,
          whiteSpace: 'nowrap',
        }}
      >
        {t(connection)}
      </span>
    </div>
  );
}
