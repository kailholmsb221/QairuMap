/**
 * vector2map — turns the hand-digitised vector plans into the presentation
 * geometry the web app draws.
 *
 *   packages/map-data/vector/floor-{1,2}.json  →  packages/map-data/vector-map.json
 *
 * The plans are a topological model (`points → walls → rooms.boundary`) in their
 * own 1600×1000 landscape frame with the curved façade at the bottom. The scene
 * in `apps/web` projects a portrait 600×1000 plate and turns it −90° for the
 * focused view (north to the left, the curved west façade at the bottom), so
 * the two frames differ by exactly a quarter turn: this script rotates the plan
 * by +90°, scales it uniformly and centres it on the plate, then builds every
 * path in plate coordinates. Nothing downstream needs to know about the source
 * frame.
 *
 * Only presentation geometry comes out of here. Room identity — codes, names,
 * types, schedulability — stays the contract in `docs/BUILDING.md` /
 * `building-a.json`; the table below says which drawn space carries which code.
 * Every other space on the plan (corridors, lift halls, the coworking, …) is
 * emitted as a `space`: drawn and labelled, but not a room the API knows.
 *
 * Run with `pnpm --filter @campuslive/map-data run vector:build`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapSpec } from '@campuslive/contracts';
import {
  bbox,
  boundaryPolyline,
  buildRoomPath,
  centroid,
  doorPaths,
  liftPath,
  stairsPaths,
  wallPath,
} from './vector/geometry';
import type { FloorPlan, PlanRoom, Point, SpaceType } from './vector/plan';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const VECTOR_DIR = resolve(PKG_ROOT, 'vector');
const SPEC_FILE = resolve(PKG_ROOT, 'building-a.json');
const OUT_FILE = resolve(PKG_ROOT, 'vector-map.json');

const PLATE_W = 600;
const PLATE_H = 1000;
/** Clear plate kept around the plan, in plate units. */
const MARGIN = { x: 18, y: 30 };
const FLOORS = [1, 2] as const;

/* -------------------------------------------------------------------------- */
/* Which drawn space carries which contract code                              */
/* -------------------------------------------------------------------------- */

/**
 * Contract code → room id in `vector/floor-{n}.json`. Numbered spaces map by
 * their printed number; the plan prints `102` and `226` twice, and the larger
 * of each pair is the plain code as `docs/BUILDING.md` decides. The unnumbered
 * service codes (cores, technical rooms, the atrium) go to the space that stands
 * where the traced plate had them.
 *
 * A code with no entry has no space on the new plan; the web adapter leaves it
 * off the plate (it still exists for the API) and the test pins the list.
 */
const ROOM_SOURCES: Record<number, Record<string, string>> = {
  1: {
    '100': 'f1-class25',
    '101': 'f1-class20a',
    '102': 'f1-class20b',
    '102A': 'f1-labassist',
    '103': 'f1-informatics',
    CR: 'f1-wardrobe-r',
    CINEMA: 'f1-lockers',
    'WC-1': 'f1-wc-w-r',
    'WC-2': 'f1-wc-m-r',
    CAFE: 'f1-cafe',
    'ATRIUM-N': 'f1-hall-n',
    'TECH-N2': 'f1-sf1',
    'TECH-N3': 'f1-elec-l',
    'TECH-S1': 'f1-sf2',
    'CORE-N1': 'f1-stairs-1',
    'CORE-S1': 'f1-stairs-2',
  },
  2: {
    '200': 'f2-200',
    '201': 'f2-201',
    '202': 'f2-202',
    '203': 'f2-203',
    '204': 'f2-204',
    '205': 'f2-205',
    '206': 'f2-206',
    '207': 'f2-207',
    '208': 'f2-208',
    '209': 'f2-209',
    '210': 'f2-210',
    '211': 'f2-211',
    '212': 'f2-212',
    '213': 'f2-213',
    '214': 'f2-214',
    '215': 'f2-215',
    'AI-LAB': 'f2-ailab',
    '217': 'f2-217',
    '218': 'f2-218',
    '219': 'f2-219',
    '220': 'f2-220',
    '221': 'f2-221',
    '222': 'f2-222',
    '223': 'f2-223',
    '224': 'f2-224',
    '225': 'f2-225',
    '226': 'f2-226',
    '226A': 'f2-226u',
    '227': 'f2-hr',
    '228': 'room-unknown-f2-01',
    '231': 'f2-archive',
    'WC-N2': 'f2-wc-w-r',
    'WC-S2': 'f2-wc-m-r',
    'VOID-2': 'f2-void',
    'CORE-N2': 'f2-stairs-1',
    'CORE-S2': 'f2-stairs-2',
  },
};

/* -------------------------------------------------------------------------- */
/* Output shape                                                               */
/* -------------------------------------------------------------------------- */

