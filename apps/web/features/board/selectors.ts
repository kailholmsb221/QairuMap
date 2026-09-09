import type { RoomLiveState, SessionView, Snapshot } from '@campuslive/contracts';
import type { Highlight } from '@/lib/store/uiStore';
import { formatHm } from '@/features/time/derive';

/** The seven pill kinds the design draws. Status wins over phase. */
export type PillKind =
  | 'live'
  | 'ending'
  | 'soon'
  | 'upcoming'
  | 'cancelled'
  | 'moved'
  | 'delayed';

export function pillKindOf(s: SessionView): PillKind {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'moved') return 'moved';
  if (s.status === 'delayed') return 'delayed';
  switch (s.phase) {
    case 'live':
      return 'live';
    case 'ending':
      return 'ending';
    case 'soon':
      return 'soon';
    default:
      return 'upcoming';
  }
}

/**
 * The room shown in the row's flap: a moved session keeps its row in the original
 * room's column, with `MOVED → {roomCode}` telling you where it went.
 */
export function displayRoomCode(s: SessionView): string {
  return s.status === 'moved' && s.movedFromRoomCode ? s.movedFromRoomCode : s.roomCode;
}

/** What a room shape is painted as. `delayed` and `conflict` are display-only refinements. */
export type RoomDisplayPhase = 'free' | 'soon' | 'live' | 'ending' | 'delayed' | 'conflict';

export function roomDisplayPhase(r: RoomLiveState | undefined): RoomDisplayPhase {
  if (!r) return 'free';
  const current = r.current;
  if (current?.conflict) return 'conflict';
  if (current?.status === 'delayed' && (r.phase === 'live' || r.phase === 'ending')) return 'delayed';
  return r.phase;
}

/** `{ '213': 'live', … }` for one floor — the map's only per-room input. */
export function phasesByFloor(snapshot: Snapshot, floor: number): Record<string, RoomDisplayPhase> {
  const out: Record<string, RoomDisplayPhase> = {};
  for (const r of snapshot.rooms) {
    if (r.floor !== floor) continue;
    out[r.roomCode] = roomDisplayPhase(r);
  }
  return out;
}

export function roomStateOf(snapshot: Snapshot, code: string): RoomLiveState | undefined {
  return snapshot.rooms.find((r) => r.roomCode === code);
}

/** `[all, f1, f2, f3, f4]` busy counts for the floor tabs. */
export function floorBusyCounts(rooms: readonly RoomLiveState[], floors: number[]): number[] {
  const counts = new Map<number, number>(floors.map((f) => [f, 0]));
  let all = 0;
  for (const r of rooms) {
    if (r.phase !== 'live' && r.phase !== 'ending') continue;
    all += 1;
    counts.set(r.floor, (counts.get(r.floor) ?? 0) + 1);
  }
  return [all, ...floors.map((f) => counts.get(f) ?? 0)];
}

/* ------------------------------------------------------------- highlighting */

export function sessionMatches(s: SessionView, h: Highlight): boolean {
  if (!h) return false;
  switch (h.kind) {
    case 'group':
      return s.groups.includes(h.id);
    case 'teacher':
      return s.teacher.id === h.id || s.teacher.shortName === h.id;
    case 'room':
      return s.roomCode === h.id || s.movedFromRoomCode === h.id;
    case 'course':
      return s.courseCode === h.id;
    default:
      return false;
  }
}

export type HighlightBadge = {
  kind: 'now' | 'next' | 'room';
  label: string;
  sub: string;
  floor: number;
};

/** What the map knows about a room the schedule never mentions. */
export type RoomIndex = ReadonlyMap<string, { floor: number; name: string }>;

/**
 * Rooms the current highlight points at, with the badge the map draws over them.
 *
 * `rooms` is what makes a room hit work for a space that never carries a lesson —
 * the cafe, a restroom, an office. Those are absent from `now`/`next`, so without
 * it searching for one would light nothing up.
 */
export function highlightedRooms(
  snapshot: Snapshot,
  h: Highlight,
  tz: string,
  rooms?: RoomIndex,
): Record<string, HighlightBadge> {
  const out: Record<string, HighlightBadge> = {};
  if (!h) return out;
  for (const s of snapshot.now) {
    if (!sessionMatches(s, h)) continue;
    out[s.roomCode] = {
      kind: 'now',
      label: 'NOW',
      sub: `${s.courseCode} ${s.courseTitle} · until ${formatHm(s.endAt, tz)}`,
      floor: s.floor,
    };
  }
  for (const s of snapshot.next) {
    if (!sessionMatches(s, h) || out[s.roomCode] || s.status === 'cancelled') continue;
    out[s.roomCode] = {
      kind: 'next',
      label: `NEXT ${formatHm(s.startAt, tz)}`,
      sub: `${s.courseCode} ${s.courseTitle}`,
      floor: s.floor,
    };
  }

  // A room the user searched for is always pointed at, teaching or not.
  if (h.kind === 'room' && !out[h.id]) {
    const meta = rooms?.get(h.id);
    if (meta) out[h.id] = { kind: 'room', label: 'HERE', sub: meta.name, floor: meta.floor };
  }
  return out;
}

/** Board rows, filtered to the highlight when one is active. */
export function filterSessions(sessions: readonly SessionView[], h: Highlight): SessionView[] {
  if (!h) return sessions as SessionView[];
  return sessions.filter((s) => sessionMatches(s, h));
}
