import type { RoomLiveState, SessionView, Snapshot } from '@campuslive/contracts';

/** The seeded demo day: Tuesday 2026-09-08, fixed clock 10:47 local (+05:00). */
export const NOW_ISO = '2026-09-08T05:47:00Z';
export const TZ = 'Asia/Almaty';

/**
 * The real building: two floors, 51 spaces, 13 of them schedulable, five courses
 * and the placeholder roster (`Преподаватель N` / `Группа N`). The default row is
 * the Assembly Hall's `HK1105`, 10:00–11:50 — the hero session of the demo day.
 */
export function session(over: Partial<SessionView> = {}): SessionView {
  return {
    sessionId: 'lesson-1:2026-09-08',
    lessonId: '00000000-0000-0000-0000-000000000001',
    courseCode: 'HK1105',
    courseTitle: 'История Казахстана',
    lessonType: 'lecture',
    teacher: {
      id: '00000000-0000-0000-0000-0000000000aa',
      shortName: 'Преподаватель 7',
      fullName: 'Преподаватель 7',
      department: '—',
    },
    groups: ['Группа 1', 'Группа 2'],
    roomId: '00000000-0000-0000-0000-0000000000bb',
    roomCode: '100',
    floor: 1,
    startAt: '2026-09-08T05:00:00Z',
    endAt: '2026-09-08T06:50:00Z',
    status: 'scheduled',
    phase: 'live',
    conflict: false,
    ...over,
  };
}

export function roomState(over: Partial<RoomLiveState> = {}): RoomLiveState {
  return {
    roomId: '00000000-0000-0000-0000-0000000000bb',
    roomCode: '100',
    floor: 1,
    phase: 'live',
    ...over,
  };
}

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    building: 'A',
    at: NOW_ISO,
    date: '2026-09-08',
    weekNumber: 3,
    weekParity: 'odd',
    nextTransitionAt: '2026-09-08T05:50:00Z',
    stats: { roomsTotal: 13, roomsBusy: 10, sessionsToday: 65, sessionsDone: 12 },
    rooms: [roomState({ current: session() })],
    now: [session()],
    next: [],
    ...over,
  };
}
