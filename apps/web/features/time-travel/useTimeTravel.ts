'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { atLocalMinutes, minutesOfDay } from '@/features/time/derive';

/** The scrubbable day, in local minutes. */
export const DAY_START_MIN = 8 * 60;
export const DAY_END_MIN = 20 * 60;
export const DAY_SPAN_MIN = DAY_END_MIN - DAY_START_MIN;

export const clampMinutes = (m: number) =>
  Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, Math.round(m)));

/** 0…1 position of a local minute-of-day on the bar. */
export const pctOfMinutes = (m: number) => (clampMinutes(m) - DAY_START_MIN) / DAY_SPAN_MIN;

export function useTimeTravel(tz: string) {
  const mode = useBoardStore((s) => s.mode);
  const travelAt = useBoardStore((s) => s.travelAt);
  const snapshotAt = useBoardStore((s) => s.snapshot.at);
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Drag handler: local playhead moves at once, `/board?at=` follows 120 ms later. */
  const scrubTo = useCallback(
    (minutes: number) => {
      const target = clampMinutes(minutes);
      setPending(target);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const iso = new Date(atLocalMinutes(snapshotAt, tz, target)).toISOString();
        const ticket = ++seq.current;
        useBoardStore.getState().setTravelAt(iso);
        try {
          const s = await api.board('A', { at: iso });
          if (ticket !== seq.current) return;
          useBoardStore.getState().setSnapshot(s, 'rest');
        } catch {
          /* the board keeps the last state; the connection dot already reports it */
        }
      }, 120);
    },
    [snapshotAt, tz],
  );

  const goLive = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    seq.current++;
    setPending(null);
    useBoardStore.getState().goLive();
  }, []);

  const currentMinutes =
    pending ??
    (mode === 'travel' && travelAt
      ? minutesOfDay(travelAt, tz)
      : minutesOfDay(snapshotAt, tz));

  return { mode, currentMinutes, scrubTo, goLive };
}