export type BBox = { x: number; y: number; w: number; h: number };

/** What the plan says about a space's look: its kind, and whether it is plant rather than a place. */
export type VectorLook = {
  /** The plan's own kind — circulation and plant are coloured by kind, everything else by status. */
  type: SpaceType;
  /** The plan marks it as a service area (grey), not a place a visitor goes to (blue). */
  quiet?: true;
  /** Label rotation on screen, degrees, when the plan turns it. */
  angle?: number;
  /** A caption size the plan forces, in plate units. */
  fontSize?: number;
  hideLabel?: true;
};

export type VectorRoom = VectorLook & {
  path: string;
  bbox: BBox;
  label: Point;
  /** Room id in `vector/floor-{n}.json`. */
  source: string;
};

export type VectorSpace = VectorLook & {
  id: string;
  name: string;
  path: string;
  bbox: BBox;
  label: Point;
};

export type VectorWall = { d: string; exterior?: true; virtual?: true };
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
  /** Contract codes the plan has no space for. */
  unmapped: string[];
  spaces: VectorSpace[];
  walls: VectorWall[];
  doors: VectorDoor[];
  glyphs: VectorGlyph[];
};

export type VectorMap = {
  source: { viewBox: [number, number, number, number]; scale: number };
  viewBox: [number, number, number, number];
  floors: Record<string, VectorFloor>;
};

/* -------------------------------------------------------------------------- */
/* Transform                                                                  */
/* -------------------------------------------------------------------------- */

type Frame = { s: number; ox: number; oy: number };

/** Plan (u, v) → plate (x, y): a quarter turn, uniform scale, centred. */
const toPlate = (f: Frame, p: Point): Point => ({
  x: round(PLATE_W - f.ox - f.s * p.y),
  y: round(f.oy + f.s * p.x),
});

const round = (n: number) => Math.round(n * 100) / 100;

/** One frame for both floors, so the plates stack exactly. */
function fitFrame(plans: FloorPlan[]): Frame {
  const pts = plans.flatMap((plan) => boundaryPolyline(plan, plan.exterior));
  const b = bbox(pts);
  const spanU = b.maxX - b.minX;
  const spanV = b.maxY - b.minY;
  const s = Math.min((PLATE_H - 2 * MARGIN.y) / spanU, (PLATE_W - 2 * MARGIN.x) / spanV);
  return {
    s,
    ox: (PLATE_W - s * spanV) / 2 - s * b.minY,
    oy: (PLATE_H - s * spanU) / 2 - s * b.minX,
  };
}

