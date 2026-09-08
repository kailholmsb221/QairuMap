'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { parseDuration } from '@/lib/duration';

export { parseDuration };

export type KioskState = {
  floor: number | null;
  /** 0…1 through the current floor's slot — drives the ring. */
  progress: number;
  secondsLeft: number;
};

/**
 * Rotates the focus over the floors that actually have busy rooms. Falls back to
 * every floor when the building is empty, so the kiosk never freezes on one plate.
 */
export function useKiosk(floors: number[], cycleMs: number): KioskState {
  const rooms = useBoardStore((s) => s.snapshot.rooms);
  const setFocusedFloor = useUiStore((s) => s.setFocusedFloor);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(Date.now());

  const busyFloors = useMemo(() => {
    const busy = new Set<number>();
    for (const r of rooms) {
      if (r.phase === 'live' || r.phase === 'ending' || r.phase === 'soon') busy.add(r.floor);
    }
    const list = floors.filter((f) => busy.has(f));
    return list.length ? list : floors;
  }, [rooms, floors]);

  useEffect(() => {
    startedAt.current = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      if (elapsed >= cycleMs) {
        startedAt.current = Date.now();
        setIndex((i) => i + 1);
        setProgress(0);
      } else {
        setProgress(elapsed / cycleMs);
      }
    }, 200);
    return () => clearInterval(tick);
  }, [cycleMs]);

  const floor = busyFloors.length ? (busyFloors[index % busyFloors.length] ?? null) : null;

  useEffect(() => {
    setFocusedFloor(floor);
  }, [floor, setFocusedFloor]);

  return {
    floor,
    progress,
    secondsLeft: Math.max(0, Math.ceil((cycleMs * (1 - progress)) / 1000)),
  };
}
