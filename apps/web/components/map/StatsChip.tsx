'use client';

import { useTranslations } from 'next-intl';

export function StatsChip({
  busy,
  total,
  color,
}: {
  busy: number;
  total: number;
  color?: string;
}) {
  const t = useTranslations('map');
  const pct = total ? Math.round((busy / total) * 100) : 0;
  return (
    <div
      data-testid="stats-chip"
      style={{
        position: 'absolute',
        right: 14,
        top: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 9,
        background: 'rgba(11,15,23,.72)',
        border: '1px solid var(--line)',
        pointerEvents: 'none',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 'calc(var(--chip-font) + 3px)',
          fontWeight: 700,
          color: color ?? 'var(--text)',
        }}
      >
        {busy}
        <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}> / {total}</span>
      </span>
      <span style={{ fontSize: 'var(--chip-font)', color: 'var(--text-dim)', fontWeight: 500 }}>
        {t('roomsBusy')}
      </span>
      <span
        style={{
          width: 64,
          height: 4,
          borderRadius: 99,
          background: 'rgba(255,255,255,.1)',
          overflow: 'hidden',
          display: 'block',
          flex: 'none',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${pct}%`,
            height: '100%',
            background: color ?? 'var(--status-live)',
            transition: 'width var(--dur-base) var(--ease-out)',
          }}
        />
      </span>
    </div>
  );
}
