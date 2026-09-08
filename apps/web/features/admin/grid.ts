import type { Lesson, LessonParity, RoomInfo } from '@campuslive/contracts';

/* ------------------------------------------------------------------ parity -- */

/** What the parity selector above the grid can be set to. */
export type ParityFilter = 'all' | 'odd' | 'even';

/**
 * Whether a lesson is taught in the weeks the filter selects. `all` shows
 * everything; an `odd`/`even` filter also shows the `all`-parity lessons,
 * because those run in that week too.
 */
export function parityVisible(parity: LessonParity, filter: ParityFilter): boolean {
  if (filter === 'all') return true;
  return parity === 'all' || parity === filter;
}

/* -------------------------------------------------------------- placement -- */

/** The grid is addressed by room code and 1-based slot index. */
export function cellKey(roomCode: string, slotIdx: number): string {
  return `${roomCode}:${slotIdx}`;
}

export type GridIndex = {
  /** Cells a lesson *starts* in — what the grid draws. */
  origins: Map<string, Lesson[]>;
  /** Cells the second half of a two-slot lesson covers — drawn by nothing. */
  covered: Map<string, Lesson[]>;
};

/**
 * Sorts the lessons of one weekday into the cells of the room × slot grid.
 * A lesson lands in `origins` at its own slot and in `covered` for every further
 * slot of its span, so the renderer knows which cells are still free. Two lessons
 * may share a cell when their parities alternate (odd + even), which is why both
 * maps hold lists.
 */
export function buildGridIndex(
  lessons: readonly Lesson[],
  filter: { weekday?: number; parity?: ParityFilter } = {},
): GridIndex {
  const origins = new Map<string, Lesson[]>();
  const covered = new Map<string, Lesson[]>();
  const push = (map: Map<string, Lesson[]>, key: string, lesson: Lesson) => {
    const list = map.get(key);
    if (list) list.push(lesson);
    else map.set(key, [lesson]);
  };

  for (const lesson of lessons) {
    if (filter.weekday !== undefined && lesson.weekday !== filter.weekday) continue;
    if (filter.parity && !parityVisible(lesson.parity, filter.parity)) continue;
    push(origins, cellKey(lesson.roomCode, lesson.slotIdx), lesson);
    const span = Math.max(1, lesson.slotSpan);
    for (let i = 1; i < span; i += 1) {
      push(covered, cellKey(lesson.roomCode, lesson.slotIdx + i), lesson);
    }
  }

  const bySlotThenCode = (a: Lesson, b: Lesson) =>
    a.slotIdx - b.slotIdx || a.parity.localeCompare(b.parity) || a.courseCode.localeCompare(b.courseCode);
  for (const list of origins.values()) list.sort(bySlotThenCode);

  return { origins, covered };
}

export function lessonsAt(index: GridIndex, roomCode: string, slotIdx: number): Lesson[] {
  return index.origins.get(cellKey(roomCode, slotIdx)) ?? [];
}

/** True when the cell is only the tail of a two-slot lesson that began above it. */
export function isCovered(index: GridIndex, roomCode: string, slotIdx: number): boolean {
  return (index.covered.get(cellKey(roomCode, slotIdx)) ?? []).length > 0;
}

/** How many grid rows a cell's block occupies — 2 when any lesson in it spans two slots. */
export function cellSpan(index: GridIndex, roomCode: string, slotIdx: number): number {
  let span = 1;
  for (const lesson of lessonsAt(index, roomCode, slotIdx)) {
    span = Math.max(span, Math.min(2, lesson.slotSpan));
  }
  return span;
}

/**
 * ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD` local building date —
 * the weekday the grid opens on. Read at noon UTC so no zone shifts the day.
 */
export function isoWeekday(date: string): number {
  const js = new Date(`${date}T12:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

/**
 * `Группа 2` before `Группа 10`. The API orders by code, which is lexicographic;
 * a person reading a list of 24 placeholders wants them counted, not sorted.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

/** The 13 schedulable rooms in the order the grid draws them: floor, then code. */
export function schedulableRooms(rooms: readonly RoomInfo[]): RoomInfo[] {
  return rooms
    .filter((r) => r.schedulable)
    .slice()
    .sort((a, b) => a.floor - b.floor || naturalCompare(a.code, b.code));
}

/* ---------------------------------------------------------------- errors -- */

/** The fields of the lesson form an API error can be attributed to. */
export type LessonField =
  | 'apiKey'
  | 'courseId'
  | 'teacherId'
  | 'roomCode'
  | 'weekday'
  | 'slotIdx'
  | 'slotSpan'
  | 'parity'
  | 'type'
  | 'groupCodes'
  | 'form';

/**
 * Which field the server's `400` / `404` / `409` message is about, so the panel
 * can print it next to the input that caused it rather than in a toast.
 *
 * The messages are the ones `services/api/internal/httpapi/admin.go` produces:
 * `room X is already taken …`, `Преподаватель N already teaches …`,
 * `Группа N already attends …`, `room X is not schedulable`,
 * `a lab lesson does not belong in X (a lecture room)`,
 * `a lesson of 2 slots cannot start at slot 10; …`, `at least one group must attend …`.
 */
export function lessonErrorField(err: { status: number; message: string }): LessonField {
  if (err.status === 401) return 'apiKey';
  const m = err.message.toLowerCase();

  if (m.includes('already attends') || m.includes('student group') || m.includes('group must attend')) {
    return 'groupCodes';
  }
  if (m.includes('already teaches') || m.includes('teacher')) return 'teacherId';
  if (m.includes('does not belong')) return 'type';
  if (m.includes('room')) return 'roomCode';
  if (m.includes('slotspan') || m.includes('slots cannot start')) return 'slotSpan';
  if (m.includes('slot')) return 'slotIdx';
  if (m.includes('weekday')) return 'weekday';
  if (m.includes('course')) return 'courseId';
  if (m.includes('semester')) return 'form';
  return 'form';
}
