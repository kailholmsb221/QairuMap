'use client';

import { useTranslations } from 'next-intl';
import { useBoardStore } from '@/lib/store/boardStore';
import { useMetrics } from '@/features/metrics/useViewportMetrics';
import { formatClock, formatDateLine } from '@/features/time/derive';
import { useNow } from '@/features/time/useNow';
import { IconLive } from './Icons';

export type LiveClockProps = {
  tz: string;
  /** Server time rendered on the server, so the first paint is not blank. */
  initialAt: string;
};

/**
 * 44 px mono `HH:MM:SS` synced to the server clock, with the local date and the
 * teaching week beside it. In travel mode the time turns amber and is tagged
 * `SIMULATED`, next to the button that returns to the live feed.
 */
export function LiveClock({ tz, initialAt }: LiveClockProps) {
  const t = useTranslations('header');
  const m = useMetrics();
  const nowMs = useNow();
  const mode = useBoardStore((s) => s.mode);
  const travelAt = useBoardStore((s) => s.travelAt);
  const weekNumber = useBoardStore((s) => s.snapshot.weekNumber);
  const weekParity = useBoardStore((s) => s.snapshot.weekParity);
  const goLive = useBoardStore((s) => s.goLive);

  const simulated = mode === 'travel';
  const at = simulated && travelAt ? new Date(travelAt).getTime() : nowMs || new Date(initialAt).getTime();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span
        className="mono"
        data-testid="clock"
        suppressHydrationWarning
        style={{
          fontSize: 'var(--clock-size)',
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '-.01em',
          color: simulated ? 'var(--status-soon)' : 'var(--text)',
        }}
      >
        {formatClock(at, tz)}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          className="mono"
          suppressHydrationWarning
          style={{
            fontSize: 'var(--clock-sub)',
            fontWeight: 600,
            letterSpacing: '.12em',
            color: 'var(--text-dim)',
          }}
        >
          {formatDateLine(at, tz)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 'var(--clock-sub)',
            fontWeight: 600,
            letterSpacing: '.12em',
            color: 'var(--text-dim)',
          }}
        >
          {t('week', {
            number: weekNumber,
            parity: weekParity === 'odd' ? t('odd') : t('even'),
          })}
        </span>
      </div>
      {simulated ? (
        <>
          <span
            className="pill"
            data-testid="simulated"
            style={{
              height: 'calc(var(--tab-h) - 6px)',
              padding: '0 10px',
              fontSize: 'calc(var(--tab-font) - 2px)',
              color: 'var(--status-soon)',
              background: 'color-mix(in srgb, var(--status-soon) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--status-soon) 40%, transparent)',
            }}
          >
            {t('simulated')}
          </span>
          <button
            type="button"
            data-testid="go-live"
            onClick={goLive}
            aria-label={t('backToLive')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 'var(--tab-h)',
              padding: '0 12px',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <IconLive size={Math.round(m.tabFont * 1.23)} />
            <span
              className="mono"
              style={{ fontSize: 'var(--tab-font)', fontWeight: 800, letterSpacing: '.1em' }}
            >
              {t('live')}
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}
