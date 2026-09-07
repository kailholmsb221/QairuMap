/**
 * svg2map — turns the hand-authored floor plans into the one geometry artifact
 * that both the web app and the Go seed read.
 *
 *   packages/map-data/svg/floor-{1..4}.svg  →  packages/map-data/building-a.json
 *
 * The output matches the `MapSpec` schema in `packages/contracts/openapi.yaml`
 * exactly, so `apps/web` can type it as `MapSpec` and `cmd/seed` can unmarshal it
 * into the same shape that `GET /api/v1/buildings/{code}/map` returns.
 *
 * Run with `pnpm map:build`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type INode } from 'svgson';
import { v5 as uuidv5 } from 'uuid';
import type {
  MapCore,
  MapEntrance,
  MapFloor,
  MapLandmark,
  MapRoom,
  MapSpec,
  MapZone,
  RoomType,
  Wing,
} from '@campuslive/contracts';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const SVG_DIR = resolve(PKG_ROOT, 'svg');
const OUT_FILE = resolve(PKG_ROOT, 'building-a.json');

const BUILDING_CODE = 'A';
const BUILDING_NAME = 'Main Academic Building';
const BUILDING_TIMEZONE = 'Asia/Almaty';
const FLOOR_NUMBERS = [1, 2, 3, 4] as const;
const VIEW_BOX = [0, 0, 600, 1000] as const;

/**
 * Fixed namespace for deterministic room ids. Room id = uuidv5("campuslive:room:{code}").
 * Web and database therefore agree on room identity before the database exists.
 * (This is the standard RFC 4122 DNS namespace, used here purely as a constant.)
 */
const ROOM_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const roomId = (code: string): string => uuidv5(`campuslive:room:${code}`, ROOM_UUID_NAMESPACE);

const ROOM_TYPES: readonly RoomType[] = [
  'lecture',
  'seminar',
  'lab',
  'coworking',
  'admin',
  'service',
  'void',
];
const WINGS: readonly Wing[] = ['north', 'south', 'core'];

/** Corridor bands, mirroring `docs/design/src/geometry.mjs` BANDS. */
const CORRIDOR_BANDS = [
  { id: 'corridor-north', rect: [0, 300, 470, 30] as const },
  { id: 'corridor-south', rect: [0, 670, 470, 30] as const },
];

/**
 * Appendix A of docs/ARCHITECTURE.md: rooms that may carry lessons. The build
 * fails if a floor's schedulable set differs from this by a single code — that is
 * the guard that keeps the map, the seed and the board in step.
 */
const EXPECTED_SCHEDULABLE: Record<number, readonly string[]> = {
  1: ['101', '107', '110', '111', '112'],
  2: ['205', '207', '208', '210', '211', '213', '214', '215', '216', '217', '218', '219'],
  3: ['301', '302', '303', '304', '305', '308', '309', '310', '311', '312', '313', '314'],
  4: ['401', '402', '403', '404', '405', '408', '409', '410', '411', '412', '413', '414'],
};

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

type Pt = [number, number];

/** Round to one decimal — keeps the committed JSON byte-stable across machines. */
const r1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Flatten an absolute SVG path into a polygon. The floor plans only use
 * `M`, `L`, `Q`, `C` and `Z` (rooms are polygons; only the outline curves).
 */
function samplePath(d: string, seg = 28): Pt[] {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+/g);
  if (!tok) throw new Error(`unparseable path: ${d.slice(0, 60)}…`);
  const pts: Pt[] = [];
  let i = 0;
  let cur: Pt = [0, 0];
  const num = (): number => Number.parseFloat(tok[i++] as string);

  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') {
      cur = [num(), num()];
      pts.push(cur);
    } else if (c === 'Q') {
      const p0 = cur;
      const c1: Pt = [num(), num()];
      const p1: Pt = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const u = 1 - t;
        pts.push([
          u * u * p0[0] + 2 * u * t * c1[0] + t * t * p1[0],
          u * u * p0[1] + 2 * u * t * c1[1] + t * t * p1[1],
        ]);
      }
      cur = p1;
    } else if (c === 'C') {
      const p0 = cur;
      const c1: Pt = [num(), num()];
      const c2: Pt = [num(), num()];
      const p1: Pt = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
        ]);
      }
      cur = p1;
    } else if (c === 'Z') {
      // closed — nothing to add
    } else {
      throw new Error(`unsupported path command "${c}" in: ${d.slice(0, 60)}…`);
    }
  }

  // Drop a duplicated closing point.
  if (pts.length > 1) {
    const a = pts[0] as Pt;
    const b = pts[pts.length - 1] as Pt;
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
  }
  return pts;
}

