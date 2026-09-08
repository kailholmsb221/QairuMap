'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MapSpec, Snapshot } from '@campuslive/contracts';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useViewportMetrics, useViewportSize } from '@/features/metrics/useViewportMetrics';
import { useOptimisticRefetch, useRealtime } from '@/features/realtime/useRealtime';
import { seedClock } from '@/features/time/useNow';
import { Header } from '@/components/chrome/Header';
import { Ticker } from '@/components/chrome/Ticker';
import { Board } from '@/components/board/Board';
import { MapStage } from '@/components/map/MapStage';
import { RoomDetailPanel } from '@/components/panels/RoomDetailPanel';
import { SearchPalette } from '@/components/panels/SearchPalette';

export type CampusLiveAppProps = {
  initialSnapshot: Snapshot;
  mapSpec: MapSpec;
  initialTime: string;
  apiDown?: boolean;
};

/** Below this width the map and the board become tabs — the page still never scrolls. */
const COMPACT_WIDTH = 1024;

export function CampusLiveApp({
  initialSnapshot,
  mapSpec,
  initialTime,
  apiDown = false,
}: CampusLiveAppProps) {
  const tc = useTranslations('compact');

  // Bootstrap synchronously so the server-rendered frame already shows live data.
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

  const { width } = useViewportSize();
  const compact = width > 0 && width < COMPACT_WIDTH;
  const compactTab = useUiStore((s) => s.compactTab);
  const setCompactTab = useUiStore((s) => s.setCompactTab);
  const setFocusedFloor = useUiStore((s) => s.setFocusedFloor);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const setHighlight = useUiStore((s) => s.setHighlight);

  const now = useBoardStore((s) => s.snapshot.now);
  const next = useBoardStore((s) => s.snapshot.next);
  const afterHours = now.length === 0 && next.length === 0;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => useUiStore.getState().setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const ui = useUiStore.getState();
      if (ui.searchOpen) return; // the dialog handles its own Escape
      if (ui.selectedRoomCode) {
        selectRoom(null);
        return;
      }
      if (ui.highlight) {
        setHighlight(null);
        return;
      }
      if (ui.focusedFloor !== null) setFocusedFloor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectRoom, setFocusedFloor, setHighlight]);

  const tz = mapSpec.timezone || 'Asia/Almaty';

  return (
    <main
      data-testid="app"
      style={{
        position: 'relative',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'var(--header-h) minmax(0,1fr) var(--ticker-h)',
        gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'minmax(0,1fr) var(--board-w)',
        gap: 'var(--gap)',
        padding: 'var(--gutter)',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <Header tz={tz} initialAt={initialTime} floors={mapSpec.floors.map((f) => f.number)} />

      {compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div
            role="tablist"
            style={{
              display: 'flex',
              gap: 4,
              padding: 3,
              borderRadius: 10,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--line)',
              flex: 'none',
            }}
          >
            {(['map', 'board'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={compactTab === tab}
                onClick={() => setCompactTab(tab)}
                style={{
                  flex: 1,
                  height: 'var(--tab-h)',
                  borderRadius: 7,
                  fontSize: 'var(--tab-font)',
                  fontWeight: 700,
                  background:
                    compactTab === tab
                      ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                      : 'transparent',
                  color: compactTab === tab ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                {tc(tab)}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'grid' }}>
            {compactTab === 'map' ? (
              <MapStage spec={mapSpec} tz={tz} lit={afterHours} />
            ) : (
              <Board tz={tz} />
            )}
          </div>
        </div>
      ) : (
        <>
          <MapStage spec={mapSpec} tz={tz} lit={afterHours} />
          <Board tz={tz} />
        </>
      )}

      <Ticker tz={tz} />

      <RoomDetailPanel spec={mapSpec} tz={tz} />
      <SearchPalette tz={tz} />
    </main>
  );
}
