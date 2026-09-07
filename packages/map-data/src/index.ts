/**
 * `@campuslive/map-data` — the typed loader for the one geometry artifact.
 *
 * `building-a.json` is generated from `svg/floor-{1..4}.svg` by `pnpm map:build`
 * and committed. It is typed as `MapSpec` from `@campuslive/contracts`, which is
 * the exact shape `GET /api/v1/buildings/{code}/map` returns, so the map renders
 * from the same bytes the API serves and `cmd/seed` writes into the database.
 *
 * Never hard-code room coordinates anywhere else.
 */

import type {
  MapCore,
  MapEntrance,
  MapFloor,
  MapLandmark,
  MapRoom,
  MapSpec,
} from '@campuslive/contracts';
import raw from '../building-a.json' with { type: 'json' };

/** The full geometry of building A. */
export const spec: MapSpec = raw as MapSpec;

export default spec;

export type {
  MapCore,
  MapEntrance,
  MapFloor,
  MapLandmark,
  MapRoom,
  MapSpec,
} from '@campuslive/contracts';

/** `[minX, minY, width, height]` shared by every floor. */
export const viewBox: number[] = spec.viewBox;

/** Floor numbers present in the spec, ascending. */
export const floorNumbers: number[] = spec.floors.map((f) => f.number).sort((a, b) => a - b);

/** One floor, or `undefined` when the building has no such floor. */
export function floorOf(floor: number): MapFloor | undefined {
  return spec.floors.find((f) => f.number === floor);
}

/**
 * Every room of a floor, in source order (cores and voids included).
 * Returns `[]` for an unknown floor rather than throwing — callers render nothing.
 */
export function roomsOf(floor: number): MapRoom[] {
  return floorOf(floor)?.rooms ?? [];
}

/** Codes of the rooms on a floor that may carry lessons. */
export function schedulableCodes(floor: number): string[] {
  return roomsOf(floor)
    .filter((r) => r.schedulable)
    .map((r) => r.code);
}

/** Every room of the building, across all floors. */
export function allRooms(): MapRoom[] {
  return spec.floors.flatMap((f) => f.rooms);
}

/** Look up a room by its code, e.g. `findRoom('213')`. Codes are unique building-wide. */
export function findRoom(code: string): MapRoom | undefined {
  for (const f of spec.floors) {
    const hit = f.rooms.find((r) => r.code === code);
    if (hit) return hit;
  }
  return undefined;
}

/** Look up a room by its deterministic id. */
export function findRoomById(id: string): MapRoom | undefined {
  for (const f of spec.floors) {
    const hit = f.rooms.find((r) => r.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** The floor a room code sits on, or `undefined` when the code is unknown. */
export function floorOfRoom(code: string): number | undefined {
  return spec.floors.find((f) => f.rooms.some((r) => r.code === code))?.number;
}
