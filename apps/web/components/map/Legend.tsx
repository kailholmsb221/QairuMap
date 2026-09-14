'use client';

import { useTranslations } from 'next-intl';
import { STATUS_COLORS, TYPE_COLORS } from '@/lib/plan-theme';

/** The plan's own legend (`Legend.tsx` in the authoring tool), minus its status filter. */
const ROWS: { key: 'live' | 'ending' | 'soon' | 'free' | 'service' | 'corridors' | 'wc' | 'cores'; bg: string; hatch?: boolean }[] = [
  { key: 'live', bg: STATUS_COLORS.busy },
  { key: 'ending', bg: STATUS_COLORS.ending },
  { key: 'soon', bg: STATUS_COLORS.soon },
  { key: 'free', bg: STATUS_COLORS.free },
  { key: 'service', bg: STATUS_COLORS.service },
  { key: 'corridors', bg: TYPE_COLORS.corridor! },
  { key: 'wc', bg: TYPE_COLORS.wc! },
  { key: 'cores', bg: TYPE_COLORS.stairs!, hatch: true },
];

export function Legend() {
  const t = useTranslations('map.legend');
  return (
    <div
      data-testid="legend"
      className="legend"
      style={{
        position: 'absolute',
        left: 14,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '8px 10px',
        borderRadius: 8,
        background: '#0d1520cc',
        border: '1px solid #1f3145',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',
      }}
    >
      {ROWS.map((row) => (
        <div key={row.key} className="legend-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px' }}>
          <span
            className={row.hatch ? 'swatch swatch-hatch' : 'swatch'}
            style={{ width: 14, height: 14, borderRadius: 3, background: row.bg, flex: 'none' }}
          />
          <span style={{ fontSize: 'var(--legend-font)', color: '#e6f1fb', fontWeight: 500 }}>
            {t(row.key)}
          </span>
        </div>
      ))}
    </div>
  );
}
