'use client';

import type { Announcement, Snapshot } from '@campuslive/contracts';
import { emptySnapshot } from '@/lib/snapshot';
import { createBoundStore } from './create';

export { emptySnapshot };

export type Connection = 'online' | 'reconnecting' | 'offline';
export type SnapshotSource = 'sse' | 'rest';
export type BoardMode = 'live' | 'travel';

export type BoardState = {
  mode: BoardMode;
  snapshot: Snapshot;
  travelAt: string | null;
  connection: Connection;
  /** Last snapshot that arrived over SSE — re-applied when leaving travel mode. */
  lastSse: Snapshot | null;
  /** Wall-clock ms when the displayed snapshot was accepted (for the stale badge). */
  lastUpdateAt: number;
  /** True while `/board` is unreachable; the map keeps drawing from the static spec. */
  apiDown: boolean;
  announcements: Announcement[];

  setSnapshot: (s: Snapshot, source: SnapshotSource) => void;
  setConnection: (c: Connection) => void;
  setTravelAt: (at: string | null) => void;
  goLive: () => void;
  pushAnnouncement: (a: Announcement) => void;
  setApiDown: (down: boolean) => void;
};

export const useBoardStore = createBoundStore<BoardState>((set, get) => ({
  mode: 'live',
  snapshot: emptySnapshot(),
  travelAt: null,
  connection: 'online',
  lastSse: null,
  lastUpdateAt: 0,
  apiDown: false,
  announcements: [],

  setSnapshot: (s, source) => {
    const { mode } = get();
    if (source === 'sse') {
      // Snapshots keep flowing while travelling, but only the travel board is shown.
      if (mode === 'travel') {
        set({ lastSse: s });
        return;
      }
      set({ lastSse: s, snapshot: s, lastUpdateAt: Date.now(), apiDown: false });
      return;
    }
    set({ snapshot: s, lastUpdateAt: Date.now(), apiDown: false });
  },

  setConnection: (connection) => set({ connection }),

  setTravelAt: (travelAt) =>
    set(travelAt ? { travelAt, mode: 'travel' } : { travelAt: null, mode: 'live' }),

  goLive: () => {
    const { lastSse } = get();
    set({
      mode: 'live',
      travelAt: null,
      ...(lastSse ? { snapshot: lastSse, lastUpdateAt: Date.now() } : {}),
    });
  },

  pushAnnouncement: (a) =>
    set((st) => ({
      announcements: [a, ...st.announcements.filter((x) => x.id !== a.id)].slice(0, 12),
    })),

  setApiDown: (apiDown) => set({ apiDown }),
}));

/* ----------------------------------------------------------------- selectors */

export const selectSnapshot = (s: BoardState) => s.snapshot;
export const selectNow = (s: BoardState) => s.snapshot.now;
export const selectNext = (s: BoardState) => s.snapshot.next;
export const selectStats = (s: BoardState) => s.snapshot.stats;
export const selectConnection = (s: BoardState) => s.connection;
export const selectMode = (s: BoardState) => s.mode;
