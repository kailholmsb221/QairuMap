import { describe, expect, it } from 'vitest';
import {
  displayRoomCode,
  filterSessions,
  floorBusyCounts,
  highlightedRooms,
  phasesByFloor,
  pillKindOf,
  roomDisplayPhase,
} from './selectors';
import { TZ, roomState, session, snapshot } from '@/test/fixtures';

describe('pillKindOf', () => {
  it('lets the session status win over the phase', () => {
    expect(pillKindOf(session({ status: 'cancelled', phase: 'upcoming' }))).toBe('cancelled');
    expect(pillKindOf(session({ status: 'moved', phase: 'soon' }))).toBe('moved');
    expect(pillKindOf(session({ status: 'delayed', phase: 'live' }))).toBe('delayed');
  });

  it('falls back to the engine phase for scheduled sessions', () => {
    expect(pillKindOf(session({ phase: 'live' }))).toBe('live');
    expect(pillKindOf(session({ phase: 'ending' }))).toBe('ending');
    expect(pillKindOf(session({ phase: 'soon' }))).toBe('soon');
    expect(pillKindOf(session({ phase: 'upcoming' }))).toBe('upcoming');
    expect(pillKindOf(session({ phase: 'done' }))).toBe('upcoming');
  });
});

describe('displayRoomCode', () => {
  it('keeps a moved row in the original room column', () => {
    expect(displayRoomCode(session({ status: 'moved', roomCode: '414', movedFromRoomCode: '412' })))
      .toBe('412');
  });

  it('uses the effective room for everything else', () => {
    expect(displayRoomCode(session({ roomCode: '213' }))).toBe('213');
    expect(displayRoomCode(session({ roomCode: '414', movedFromRoomCode: '412' }))).toBe('414');
  });
});

describe('roomDisplayPhase', () => {
  it('passes the engine phase through', () => {
    expect(roomDisplayPhase(roomState({ phase: 'free' }))).toBe('free');
    expect(roomDisplayPhase(roomState({ phase: 'ending' }))).toBe('ending');
  });

  it('refines a delayed live session and a conflict', () => {
    expect(
      roomDisplayPhase(roomState({ phase: 'live', current: session({ status: 'delayed' }) })),
    ).toBe('delayed');
    expect(
      roomDisplayPhase(roomState({ phase: 'live', current: session({ conflict: true }) })),
    ).toBe('conflict');
  });

  it('treats a missing room as free', () => {
    expect(roomDisplayPhase(undefined)).toBe('free');
  });
});

describe('phasesByFloor', () => {
  it('collects only the rooms of one floor', () => {
    const s = snapshot({
      rooms: [
        roomState({ roomCode: '213', floor: 2, phase: 'live' }),
        roomState({ roomCode: '101', floor: 1, phase: 'ending' }),
      ],
    });
    expect(phasesByFloor(s, 2)).toEqual({ '213': 'live' });
    expect(phasesByFloor(s, 1)).toEqual({ '101': 'ending' });
  });
});

describe('floorBusyCounts', () => {
  it('counts live and ending rooms per floor plus the total', () => {
    const rooms = [
      roomState({ roomCode: '101', floor: 1, phase: 'live' }),
      roomState({ roomCode: '110', floor: 1, phase: 'ending' }),
      roomState({ roomCode: '213', floor: 2, phase: 'live' }),
      roomState({ roomCode: '214', floor: 2, phase: 'soon' }),
      roomState({ roomCode: '215', floor: 2, phase: 'free' }),
    ];
    expect(floorBusyCounts(rooms, [1, 2, 3, 4])).toEqual([3, 2, 1, 0, 0]);
  });
});

describe('highlight', () => {
  const dbs = session({ sessionId: 'now-1', groups: ['ПО2308', 'ПО2309'], roomCode: '213' });
  const pm = session({
    sessionId: 'next-1',
    groups: ['ПО2308'],
    roomCode: '205',
    courseCode: 'PM200',
    courseTitle: 'Project Management',
    phase: 'upcoming',
    startAt: '2026-09-08T07:00:00Z',
    endAt: '2026-09-08T07:50:00Z',
  });
  const other = session({ sessionId: 'next-2', groups: ['ИС2301'], roomCode: '303' });
  const s = snapshot({ now: [dbs], next: [pm, other] });

  it('finds the rooms a group is in now and next', () => {
    const badges = highlightedRooms(s, { kind: 'group', id: 'ПО2308' }, TZ);
    expect(Object.keys(badges).sort()).toEqual(['205', '213']);
    expect(badges['213']).toMatchObject({ kind: 'now', label: 'NOW' });
    expect(badges['213']?.sub).toBe('CS201 Databases · until 11:50');
    expect(badges['205']).toMatchObject({ kind: 'next', label: 'NEXT 12:00' });
  });

  it('matches teachers by id, rooms by code and courses by code', () => {
    expect(Object.keys(highlightedRooms(s, { kind: 'teacher', id: dbs.teacher.id }, TZ))).toContain(
      '213',
    );
    expect(Object.keys(highlightedRooms(s, { kind: 'room', id: '205' }, TZ))).toEqual(['205']);
    expect(Object.keys(highlightedRooms(s, { kind: 'course', id: 'PM200' }, TZ))).toEqual(['205']);
  });

  it('returns nothing without a highlight', () => {
    expect(highlightedRooms(s, null, TZ)).toEqual({});
  });

  it('filters the board to the same sessions', () => {
    expect(filterSessions(s.next, { kind: 'group', id: 'ПО2308' }).map((x) => x.sessionId)).toEqual([
      'next-1',
    ]);
    expect(filterSessions(s.next, null)).toBe(s.next);
  });
});
