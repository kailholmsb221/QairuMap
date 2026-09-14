import kk from '@/messages/kk.json';
import en from '@/messages/en.json';

/**
 * The building's own room list is bilingual — «Мәжіліс залы / Assembly Hall» —
 * and the screen has no language switch, so a room is named the way the list
 * names it, in both at once. The tables are the same `rooms.<CODE>` entries
 * `useRoomName` reads for the current locale.
 */
const KK = (kk as { rooms: Record<string, string> }).rooms;
const EN = (en as { rooms: Record<string, string> }).rooms;

export type RoomNames = { kk: string; en: string };

export function roomNames(code: string, fallback = ''): RoomNames {
  return { kk: KK[code] ?? fallback, en: EN[code] ?? fallback };
}

/** «Мәжіліс залы / Assembly Hall», or whichever half exists. */
export function bilingualRoomName(code: string, fallback = ''): string {
  const { kk: a, en: b } = roomNames(code, fallback);
  if (a && b && a !== b) return `${a} / ${b}`;
  return a || b;
}
