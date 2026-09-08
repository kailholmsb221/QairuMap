'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { formatDateLine, minutesOfDay } from '@/features/time/derive';
import {
  DAY_END_MIN,
  DAY_SPAN_MIN,
  DAY_START_MIN,
  pctOfMinutes,
  useTimeTravel,
} from '@/features/time-travel/useTimeTravel';

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i);
const SLOTS = 12;

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * `timeBarCollapsed()` / `timeBarExpanded()`: a 4 px line that opens into the day
 * timeline on hover — hour ticks, an occupancy heat strip from `/timeline`, and a
 * playhead you can drag to travel in time.
 */
export function TimeTravelBar({ tz }: { tz: string }) {
  const t = useTranslations('travel');
  const date = useBoardStore((s) => s.snapshot.date);
  const roomsTotal = useBoardStore((s) => s.snapshot.stats.roomsTotal);
  const travelOpen = useUiStore((s) => s.travelOpen);
  const setTravelOpen = useUiStore((s) => s.setTravelOpen);
  const { currentMinutes, scrubTo } = useTimeTravel(tz);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const { data: timeline } = useQuery({
    queryKey: ['timeline', date],
    queryFn: () => api.timeline('A', date),
    enabled: travelOpen,
    staleTime: 5 * 60_000,
  });

  const heat = useMemo(() => {
    const buckets = new Array<number>(SLOTS).fill(0);
    for (const s of timeline?.sessions ?? []) {
      if (s.status === 'cancelled') continue;
      const from = minutesOfDay(s.startAt, tz);
      const to = minutesOfDay(s.endAt, tz);
      for (let i = 0; i < SLOTS; i++) {
        const slotStart = DAY_START_MIN + i * 60;
        if (from < slotStart + 60 && to > slotStart) buckets[i] = (buckets[i] ?? 0) + 1;
      }
    }
    return buckets;
  }, [timeline, tz]);

  const pct = pctOfMinutes(currentMinutes);
  const max = Math.max(roomsTotal || 41, ...heat, 1);

  const minutesFromEvent = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return currentMinutes;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return DAY_START_MIN + ratio * DAY_SPAN_MIN;
  };

  if (!travelOpen) {
    return (
      <div
        data-testid="time-travel-collapsed"
        onMouseEnter={() => setTravelOpen(true)}
        onFocus={() => setTravelOpen(true)}
        tabIndex={0}
        role="slider"
        aria-label={t('open')}
        aria-valuemin={DAY_START_MIN}
        aria-valuemax={DAY_END_MIN}
        aria-valuenow={Math.round(currentMinutes)}
        aria-valuetext={hhmm(Math.round(currentMinutes))}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 4,
          background: 'rgba(255,255,255,.06)',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${(pct * 100).toFixed(1)}%`,
            background: 'color-mix(in srgb, var(--accent) 35%, transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${(pct * 100).toFixed(1)}%`,
            top: -4,
            width: 2,
            height: 12,
            marginLeft: -1,
            background: 'var(--accent)',
            boxShadow: '0 0 8px rgba(94,234,212,.7)',
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="time-travel"
      onMouseLeave={() => {
        if (!dragging) setTravelOpen(false);
      }}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 96,
        padding: '12px 18px 10px',
        background:
          'linear-gradient(180deg,rgba(11,15,23,0) 0%,rgba(11,15,23,.92) 28%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          className="mono"
          style={{
            fontSize: 'var(--legend-font)',
            letterSpacing: '.12em',
            color: 'var(--text-dim)',
            fontWeight: 600,
          }}
        >
          {t('title', { date: formatDateLine(`${date}T12:00:00Z`, tz) })}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 'var(--legend-font)',
            letterSpacing: '.06em',
            color: 'var(--text-dim)',
          }}
        >
          {t('hint')}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t('open')}
        aria-valuemin={DAY_START_MIN}
        aria-valuemax={DAY_END_MIN}
        aria-valuenow={Math.round(currentMinutes)}
        aria-valuetext={hhmm(Math.round(currentMinutes))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') scrubTo(currentMinutes - 15);
          if (e.key === 'ArrowRight') scrubTo(currentMinutes + 15);
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
          scrubTo(minutesFromEvent(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging) scrubTo(minutesFromEvent(e.clientX));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        style={{ position: 'relative', height: 36, cursor: 'ew-resize', touchAction: 'none' }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 8,
            height: 14,
            display: 'flex',
            gap: 2,
          }}
        >
          {heat.map((v, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                borderRadius: 2,
                background: `rgba(45,212,191,${(0.08 + (v / max) * 0.6).toFixed(2)})`,
              }}
            />
          ))}
        </div>
        {HOURS.map((h, i) => (
          <span
            key={h}
            style={{
              position: 'absolute',
              left: `${((i / 12) * 100).toFixed(2)}%`,
              top: 0,
              width: 1,
              height: 30,
              background: 'rgba(255,255,255,.14)',
            }}
          />
        ))}
        <div
          data-testid="playhead"
          style={{
            position: 'absolute',
            left: `${(pct * 100).toFixed(2)}%`,
            top: -6,
            bottom: -4,
            width: 2,
            marginLeft: -1,
            background: 'var(--status-soon)',
            boxShadow: '0 0 10px rgba(251,191,36,.7)',
          }}
        />
        <div
          className="mono"
          style={{
            position: 'absolute',
            left: `${(pct * 100).toFixed(2)}%`,
            top: -30,
            transform: 'translateX(-50%)',
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--status-soon)',
            color: '#0B0F17',
            fontSize: 'calc(var(--legend-font) + 1px)',
            fontWeight: 800,
            letterSpacing: '.06em',
            pointerEvents: 'none',
          }}
        >
          {hhmm(Math.round(currentMinutes))}
        </div>
      </div>

      <div style={{ position: 'relative', height: 14 }}>
        {HOURS.map((h, i) => (
          <span
            key={h}
            className="mono"
            style={{
              position: 'absolute',
              left: `${((i / 12) * 100).toFixed(2)}%`,
              transform: `translateX(${i === 0 ? '0' : i === 12 ? '-100%' : '-50%'})`,
              fontSize: 'calc(var(--legend-font) - 1px)',
              color: 'var(--text-dim)',
            }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  );
}
