'use client';

import { useEffect } from 'react';
import { createBoundStore } from '@/lib/store/create';

type TimeState = {
  /** Server "now" in epoch ms — the local clock plus the measured server offset. */
  nowMs: number;
  /** serverNow − clientNow, measured once from `GET /api/v1/time` (or the first snapshot). */
  offsetMs: number;
  synced: boolean;
  subscribers: number;
  tick: () => void;
  setServerNow: (iso: string) => void;
  retain: () => void;
  release: () => void;
};

let timer: ReturnType<typeof setInterval> | null = null;

/** Re-sync only on a real jump (a restarted server, a changed clock mode). */
const RESYNC_THRESHOLD_MS = 5 * 60_000;

export const useTimeStore = createBoundStore<TimeState>((set, get) => ({
  nowMs: 0,
  offsetMs: 0,
  synced: false,
  subscribers: 0,

  tick: () => set({ nowMs: Date.now() + get().offsetMs }),

  setServerNow: (iso) => {
    const server = new Date(iso).getTime();
    if (!Number.isFinite(server)) return;
    const offsetMs = server - Date.now();
    const { synced, offsetMs: current } = get();
    // The clock keeps ticking from the offset measured at boot: a fixed demo clock
    // would otherwise yank the display back to its frozen instant on every snapshot.
    if (synced && Math.abs(offsetMs - current) < RESYNC_THRESHOLD_MS) return;
    set({ offsetMs, synced: true, nowMs: Date.now() + offsetMs });
  },

  retain: () => {
    const n = get().subscribers + 1;
    set({ subscribers: n });
    if (n === 1 && typeof window !== 'undefined' && timer === null) {
      get().tick();
      timer = setInterval(() => get().tick(), 1000);
    }
  },

  release: () => {
    const n = Math.max(0, get().subscribers - 1);
    set({ subscribers: n });
    if (n === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  },
}));

/**
 * 1 Hz clock. Only components that show a countdown, a progress bar or the clock
 * itself subscribe, so a tick re-renders those and nothing else.
 */
export function useNow(): number {
  const nowMs = useTimeStore((s) => s.nowMs);
  const retain = useTimeStore((s) => s.retain);
  const release = useTimeStore((s) => s.release);

  useEffect(() => {
    retain();
    return release;
  }, [retain, release]);

  return nowMs;
}

/** Read the clock without subscribing to the tick. */
export function currentNowMs(): number {
  const s = useTimeStore.getState();
  return s.nowMs || Date.now() + s.offsetMs;
}

/**
 * Seed the clock from a server-rendered instant. Runs identically on the server
 * and during hydration, so the first paint matches byte for byte.
 */
export function seedClock(iso: string): void {
  const server = new Date(iso).getTime();
  if (!Number.isFinite(server)) return;
  const st = useTimeStore.getState();
  if (st.synced && st.nowMs) return;
  useTimeStore.setState({ nowMs: server, offsetMs: server - Date.now(), synced: true });
}
