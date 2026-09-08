import type { RoomLiveState, SessionView, Snapshot } from '@campuslive/contracts';

/** The seeded demo day: Tuesday 2026-09-08, fixed clock 10:47 local (+05:00). */
export const NOW_ISO = '2026-09-08T05:47:00Z';
export const TZ = 'Asia/Almaty';

export function session(over: Partial<SessionView> = {}): SessionView {
  return {
    sessionId: 'lesson-1:2026-09-08',
    lessonId: '00000000-0000-0000-0000-000000000001',
    courseCode: 'CS201',
    courseTitle: 'Databases',
    lessonType: 'lecture',
    teacher: {
      id: '00000000-0000-0000-0000-0000000000aa',
      shortName: 'Akhmetov D.',
      fullName: 'Akhmetov Daniyar Bolatuly',
      department: 'Dept. of Computer Science',
    },
    groups: ['ПО2308', 'ПО2309'],
    roomId: '00000000-0000-0000-0000-0000000000bb',
    roomCode: '213',
    floor: 2,
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
    roomCode: '213',
    floor: 2,
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
    stats: { roomsTotal: 41, roomsBusy: 25, sessionsToday: 250, sessionsDone: 48 },
    rooms: [roomState({ current: session() })],
    now: [session()],
    next: [],
    ...over,
  };
}
