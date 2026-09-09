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
    // the seeded move of the demo day: 226A is closed, the class runs in 101
    expect(displayRoomCode(session({ status: 'moved', roomCode: '101', movedFromRoomCode: '226A' })))
      .toBe('226A');
  });

  it('uses the effective room for everything else', () => {
    expect(displayRoomCode(session({ roomCode: '100' }))).toBe('100');
    expect(displayRoomCode(session({ roomCode: '101', movedFromRoomCode: '226A' }))).toBe('101');
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
        roomState({ roomCode: 'AI-LAB', floor: 2, phase: 'live' }),
        roomState({ roomCode: '101', floor: 1, phase: 'ending' }),
      ],
    });
    expect(phasesByFloor(s, 2)).toEqual({ 'AI-LAB': 'live' });
    expect(phasesByFloor(s, 1)).toEqual({ '101': 'ending' });
  });
});

describe('floorBusyCounts', () => {
  it('counts live and ending rooms per floor plus the total', () => {
    const rooms = [
      roomState({ roomCode: '100', floor: 1, phase: 'live' }),
      roomState({ roomCode: '101', floor: 1, phase: 'ending' }),
      roomState({ roomCode: 'CR', floor: 1, phase: 'free' }),
      roomState({ roomCode: '200', floor: 2, phase: 'live' }),
      roomState({ roomCode: '224', floor: 2, phase: 'ending' }),
      roomState({ roomCode: '226', floor: 2, phase: 'live' }),
      roomState({ roomCode: '223', floor: 2, phase: 'soon' }),
      roomState({ roomCode: '226A', floor: 2, phase: 'free' }),
    ];
    // the building has exactly two floors now
    expect(floorBusyCounts(rooms, [1, 2])).toEqual([5, 2, 3]);
  });
});

describe('highlight', () => {
  const history = session({
    sessionId: 'now-1',
    groups: ['Группа 1', 'Группа 2', 'Группа 3'],
    roomCode: '100',
    floor: 1,
  });
  const programming = session({
    sessionId: 'next-1',
    groups: ['Группа 1'],
    roomCode: '226',
    floor: 2,
    courseCode: 'IP1302',
    courseTitle: 'Введение в программирование',
    phase: 'upcoming',
    startAt: '2026-09-08T07:00:00Z',
    endAt: '2026-09-08T07:50:00Z',
  });
  const other = session({ sessionId: 'next-2', groups: ['Группа 18'], roomCode: '219', floor: 2 });
  const s = snapshot({ now: [history], next: [programming, other] });

  it('finds the rooms a group is in now and next', () => {
    const badges = highlightedRooms(s, { kind: 'group', id: 'Группа 1' }, TZ);
    expect(Object.keys(badges).sort()).toEqual(['100', '226']);
    expect(badges['100']).toMatchObject({ kind: 'now', label: 'NOW', floor: 1 });
    expect(badges['100']?.sub).toBe('HK1105 История Казахстана · until 11:50');
    expect(badges['226']).toMatchObject({ kind: 'next', label: 'NEXT 12:00', floor: 2 });
  });

  it('points at a room that carries no lesson at all', () => {
    // The cafe, a restroom and every office are absent from `now`/`next`, so
    // without the room index searching for one used to light nothing up.
    const rooms = new Map([['CAFE', { floor: 1, name: 'Асхана' }]]);
    const badges = highlightedRooms(s, { kind: 'room', id: 'CAFE' }, TZ, rooms);
    expect(badges['CAFE']).toEqual({ kind: 'room', label: 'HERE', sub: 'Асхана', floor: 1 });
  });

  it('prefers the live lesson over the plain room badge', () => {
    const rooms = new Map([['100', { floor: 1, name: 'Мәжіліс залы' }]]);
    expect(highlightedRooms(s, { kind: 'room', id: '100' }, TZ, rooms)['100']).toMatchObject({
      kind: 'now',
    });
  });

  it('matches teachers by id, rooms by code and courses by code', () => {
    expect(
      Object.keys(highlightedRooms(s, { kind: 'teacher', id: history.teacher.id }, TZ)),
    ).toContain('100');
    expect(Object.keys(highlightedRooms(s, { kind: 'room', id: '226' }, TZ))).toEqual(['226']);
    expect(Object.keys(highlightedRooms(s, { kind: 'course', id: 'IP1302' }, TZ))).toEqual(['226']);
  });

  it('returns nothing without a highlight', () => {
    expect(highlightedRooms(s, null, TZ)).toEqual({});
  });

  it('filters the board to the same sessions', () => {
    expect(filterSessions(s.next, { kind: 'group', id: 'Группа 1' }).map((x) => x.sessionId)).toEqual(
      ['next-1'],
    );
    expect(filterSessions(s.next, null)).toBe(s.next);
  });
});