/** The same plan with every coordinate already on the plate. */
function transformPlan(plan: FloorPlan, f: Frame): FloorPlan {
  const points: FloorPlan['points'] = {};
  for (const [id, p] of Object.entries(plan.points)) points[id] = toPlate(f, p);
  return {
    ...plan,
    points,
    rooms: plan.rooms.map((r) => ({
      ...r,
      label: {
        ...r.label,
        ...toPlate(f, r.label),
        ...(r.label.fontSize ? { fontSize: round(r.label.fontSize * f.s) } : {}),
      },
    })),
    doors: plan.doors.map((d) => ({ ...d, width: d.width * f.s })),
    specialZones: plan.specialZones.map((z) =>
      z.angle == null ? z : { ...z, angle: z.angle + 90 },
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

const look = (r: PlanRoom): VectorLook => ({
  type: r.type,
  ...(r.status === 'service' ? { quiet: true as const } : {}),
  ...(r.label.angle ? { angle: r.label.angle } : {}),
  ...(r.label.fontSize ? { fontSize: r.label.fontSize } : {}),
  ...(r.hideLabel ? { hideLabel: true as const } : {}),
});

const toBBox = (pts: Point[]): BBox => {
  const b = bbox(pts);
  return { x: round(b.minX), y: round(b.minY), w: round(b.maxX - b.minX), h: round(b.maxY - b.minY) };
};

function buildFloor(number: number, source: FloorPlan, f: Frame, codes: string[]): VectorFloor {
  const plan = transformPlan(source, f);
  const byId = new Map(plan.rooms.map((r) => [r.id, r] as const));
  const sources = ROOM_SOURCES[number] ?? {};

  const rooms: Record<string, VectorRoom> = {};
  const taken = new Map<string, string>();
  const unmapped: string[] = [];
  for (const code of codes) {
    const id = sources[code];
    if (!id) {
      unmapped.push(code);
      continue;
    }
    const room = byId.get(id);
    if (!room) throw new Error(`floor ${number}: ${code} → ${id}, but the plan has no such space`);
    const prev = taken.get(id);
    if (prev) throw new Error(`floor ${number}: ${id} is claimed by both ${prev} and ${code}`);
    taken.set(id, code);
    const poly = boundaryPolyline(plan, room.boundary);
    rooms[code] = {
      ...look(room),
      path: buildRoomPath(plan, room.boundary),
      bbox: toBBox(poly),
      label: { x: room.label.x, y: room.label.y },
      source: id,
    };
  }
  for (const code of Object.keys(sources)) {
    if (!codes.includes(code)) throw new Error(`floor ${number}: ${code} is mapped but not in building-a.json`);
  }

  const spaces: VectorSpace[] = plan.rooms
    .filter((r) => !taken.has(r.id))
    .map((r) => ({
      ...look(r),
      id: r.id,
      name: r.name,
      path: buildRoomPath(plan, r.boundary),
      bbox: toBBox(boundaryPolyline(plan, r.boundary)),
      label: { x: r.label.x, y: r.label.y },
    }));

  const walls: VectorWall[] = Object.values(plan.walls).map((w) => ({
    d: wallPath(plan, w),
    ...(w.exterior ? { exterior: true as const } : {}),
    ...(w.virtual ? { virtual: true as const } : {}),
  }));

  const doors: VectorDoor[] = [];
  for (const d of plan.doors) {
    const paths = doorPaths(plan, d);
    if (paths) doors.push(paths);
  }

  const glyphs: VectorGlyph[] = [];
  for (const z of plan.specialZones) {
    const room = byId.get(z.roomId);
    if (!room) continue;
    const poly = boundaryPolyline(plan, room.boundary);
    if (poly.length < 3) continue;
    switch (z.kind) {
      case 'stairs':
        glyphs.push({ kind: 'stairs', ...stairsPaths(poly, z.angle ?? 90) });
        break;
      case 'lift':
        glyphs.push({ kind: 'lift', d: liftPath(poly) });
        break;
      case 'wc': {
        const b = toBBox(poly);
        const size = Math.min(b.w, b.h);
        // the authoring tool signs only the unlabelled cubicles that are big enough
        if (room.hideLabel && size >= 30 * f.s) {
          const c = centroid(poly);
          glyphs.push({ kind: 'wc', x: round(c.x), y: round(c.y), size: round(size) });
        }
        break;
      }
      case 'tech':
      case 'shaft': {
        const b = toBBox(poly);
        const inset = Math.min(b.w, b.h) * 0.15;
        glyphs.push({
          kind: z.kind,
          x: round(b.x + inset),
          y: round(b.y + inset),
          w: round(b.w - inset * 2),
          h: round(b.h - inset * 2),
        });
        break;
      }
    }
  }

  return {
    number,
    outline: buildRoomPath(plan, plan.exterior),
    rooms,
    unmapped,
    spaces,
    walls,
    doors,
    glyphs,
  };
}

export async function buildVectorMap(): Promise<VectorMap> {
  const spec = JSON.parse(await readFile(SPEC_FILE, 'utf8')) as MapSpec;
  const plans = await Promise.all(
    FLOORS.map(async (n) => JSON.parse(await readFile(resolve(VECTOR_DIR, `floor-${n}.json`), 'utf8')) as FloorPlan),
  );
  const first = plans[0];
  if (!first) throw new Error('no plans');
  for (const plan of plans) {
    const vb = plan.viewBox;
    if (vb.x !== first.viewBox.x || vb.y !== first.viewBox.y || vb.width !== first.viewBox.width || vb.height !== first.viewBox.height) {
      throw new Error(`${plan.id}: every plan must share one viewBox`);
    }
  }
  const frame = fitFrame(plans);

  const floors: Record<string, VectorFloor> = {};
  FLOORS.forEach((n, i) => {
    const specFloor = spec.floors.find((fl) => fl.number === n);
    if (!specFloor) throw new Error(`building-a.json has no floor ${n}`);
    floors[String(n)] = buildFloor(n, plans[i]!, frame, specFloor.rooms.map((r) => r.code));
  });

  return {
    source: {
      viewBox: [first.viewBox.x, first.viewBox.y, first.viewBox.width, first.viewBox.height],
      scale: round(frame.s),
    },
    viewBox: [0, 0, PLATE_W, PLATE_H],
    floors,
  };
}

async function main() {
  const map = await buildVectorMap();
  await writeFile(OUT_FILE, `${JSON.stringify(map, null, 2)}\n`);
  for (const fl of Object.values(map.floors)) {
    const missing = fl.unmapped.length ? ` · not on the plan: ${fl.unmapped.join(', ')}` : '';
    console.log(
      `floor ${fl.number}: ${Object.keys(fl.rooms).length} rooms, ${fl.spaces.length} spaces, ` +
        `${fl.walls.length} walls, ${fl.doors.length} doors, ${fl.glyphs.length} glyphs${missing}`,
    );
  }
  console.log(`wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
