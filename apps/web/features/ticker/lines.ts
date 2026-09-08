import type { Announcement, Snapshot } from '@campuslive/contracts';
import { formatHm, minutesUntil } from '@/features/time/derive';

export type TickerLine = { id: string; text: string; warn?: boolean };

export type TickerStrings = {
  startsIn: (v: { room: string; course: string; n: number; teacher: string }) => string;
  cancelled: (v: { room: string; course: string; time: string; teacher: string }) => string;
  moved: (v: { from: string; to: string; course: string; time: string }) => string;
  delayed: (v: { room: string; course: string; n: number; time: string }) => string;
  quiet: string;
};

/**
 * Auto-generated ticker copy, derived from the snapshot the server sent:
 * "213 · Databases starts in 4 min · Akhmetov D." and the day's exceptions.
 */
export function autoLines(
  snapshot: Snapshot,
  nowMs: number,
  tz: string,
  s: TickerStrings,
): TickerLine[] {
  const lines: TickerLine[] = [];

  for (const x of snapshot.next) {
    if (x.status === 'cancelled') {
      lines.push({
        id: `c:${x.sessionId}`,
        warn: true,
        text: s.cancelled({
          room: x.roomCode,
          course: `${x.courseCode} ${x.courseTitle}`,
          time: formatHm(x.startAt, tz),
          teacher: x.teacher.shortName,
        }),
      });
    } else if (x.status === 'moved' && x.movedFromRoomCode) {
      lines.push({
        id: `m:${x.sessionId}`,
        text: s.moved({
          from: x.movedFromRoomCode,
          to: x.roomCode,
          course: `${x.courseCode} ${x.courseTitle}`,
          time: formatHm(x.startAt, tz),
        }),
      });
    }
  }

  for (const x of [...snapshot.now, ...snapshot.next]) {
    if (x.status !== 'delayed') continue;
    lines.push({
      id: `d:${x.sessionId}`,
      text: s.delayed({
        room: x.roomCode,
        course: `${x.courseCode} ${x.courseTitle}`,
        n: x.delayMinutes ?? 0,
        time: formatHm(x.endAt, tz),
      }),
    });
  }

  for (const x of snapshot.next) {
    if (x.phase !== 'soon' || x.status === 'cancelled') continue;
    lines.push({
      id: `s:${x.sessionId}`,
      text: s.startsIn({
        room: x.roomCode,
        course: x.courseTitle,
        n: minutesUntil(x.startAt, nowMs),
        teacher: x.teacher.shortName,
      }),
    });
  }

  if (lines.length === 0) lines.push({ id: 'quiet', text: s.quiet });
  return lines;
}

/** Announcements first, then the derived lines; capped so the marquee stays legible. */
export function mergeLines(
  announcements: readonly Announcement[],
  auto: readonly TickerLine[],
  max = 8,
): TickerLine[] {
  const fromServer = announcements.map((a) => ({
    id: a.id,
    text: a.text,
    warn: a.severity !== 'info',
  }));
  return [...fromServer, ...auto].slice(0, max);
}