function bboxOf(poly: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: r1(x0), y: r1(y0), w: r1(x1 - x0), h: r1(y1 - y0) };
}

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function centroidOf(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    const f = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * f;
    y += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bboxOf(poly);
    return [b.x + b.w / 2, b.y + b.h / 2];
  }
  return [x / (3 * a), y / (3 * a)];
}

/** Ray casting. Used to reject centroids that fall outside a concave polygon. */
function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    const intersects =
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] || 1e-12) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Label anchor: the polygon centroid, falling back to the bbox centre when the
 * centroid lands outside the shape or the room is narrower than 40 units (where a
 * centroid drifts far enough to look misplaced).
 */
function labelAnchor(poly: Pt[]): { x: number; y: number } {
  const b = bboxOf(poly);
  const c = centroidOf(poly);
  if (b.w < 40 || !pointInPolygon(c, poly)) {
    return { x: r1(b.x + b.w / 2), y: r1(b.y + b.h / 2) };
  }
  return { x: r1(c[0]), y: r1(c[1]) };
}

function intersect(p: Pt, q: Pt, a: Pt, b: Pt): Pt {
  const A1 = q[1] - p[1];
  const B1 = p[0] - q[0];
  const C1 = A1 * p[0] + B1 * p[1];
  const A2 = b[1] - a[1];
  const B2 = a[0] - b[0];
  const C2 = A2 * a[0] + B2 * a[1];
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return q;
  return [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
}

/** Sutherland–Hodgman clip of a subject polygon by a (near-)convex clip polygon. */
function clipPolygon(subject: Pt[], clip: Pt[]): Pt[] {
  const sign = signedArea(clip) > 0 ? 1 : -1;
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i] as Pt;
    const b = clip[(i + 1) % clip.length] as Pt;
    const input = output;
    output = [];
    if (!input.length) break;
    const inside = (p: Pt): boolean =>
      sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9;
    for (let j = 0; j < input.length; j++) {
      const cur = input[j] as Pt;
      const prev = input[(j + input.length - 1) % input.length] as Pt;
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) output.push(intersect(prev, cur, a, b));
        output.push(cur);
      } else if (pi) {
        output.push(intersect(prev, cur, a, b));
      }
    }
  }
  return output;
}

const rectPoly = ([x, y, w, h]: readonly [number, number, number, number]): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const polyToPath = (poly: Pt[]): string =>
  poly.length ? `M ${poly.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L ')} Z` : '';

/* -------------------------------------------------------------------------- */
/* SVG traversal                                                              */
/* -------------------------------------------------------------------------- */

class BuildError extends Error {}

function fail(msg: string): never {
  throw new BuildError(msg);
}

function findById(node: INode, id: string): INode | undefined {
  if (node.attributes?.['id'] === id) return node;
  for (const child of node.children ?? []) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return undefined;
}

const childrenOf = (node: INode | undefined, name: string): INode[] =>
  (node?.children ?? []).filter((c) => c.type === 'element' && c.name === name);

/** svgson leaves XML entities encoded in attribute values; room names need them back. */
const decodeEntities = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

const attr = (node: INode, key: string): string | undefined => {
  const v = node.attributes?.[key];
  return v === undefined ? undefined : decodeEntities(v);
};

const requireAttr = (node: INode, key: string, where: string): string =>
  attr(node, key) ?? fail(`${where}: missing required attribute "${key}"`);

/** The floor SVGs carry a C2PA `<metadata>` block; it is not geometry. */
const stripMetadata = (svg: string): string => svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, '');

function assertClosedPath(d: string, where: string): string {
  const t = d.trim();
  if (!t.startsWith('M')) fail(`${where}: path must start with "M", got "${t.slice(0, 12)}…"`);
  if (!t.endsWith('Z')) fail(`${where}: path must be closed with "Z", got "…${t.slice(-12)}"`);
  return t;
}

/* -------------------------------------------------------------------------- */
/* Per-floor conversion                                                       */
/* -------------------------------------------------------------------------- */

interface FloorResult {
  floor: MapFloor;
  schedulable: string[];
}

