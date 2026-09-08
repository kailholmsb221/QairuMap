'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useMetrics } from '@/features/metrics/useViewportMetrics';
import { autoLines, mergeLines } from '@/features/ticker/lines';
import { formatClock } from '@/features/time/derive';
import { useTimeStore } from '@/features/time/useNow';
import { DemoAdminPanel } from '@/components/panels/DemoAdminPanel';
import { ConnectionDot } from './ConnectionDot';
import { IconFeed } from './Icons';

/** The marquee runs at a constant 90 px/s regardless of how long the copy is. */
const MARQUEE_SPEED = 90;

export function Ticker({ tz, kiosk = false }: { tz: string; kiosk?: boolean }) {
  const t = useTranslations('ticker');
  const m = useMetrics();
  const snapshot = useBoardStore((s) => s.snapshot);
  const mode = useBoardStore((s) => s.mode);
  const travelAt = useBoardStore((s) => s.travelAt);
  const connection = useBoardStore((s) => s.connection);
  const announcements = useBoardStore((s) => s.announcements);
  const lastUpdateAt = useBoardStore((s) => s.lastUpdateAt);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(48);

  const lines = useMemo(() => {
    if (connection === 'offline') {
      return [
        {
          id: 'offline',
          warn: true,
          text: t('offlineLine', {
            time: lastUpdateAt ? formatClock(lastUpdateAt, tz) : '—',
          }),
        },
      ];
    }
    const nowMs = useTimeStore.getState().nowMs || new Date(snapshot.at).getTime();
    const travelLine =
      mode === 'travel' && travelAt
        ? [
            {
              id: 'travel',
              warn: true,
              text: t('simulated', { time: formatClock(travelAt, tz, false) }),
            },
          ]
        : [];
    return mergeLines(
      [...announcements],
      [
        ...travelLine,
        ...autoLines(snapshot, nowMs, tz, {
          startsIn: (v) => t('startsIn', v),
          cancelled: (v) => t('cancelled', v),
          moved: (v) => t('moved', v),
          delayed: (v) => t('delayed', v),
          quiet: t('quiet'),
        }),
      ],
    );
  }, [snapshot, announcements, connection, lastUpdateAt, mode, travelAt, t, tz]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // the track holds the copy twice; one lap is half its width
    const half = el.scrollWidth / 2;
    if (half > 0) setDuration(Math.max(12, half / MARQUEE_SPEED));
  }, [lines]);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) useUiStore.getState().setReducedMotion(true);
  }, []);

  const item = (line: { id: string; text: string; warn?: boolean }, copy: number) => (
    <span
      key={`${copy}-${line.id}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 18,
        paddingRight: 18,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 'var(--ticker-font)',
          fontWeight: 500,
          color: line.warn ? 'var(--status-soon)' : 'var(--text)',
        }}
      >
        {line.text}
      </span>
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 99,
          background: 'color-mix(in srgb, var(--accent) 60%, transparent)',
          flex: 'none',
        }}
      />
    </span>
  );

  return (
    <footer
      data-testid="ticker"
      className="marquee-host"
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        height: 'var(--ticker-h)',
        borderRadius: 'calc(var(--radius) - 2px)',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'calc(var(--ticker-h) + 8px)',
          height: '100%',
          borderRight: '1px solid var(--line)',
          color: 'var(--accent)',
          flex: 'none',
        }}
      >
        <IconFeed size={Math.round(m.tickerFont * 1.07)} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 18,
          maskImage:
            'linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 40px),transparent)',
          WebkitMaskImage:
            'linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 40px),transparent)',
        }}
      >
        <div
          ref={trackRef}
          className={reducedMotion ? undefined : 'marquee'}
          style={
            reducedMotion
              ? { display: 'flex', width: 'max-content' }
              : ({ ['--marquee-dur' as string]: `${duration}s` } as React.CSSProperties)
          }
        >
          {lines.map((l) => item(l, 0))}
          {reducedMotion ? null : lines.map((l) => item(l, 1))}
        </div>
      </div>
      <ConnectionDot connection={connection} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: '0 14px',
          borderLeft: '1px solid var(--line)',
          flex: 'none',
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 'calc(var(--ticker-font) - 3px)',
            color: 'var(--text-dim)',
            letterSpacing: '.06em',
          }}
        >
          {t('version')}
        </span>
      </div>
      {kiosk ? null : <DemoAdminPanel tz={tz} />}
    </footer>
  );
}
