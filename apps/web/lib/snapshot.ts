import type { Snapshot } from '@campuslive/contracts';

/**
 * An empty snapshot — the store's initial value and the fallback a Server
 * Component renders with when `/board` is unreachable. Lives outside the store
 * so the RSC layer can import it without pulling in client-only hooks.
 */
export function emptySnapshot(building = 'A'): Snapshot {
  const at = new Date().toISOString();
  return {
    building,
    at,
    date: at.slice(0, 10),
    weekNumber: 1,
    weekParity: 'odd',
    stats: { roomsTotal: 0, roomsBusy: 0, sessionsToday: 0, sessionsDone: 0 },
    rooms: [],
    now: [],
    next: [],
  };
}
