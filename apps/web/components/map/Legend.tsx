'use client';

import { useTranslations } from 'next-intl';

const ROWS: { key: 'live' | 'ending' | 'soon' | 'free' | 'service'; bg: string; extra?: React.CSSProperties }[] = [
  {
    key: 'live',
    bg: 'rgba(45,212,191,.55)',
    extra: { boxShadow: '0 0 0 1px rgba(45,212,191,.7)' },
  },
  { key: 'ending', bg: 'rgba(251,146,60,.55)' },
  { key: 'soon', bg: 'rgba(251,191,36,.45)' },
  { key: 'free', bg: 'rgba(255,255,255,.12)' },
  {
    key: 'service',
    bg: 'rgba(255,255,255,.04)',
    extra: { border: '1px solid rgba(255,255,255,.14)' },
  },
];

export function Legend() {
  const t = useTranslations('map.legend');
  return (
    <div
      data-testid="legend"
      style={{
        position: 'absolute',
        left: 14,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 9,
        background: 'rgba(11,15,23,.72)',
        border: '1px solid var(--line)',
        pointerEvents: 'none',
      }}
    >
      {ROWS.map((row) => (
        <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 14,
              height: 10,
              borderRadius: 2,
              background: row.bg,
              flex: 'none',
              ...row.extra,
            }}
          />
          <span
            style={{ fontSize: 'var(--legend-font)', color: 'var(--text)', fontWeight: 500 }}
          >
            {t(row.key)}
          </span>
        </div>
      ))}
    </div>
  );
}
