'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MapSpec, Snapshot } from '@campuslive/contracts';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useViewportMetrics } from '@/features/metrics/useViewportMetrics';
import { useOptimisticRefetch, useRealtime } from '@/features/realtime/useRealtime';
import { seedClock } from '@/features/time/useNow';
import { useKiosk } from '@/features/kiosk/useKiosk';
import { Board } from '@/components/board/Board';
import { LiveClock } from '@/components/chrome/LiveClock';
import { LogoMark } from '@/components/chrome/Icons';
import { Ticker } from '@/components/chrome/Ticker';
import { MapStage } from '@/components/map/MapStage';

export type KioskAppProps = {
  initialSnapshot: Snapshot;
  mapSpec: MapSpec;
  initialTime: string;
  apiDown?: boolean;
  floorCycleMs: number;
  pageMs: number;
};

function FloorIndicator({
  floors,
  active,
  progress,
  secondsLeft,
}: {
  floors: number[];
  active: number | null;
  progress: number;
  secondsLeft: number;
}) {
  const t = useTranslations('kiosk');
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <div
      data-testid="kiosk-floor-indicator"
      data-floor={active ?? ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        height: 'calc(var(--tab-h) + 6px)',
        padding: '0 16px',
        borderRadius: 10,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid var(--line)',
      }}
    >
      {floors.map((n) => (
        <span
          key={n}
          className="mono"
          style={{
            fontSize: 'calc(var(--tab-font) + 1px)',
            fontWeight: 800,
            letterSpacing: '.06em',
            color: n === active ? 'var(--accent)' : 'var(--text-dim)',
          }}
        >
          F{n}
        </span>
      ))}
      <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: 'block' }} aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray={c.toFixed(1)}
          strokeDashoffset={(c * (1 - progress)).toFixed(1)}
          transform="rotate(-90 12 12)"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="mono"
        style={{
          fontSize: 'calc(var(--tab-font) - 1px)',
          color: 'var(--text-dim)',
          letterSpacing: '.06em',
          whiteSpace: 'nowrap',
        }}
      >
        {t('nextFloor', { n: secondsLeft })}
      </span>
    </div>
  );
}

export function KioskApp({
  initialSnapshot,
  mapSpec,
  initialTime,
  apiDown = false,
  floorCycleMs,
  pageMs,
}: KioskAppProps) {
  const brand = useTranslations('brand');

  useState(() => {
    useBoardStore.setState({
      snapshot: initialSnapshot,
      lastSse: apiDown ? null : initialSnapshot,
      connection: apiDown ? 'offline' : 'online',
      apiDown,
      lastUpdateAt: new Date(initialSnapshot.at).getTime(),
    });
    seedClock(initialTime);
    return true;
  });

  useViewportMetrics();
  useRealtime(initialSnapshot.building);
  useOptimisticRefetch(initialSnapshot.building);

  const floors = mapSpec.floors.map((f) => f.number);
  const kiosk = useKiosk(floors, floorCycleMs);
  const tz = mapSpec.timezone || 'Asia/Almaty';

  const now = useBoardStore((s) => s.snapshot.now);
  const next = useBoardStore((s) => s.snapshot.next);
  const afterHours = now.length === 0 && next.length === 0;

  useEffect(() => {
    // no pointer, no parallax, no hover pausing
    useUiStore.getState().setReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    return () => useUiStore.getState().setFocusedFloor(null);
  }, []);

  return (
    <main
      data-testid="kiosk"
      style={{
        position: 'relative',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'var(--header-h) minmax(0,1fr) var(--ticker-h)',
        gridTemplateColumns: 'minmax(0,1fr) var(--board-w)',
        gap: 'var(--gap)',
        padding: 'var(--gutter)',
        background: 'var(--bg)',
        color: 'var(--text)',
        cursor: 'none',
      }}
    >
      <header
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          height: 'var(--header-h)',
          padding: '0 6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <LogoMark size={30} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 'var(--brand)', fontWeight: 800, lineHeight: 1.1 }}>
              {brand('title')}
            </span>
            <span
              style={{
                fontSize: 'var(--brand-sub)',
                color: 'var(--text-dim)',
                fontWeight: 500,
                lineHeight: 1.1,
              }}
            >
              {brand('subtitle')}
            </span>
          </div>
        </div>
        <div style={{ width: 1, height: 'calc(var(--header-h) * 0.5)', background: 'var(--line)' }} />
        <LiveClock tz={tz} initialAt={initialTime} />
        <div style={{ flex: 1 }} />
        <FloorIndicator
          floors={floors}
          active={kiosk.floor}
          progress={kiosk.progress}
          secondsLeft={kiosk.secondsLeft}
        />
        <div style={{ flex: 1 }} />
      </header>

      <MapStage spec={mapSpec} tz={tz} kiosk lit={afterHours} />
      <Board tz={tz} kiosk pageMs={pageMs} />
      <Ticker tz={tz} kiosk />
    </main>
  );
}