async function convertFloor(n: number): Promise<FloorResult> {
  const file = resolve(SVG_DIR, `floor-${n}.svg`);
  const raw = await readFile(file, 'utf8');
  const svg = await parse(stripMetadata(raw));
  const where = `floor-${n}.svg`;

  const viewBox = attr(svg, 'viewBox');
  if (viewBox !== VIEW_BOX.join(' ')) {
    fail(`${where}: viewBox must be "${VIEW_BOX.join(' ')}", got "${viewBox ?? '(none)'}"`);
  }
  const dataFloor = Number(attr(svg, 'data-floor'));
  if (dataFloor !== n) fail(`${where}: data-floor is "${attr(svg, 'data-floor')}", expected ${n}`);
  if (attr(svg, 'data-building') !== BUILDING_CODE) {
    fail(`${where}: data-building must be "${BUILDING_CODE}"`);
  }

  // ---- outline ------------------------------------------------------------
  const outlineNode = findById(svg, 'outline') ?? fail(`${where}: no <path id="outline">`);
  const outline = assertClosedPath(
    requireAttr(outlineNode, 'd', `${where} #outline`),
    `${where} #outline`,
  );
  const outlinePoly = samplePath(outline);

  // ---- zones --------------------------------------------------------------
  const zones: MapZone[] = childrenOf(findById(svg, 'zones'), 'path').map((node) => {
    const id = requireAttr(node, 'id', `${where} zones/path`);
    return { id, path: assertClosedPath(requireAttr(node, 'd', `${where} #${id}`), `${where} #${id}`) };
  });
  if (zones.length === 0) fail(`${where}: <g id="zones"> is empty`);

  // ---- corridors (derived from the shared bands, clipped to the outline) ---
  const corridors: MapZone[] = CORRIDOR_BANDS.map(({ id, rect }) => {
    const poly = clipPolygon(rectPoly(rect), outlinePoly);
    if (poly.length < 3) fail(`${where}: corridor "${id}" is empty after clipping to the outline`);
    return { id, path: polyToPath(poly) };
  });

  // ---- rooms --------------------------------------------------------------
  const rooms: MapRoom[] = [];
  const addRoom = (
    code: string,
    name: string,
    type: RoomType,
    wing: Wing,
    schedulable: boolean,
    d: string,
    capacity?: number,
  ): void => {
    const poly = samplePath(d);
    if (poly.length < 3) fail(`${where} room ${code}: path resolves to fewer than 3 points`);
    const room: MapRoom = {
      id: roomId(code),
      code,
      name,
      type,
      wing,
      schedulable,
      path: d,
      bbox: bboxOf(poly),
      label: labelAnchor(poly),
    };
    if (capacity !== undefined) room.capacity = capacity;
    rooms.push(room);
  };

  for (const node of childrenOf(findById(svg, 'rooms'), 'path')) {
    const id = requireAttr(node, 'id', `${where} rooms/path`);
    if (!id.startsWith('room-')) fail(`${where}: room path id "${id}" must start with "room-"`);
    const code = id.slice('room-'.length);
    const w = `${where} #${id}`;
    const type = requireAttr(node, 'data-type', w) as RoomType;
    if (!ROOM_TYPES.includes(type)) fail(`${w}: data-type "${type}" is not a RoomType`);
    const wing = requireAttr(node, 'data-wing', w) as Wing;
    if (!WINGS.includes(wing)) fail(`${w}: data-wing "${wing}" is not a Wing`);

    const capRaw = attr(node, 'data-capacity');
    const capacity = capRaw === undefined ? undefined : Number(capRaw);
    if (capacity !== undefined && !Number.isFinite(capacity)) {
      fail(`${w}: data-capacity "${capRaw}" is not a number`);
    }

    addRoom(
      code,
      requireAttr(node, 'data-name', w),
      type,
      wing,
      attr(node, 'data-schedulable') === 'true',
      assertClosedPath(requireAttr(node, 'd', w), w),
      capacity,
    );
  }

  // ---- cores (also emitted as rooms — Appendix A lists them, the seed inserts
  //      every one, and the map needs them as clickable shapes) --------------
  const cores: MapCore[] = [];
  for (const node of childrenOf(findById(svg, 'cores'), 'path')) {
    const id = requireAttr(node, 'id', `${where} cores/path`);
    if (id !== 'core-n' && id !== 'core-s') {
      fail(`${where}: core id must be "core-n" or "core-s", got "${id}"`);
    }
    const w = `${where} #${id}`;
    const d = assertClosedPath(requireAttr(node, 'd', w), w);
    const name = requireAttr(node, 'data-name', w);
    const code = `${id === 'core-n' ? 'CORE-N' : 'CORE-S'}${n}`;
    const poly = samplePath(d);
    cores.push({
      id,
      code,
      name,
      path: d,
      bbox: bboxOf(poly),
      label: labelAnchor(poly),
    });
    addRoom(code, name, 'service', 'core', false, d);
  }
  if (cores.length !== 2) fail(`${where}: expected exactly 2 cores, got ${cores.length}`);

  // ---- landmarks ----------------------------------------------------------
  const landmarks: MapLandmark[] = childrenOf(findById(svg, 'landmarks'), 'use').map((node) => {
    const id = requireAttr(node, 'id', `${where} landmarks/use`);
    const w = `${where} #${id}`;
    return {
      kind: (id.split('-')[0] as string) || 'stairs',
      id,
      x: r1(Number(requireAttr(node, 'x', w))),
      y: r1(Number(requireAttr(node, 'y', w))),
    };
  });

  // ---- entrances ----------------------------------------------------------
  const entrances: MapEntrance[] = childrenOf(findById(svg, 'entrances'), 'path').map((node) => {
    const id = requireAttr(node, 'id', `${where} entrances/path`);
    const w = `${where} #${id}`;
    const d = assertClosedPath(requireAttr(node, 'd', w), w);
    const c = centroidOf(samplePath(d));
    return { id, x: r1(c[0]), y: r1(c[1]), main: attr(node, 'data-main') === 'true', path: d };
  });

  // ---- atrium (floor 2 only) ----------------------------------------------
  const atriumNode = findById(svg, 'atrium');
  let atrium: string | undefined;
  if (atriumNode) {
    atrium = assertClosedPath(
      requireAttr(atriumNode, 'd', `${where} #atrium`),
      `${where} #atrium`,
    );
    addRoom('ATRIUM', 'Atrium void', 'void', 'core', false, atrium);
  }

  const floor: MapFloor = {
    number: n,
    planKey: `a-f${n}`,
    outline,
    zones,
    corridors,
    rooms,
    cores,
    landmarks,
    entrances,
  };
  if (atrium !== undefined) floor.atrium = atrium;

  return { floor, schedulable: rooms.filter((r) => r.schedulable).map((r) => r.code) };
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

export async function buildMapSpec(): Promise<MapSpec> {
  const results: FloorResult[] = [];
  for (const n of FLOOR_NUMBERS) results.push(await convertFloor(n));

  // Room codes are globally unique (rooms.code is `unique` in the schema).
  const seen = new Map<string, number>();
  for (const { floor } of results) {
    for (const room of floor.rooms) {
      const prev = seen.get(room.code);
      if (prev !== undefined) {
        fail(`duplicate room code "${room.code}" on floors ${prev} and ${floor.number}`);
      }
      seen.set(room.code, floor.number);
    }
  }

  // Appendix A: the schedulable set of every floor must match exactly.
  for (const { floor, schedulable } of results) {
    const expected = EXPECTED_SCHEDULABLE[floor.number] ?? [];
    const got = [...schedulable].sort();
    const want = [...expected].sort();
    const missing = want.filter((c) => !got.includes(c));
    const extra = got.filter((c) => !want.includes(c));
    if (missing.length || extra.length) {
      fail(
        `floor ${floor.number}: schedulable rooms do not match Appendix A` +
          (missing.length ? `\n  missing: ${missing.join(', ')}` : '') +
          (extra.length ? `\n  unexpected: ${extra.join(', ')}` : ''),
      );
    }
  }

  return {
    building: BUILDING_CODE,
    name: BUILDING_NAME,
    timezone: BUILDING_TIMEZONE,
    viewBox: [...VIEW_BOX],
    floors: results.map((r) => r.floor),
  };
}

function summary(spec: MapSpec): string {
  const rows = spec.floors.map((f) => ({
    floor: f.number,
    rooms: f.rooms.length,
    schedulable: f.rooms.filter((r) => r.schedulable).length,
    zones: f.zones.length + f.corridors.length,
    entrances: f.entrances.length,
  }));
  const total = rows.reduce(
    (a, r) => ({ ...a, rooms: a.rooms + r.rooms, schedulable: a.schedulable + r.schedulable }),
    { rooms: 0, schedulable: 0 },
  );
  const line = '  ─────┼───────┼─────────────┼───────┼──────────';
  return [
    '  floor│ rooms │ schedulable │ zones │ entrances',
    line,
    ...rows.map(
      (r) =>
        `  ${String(r.floor).padStart(5)}│${String(r.rooms).padStart(6)} │${String(
          r.schedulable,
        ).padStart(12)} │${String(r.zones).padStart(6)} │${String(r.entrances).padStart(10)}`,
    ),
    line,
    `  total│${String(total.rooms).padStart(6)} │${String(total.schedulable).padStart(12)} │`,
  ].join('\n');
}

async function main(): Promise<void> {
  const spec = await buildMapSpec();
  await writeFile(OUT_FILE, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(`map:build → ${OUT_FILE}`);
  console.log(summary(spec));
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nmap:build FAILED\n  ${msg}\n`);
    process.exit(1);
  });
}
