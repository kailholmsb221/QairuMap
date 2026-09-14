import data from '@campuslive/map-data/vector-map.json';
import type { MapSpec } from '@campuslive/contracts';

/**
 * The vector plans (`packages/map-data/vector-map.json`, built by
 * `vector2map.ts` from the hand-digitised `vector/floor-{1,2}.json`).
 *
 * Two kinds of thing are on them. A **room** is a space the API knows — one of
 * the 54 codes of `docs/BUILDING.md`; the plan only lends it a contour. A
 * **space** is everything else the plan draws — corridors, lift halls, the
 * coworking, the pavilion — drawn and labelled, searchable by name, but never
 * a room: it has no status, no detail panel, and nothing in the database.
 */

export type BBox = { x: number; y: number; w: number; h: number };
export type PlanPoint = { x: number; y: number };

export type VectorRoom = {
  path: string;
  bbox: BBox;
  label: PlanPoint;
  /** Label rotation on screen, degrees, when the plan turns it. */
  angle?: number;
  source: string;
};

export type SpaceType =
  | 'office' | 'class' | 'hall' | 'corridor' | 'wc' | 'stairs' | 'lift'
  | 'service' | 'tech' | 'lobby' | 'cafe' | 'storage';

export type VectorSpace = {
  id: string;
  name: string;
  type: SpaceType;
  path: string;
  bbox: BBox;
  label: PlanPoint;
  angle?: number;
  hideLabel?: boolean;
};

export type VectorWall = { d: string; exterior?: boolean; virtual?: boolean };
export type VectorDoor = { opening: string; leaves: string[] };
export type VectorGlyph =
  | { kind: 'stairs'; steps: string; arrow: string }
  | { kind: 'lift'; d: string }
  | { kind: 'wc'; x: number; y: number; size: number }
  | { kind: 'tech' | 'shaft'; x: number; y: number; w: number; h: number };

export type VectorFloor = {
  number: number;
  outline: string;
  rooms: Record<string, VectorRoom>;
  unmapped: string[];
  spaces: VectorSpace[];
  walls: VectorWall[];
  doors: VectorDoor[];
  glyphs: VectorGlyph[];
};

export const vectorFloors: Readonly<Record<number, VectorFloor>> = data.floors as Record<number, VectorFloor>;

/**
 * Keep API identity and schedule metadata; adapt only the presentation
 * geometry. A code the plan has no space for is left off the plate — it still
 * exists for the API and the board, it just cannot be pointed at.
 */
export function withVectorGeometry(spec: MapSpec): MapSpec {
  return {
    ...spec,
    floors: spec.floors.map((floor) => {
      const vec = vectorFloors[floor.number];
      if (!vec) return floor;
      return {
        ...floor,
        outline: vec.outline,
        rooms: floor.rooms.flatMap((room) => {
          const shape = vec.rooms[room.code];
          return shape ? [{ ...room, path: shape.path, bbox: shape.bbox, label: shape.label }] : [];
        }),
      };
    }),
  };
}

/** `code → label rotation` for the rooms the plan turns (only a few, along narrow bays). */
export function roomLabelAngles(floor: number): Record<string, number> {
  const out: Record<string, number> = {};
  const vec = vectorFloors[floor];
  if (!vec) return out;
  for (const [code, room] of Object.entries(vec.rooms)) if (room.angle) out[code] = room.angle;
  return out;
}

/* ------------------------------------------------------------------ spaces */

/** Circulation and plant: drawn, never a destination. */
const THROUGH_TYPES: ReadonlySet<SpaceType> = new Set(['corridor', 'wc', 'stairs', 'lift', 'tech']);
/** The plan's placeholder captions — nothing a visitor would search for. */
const GENERIC_NAMES = /^(помещение|кабинет|тамбур|коридор|лифт|лестничная клетка|лифтовой холл)(\s|$)/i;

export type Place = {
  /** The space id, used as the highlight id; never collides with a room code (those are upper-case). */
  id: string;
  name: string;
  type: SpaceType;
  floor: number;
  label: PlanPoint;
};

/** Every named space on the plans a visitor might look for, in plan order. */
export function listPlaces(): Place[] {
  const out: Place[] = [];
  for (const vec of Object.values(vectorFloors)) {
    for (const s of vec.spaces) {
      if (s.hideLabel || THROUGH_TYPES.has(s.type) || GENERIC_NAMES.test(s.name)) continue;
      out.push({ id: s.id, name: s.name, type: s.type, floor: vec.number, label: s.label });
    }
  }
  return out;
}

const PLACES = listPlaces();
const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p] as const));

export function placeById(id: string): Place | undefined {
  return PLACE_BY_ID.get(id);
}

/** Substring match on the space name, in plan order. */
export function searchPlaces(query: string, limit = 6): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter((p) => p.name.toLowerCase().includes(q)).slice(0, limit);
}
