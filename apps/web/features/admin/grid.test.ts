import { describe, expect, it } from 'vitest';
import type { Lesson, LessonParity, LessonType, RoomInfo } from '@campuslive/contracts';
import {
  buildGridIndex,
  cellKey,
  cellSpan,
  isCovered,
  isoWeekday,
  lessonErrorField,
  lessonsAt,
  naturalCompare,
  parityVisible,
  schedulableRooms,
} from './grid';

/** A lesson of the real building: five courses, 13 schedulable rooms, 10 slots. */
function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: over.id ?? 'l1',
    semesterId: 'f53cbe53-1c4b-5a64-849e-bacfe171b635',
    courseId: 'c1',
    courseCode: 'HK1105',
    courseTitle: 'История Казахстана',
    teacherId: 't7',
    teacherName: 'Преподаватель 7',
    roomId: 'r100',
    roomCode: '100',
    slotId: 's3',
    slotIdx: 3,
    startsAt: '10:00',
    endsAt: '10:50',
    weekday: 2,
    parity: 'all' as LessonParity,
    type: 'lecture' as LessonType,
    slotSpan: 1,
    groups: [{ id: 'g1', code: 'Группа 1' }],
    ...over,
  };
}

function room(over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    id: over.code ?? 'x',
    code: '100',
    name: 'Мәжіліс залы',
    floor: 1,
    type: 'lecture',
    wing: 'south',
    schedulable: true,
    ...over,
  };
}

describe('parityVisible', () => {
  it('shows everything under the "all weeks" filter', () => {
    expect(parityVisible('all', 'all')).toBe(true);
    expect(parityVisible('odd', 'all')).toBe(true);
    expect(parityVisible('even', 'all')).toBe(true);
  });

  it('keeps the every-week lessons visible in a single-parity week', () => {
    expect(parityVisible('all', 'odd')).toBe(true);
    expect(parityVisible('odd', 'odd')).toBe(true);
    expect(parityVisible('even', 'odd')).toBe(false);
    expect(parityVisible('odd', 'even')).toBe(false);
  });
});

describe('buildGridIndex', () => {
  it('places a one-slot lesson in exactly its own cell', () => {
    const index = buildGridIndex([lesson()]);
    expect(lessonsAt(index, '100', 3).map((l) => l.id)).toEqual(['l1']);
    expect(lessonsAt(index, '100', 4)).toEqual([]);
    expect(isCovered(index, '100', 4)).toBe(false);
    expect(cellSpan(index, '100', 3)).toBe(1);
  });

  it('covers the second row of a two-slot lesson so nothing else is drawn there', () => {
    // the Assembly Hall's HK1105 runs 10:00–11:50 — slots 3 and 4
    const index = buildGridIndex([lesson({ slotSpan: 2 })]);
    expect(lessonsAt(index, '100', 3)).toHaveLength(1);
    expect(isCovered(index, '100', 4)).toBe(true);
    expect(lessonsAt(index, '100', 4)).toEqual([]);
    expect(cellSpan(index, '100', 3)).toBe(2);
    expect(isCovered(index, '100', 5)).toBe(false);
  });

  it('lets an odd and an even lesson share one cell', () => {
    const index = buildGridIndex([
      lesson({ id: 'odd', parity: 'odd', courseCode: 'IP1302' }),
      lesson({ id: 'even', parity: 'even', courseCode: 'FC1301' }),
    ]);
    expect(lessonsAt(index, '100', 3).map((l) => l.id).sort()).toEqual(['even', 'odd']);
  });

  it('filters by weekday and by parity', () => {
    const all = [
      lesson({ id: 'tue' }),
      lesson({ id: 'wed', weekday: 3 }),
      lesson({ id: 'tue-even', parity: 'even', roomCode: '101' }),
    ];
    expect([...buildGridIndex(all, { weekday: 2 }).origins.keys()].sort()).toEqual([
      cellKey('100', 3),
      cellKey('101', 3),
    ]);
    expect([...buildGridIndex(all, { weekday: 2, parity: 'odd' }).origins.keys()]).toEqual([
      cellKey('100', 3),
    ]);
    expect([...buildGridIndex(all, { weekday: 3 }).origins.keys()]).toEqual([cellKey('100', 3)]);
  });

  it('keys cells by room and slot', () => {
    expect(cellKey('AI-LAB', 7)).toBe('AI-LAB:7');
  });
});

describe('schedulableRooms', () => {
  it('keeps only the schedulable spaces, floor first then code, counted naturally', () => {
    const rooms = [
      room({ code: '226A', floor: 2, type: 'lab' }),
      room({ code: 'CAFE', floor: 1, type: 'service', schedulable: false }),
      room({ code: '100', floor: 1 }),
      room({ code: '226', floor: 2, type: 'lab' }),
      room({ code: 'CR', floor: 1, type: 'seminar' }),
      room({ code: '204', floor: 2, type: 'lab' }),
    ];
    expect(schedulableRooms(rooms).map((r) => r.code)).toEqual([
      '100',
      'CR',
      '204',
      '226',
      '226A',
    ]);
  });
});

describe('naturalCompare', () => {
  it('counts the placeholder roster instead of sorting it as text', () => {
    const groups = ['Группа 10', 'Группа 2', 'Группа 1', 'Группа 24'];
    expect([...groups].sort(naturalCompare)).toEqual([
      'Группа 1',
      'Группа 2',
      'Группа 10',
      'Группа 24',
    ]);
  });
});

describe('isoWeekday', () => {
  it('reads the demo Tuesday as 2 and Sunday as 7', () => {
    expect(isoWeekday('2026-09-08')).toBe(2);
    expect(isoWeekday('2026-09-13')).toBe(7);
    expect(isoWeekday('2026-09-14')).toBe(1);
  });
});

describe('lessonErrorField', () => {
  const at = (status: number, message: string) => lessonErrorField({ status, message });

  it('points a room clash at the room field', () => {
    expect(
      at(409, 'room 100 is already taken on weekday 2, slot 1 by HK1105 (Преподаватель 8)'),
    ).toBe('roomCode');
  });

  it('points a teacher clash at the teacher field', () => {
    expect(at(409, 'Преподаватель 8 already teaches HK1105 in 100 on weekday 2, slot 1')).toBe(
      'teacherId',
    );
  });

  it('points a group clash and an empty attendance list at the groups field', () => {
    expect(at(409, 'Группа 1 already attends ICT1103 in 226 on weekday 2, slot 3')).toBe(
      'groupCodes',
    );
    expect(at(400, 'at least one group must attend the lesson')).toBe('groupCodes');
    expect(at(404, 'unknown student group in [Группа 99]')).toBe('groupCodes');
  });

  it('separates "not schedulable" from "wrong kind of room"', () => {
    expect(at(400, 'room 102 is not schedulable')).toBe('roomCode');
    expect(at(400, 'a lab lesson does not belong in 100 (a lecture room)')).toBe('type');
  });

  it('points slot problems at the span or the slot', () => {
    expect(at(400, 'a lesson of 2 slots cannot start at slot 10; the day ends at slot 10')).toBe(
      'slotSpan',
    );
    expect(at(400, 'slotSpan must be 1 or 2')).toBe('slotSpan');
    expect(at(404, 'no such slot 11 in building A')).toBe('slotIdx');
    expect(at(400, 'weekday must be 1 (Monday) … 7 (Sunday)')).toBe('weekday');
  });

  it('sends a rejected key to the key field and anything unknown to the form', () => {
    expect(at(401, 'missing or invalid X-Api-Key')).toBe('apiKey');
    expect(at(500, 'boom')).toBe('form');
  });
});
