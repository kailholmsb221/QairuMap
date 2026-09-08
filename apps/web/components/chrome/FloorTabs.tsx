'use client';

import { useTranslations } from 'next-intl';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { floorBusyCounts } from '@/features/board/selectors';

export function FloorTabs({ floors }: { floors: number[] }) {
  const t = useTranslations('header');
  const rooms = useBoardStore((s) => s.snapshot.rooms);
  const focusedFloor = useUiStore((s) => s.focusedFloor);
  const setFocusedFloor = useUiStore((s) => s.setFocusedFloor);

  const counts = floorBusyCounts(rooms, floors);
  const labels = [t('all'), ...floors.map(String)];

  return (
    <div
      role="tablist"
      aria-label={t('floors')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        borderRadius: 10,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid var(--line)',
      }}
    >
      {labels.map((label, i) => {
        const floor = i === 0 ? null : floors[i - 1];
        const active = (focusedFloor ?? null) === (floor ?? null);
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`floor-tab-${floor ?? 'all'}`}
            onClick={() => setFocusedFloor(floor ?? null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 'var(--tab-h)',
              padding: '0 calc(var(--tab-h) * 0.38)',
              borderRadius: 7,
              background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-dim)',
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 'var(--tab-font)', fontWeight: 700, letterSpacing: '.04em' }}
            >
              {label}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 'calc(var(--tab-font) - 2px)',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 99,
                background: active
                  ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                  : 'rgba(255,255,255,.07)',
                color: active ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {counts[i]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
