import { describe, expect, it } from 'vitest';
import building from '@campuslive/map-data/building-a.json';
import type { MapSpec } from '@campuslive/contracts';
import { samplePath } from '@/lib/map-geometry';
import { isMapSearchableRoom } from './room-interaction';
import { listPlaces, placeById, roomLooks, searchPlaces, vectorFloors, withVectorGeometry } from './vector-map';

const spec = building as MapSpec;
const mapped = withVectorGeometry(spec);

/** Ray casting on the sampled contour — `label` must sit inside its own room. */
function inside(d: string, x: number, y: number): boolean {
  const pts = samplePath(d);
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('vector geometry adapter', () => {
  it('keeps every room the plan has a space for, with its API identity and metadata intact', () => {
    expect(mapped.floors).toHaveLength(2);
    const dropped = Object.values(vectorFloors).flatMap((f) => f.unmapped);
    expect(dropped).toEqual(['229', '232']);
    expect(mapped.floors.flatMap((f) => f.rooms)).toHaveLength(54 - dropped.length);

    for (const [index, floor] of mapped.floors.entries()) {
      const original = spec.floors[index]!;
      const vec = vectorFloors[floor.number]!;
      expect(floor.outline).toBe(vec.outline);
      expect(floor.outline).not.toBe(original.outline);
      expect(Object.keys(vec.rooms).sort()).toEqual(
        original.rooms.map((r) => r.code).filter((c) => !vec.unmapped.includes(c)).sort(),
      );
      for (const room of floor.rooms) {
        const source = original.rooms.find((r) => r.code === room.code)!;
        const shape = vec.rooms[room.code]!;
        expect(room).toEqual({ ...source, path: shape.path, bbox: shape.bbox, label: shape.label });
      }
    }
  });

  it('never lets two codes share one drawn space', () => {
    for (const vec of Object.values(vectorFloors)) {
      const sources = Object.values(vec.rooms).map((r) => r.source);
      expect(new Set(sources).size).toBe(sources.length);
      const spaceIds = vec.spaces.map((s) => s.id);
      expect(sources.filter((s) => spaceIds.includes(s))).toEqual([]);
    }
  });

  it('puts every room label and every place label inside its own contour, on the plate', () => {
    for (const vec of Object.values(vectorFloors)) {
      for (const [code, room] of Object.entries(vec.rooms)) {
        expect(inside(room.path, room.label.x, room.label.y), `${code} label`).toBe(true);
        expect(room.bbox.x).toBeGreaterThanOrEqual(0);
        expect(room.bbox.y).toBeGreaterThanOrEqual(0);
        expect(room.bbox.x + room.bbox.w).toBeLessThanOrEqual(600);
        expect(room.bbox.y + room.bbox.h).toBeLessThanOrEqual(1000);
      }
      // a hidden caption may sit anywhere (the buffet zone is a ring around the cafe)
      for (const space of vec.spaces.filter((s) => !s.hideLabel)) {
        expect(inside(space.path, space.label.x, space.label.y), `${space.id} label`).toBe(true);
      }
    }
  });

  it('draws the duplicate printed numbers as two different rooms', () => {
    for (const [floor, first, second] of [[1, '102', '102A'], [2, '226', '226A']] as const) {
      const rooms = vectorFloors[floor]!.rooms;
      expect(rooms[first]!.path).not.toBe(rooms[second]!.path);
      expect(rooms[first]!.label).not.toEqual(rooms[second]!.label);
    }
  });

  it('carries the walls, doors and fittings of both plans', () => {
    for (const vec of Object.values(vectorFloors)) {
      expect(vec.walls.length).toBeGreaterThan(200);
      expect(vec.walls.some((w) => w.exterior)).toBe(true);
      expect(vec.doors.length).toBeGreaterThan(50);
      expect(vec.glyphs.filter((g) => g.kind === 'stairs')).toHaveLength(2);
      expect(vec.glyphs.filter((g) => g.kind === 'lift').length).toBeGreaterThanOrEqual(4);
    }
    expect(vectorFloors[2]!.glyphs.some((g) => g.kind === 'shaft')).toBe(true);
  });

  it("carries the plan's look of every room: kind, service or place, turned and hidden captions", () => {
    const looks = roomLooks(1);
    expect(Object.keys(looks).sort()).toEqual(Object.keys(vectorFloors[1]!.rooms).sort());
    for (const look of Object.values(looks)) {
      if (look.angle != null) expect([90, -90]).toContain(look.angle);
    }
    expect(looks['CORE-N1']).toMatchObject({ type: 'stairs', quiet: true });
    expect(looks['100']).toMatchObject({ type: 'class' });
    expect(looks['100']!.quiet).toBeUndefined();
    expect(roomLooks(2)['VOID-2']).toMatchObject({ type: 'tech', hideLabel: true });
    expect(roomLooks(3)).toEqual({});
  });
});

describe('places', () => {
  it('lists the named spaces a visitor would look for, never circulation or placeholders', () => {
    const places = listPlaces();
    expect(places.length).toBeGreaterThan(10);
    const names = places.map((p) => p.name);
    expect(names).toContain('Коворкинг');
    expect(names).toContain('Съёмочный павильон');
    for (const p of places) {
      expect(['corridor', 'wc', 'stairs', 'lift', 'tech']).not.toContain(p.type);
      expect(p.name).not.toMatch(/^(Помещение|Кабинет|Тамбур|Коридор)$/);
      expect(p.id).toBe(p.id.toLowerCase());
      // a place id must survive the store's passive-room guard so search can point at it
      expect(isMapSearchableRoom(p.id)).toBe(true);
    }
  });

  it('finds a place by a fragment of its name and resolves it back by id', () => {
    const hits = searchPlaces('ковор');
    expect(hits.map((h) => h.name)).toEqual(['Коворкинг']);
    expect(hits[0]!.floor).toBe(1);
    expect(placeById(hits[0]!.id)).toEqual(hits[0]);
    expect(searchPlaces('')).toEqual([]);
    expect(searchPlaces('zzz')).toEqual([]);
    expect(searchPlaces('зал').length).toBeLessThanOrEqual(6);
  });
});

describe('samplePath with arcs', () => {
  it('walks a semicircle through its far side, not across its chord', () => {
    // a half circle of radius 10 from (0,0) to (20,0), bulging to y < 0 (sweep 1 in screen space)
    const pts = samplePath('M 0 0 A 10 10 0 0 1 20 0 Z', 8);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]![0]).toBeCloseTo(20);
    const top = Math.min(...pts.map((p) => p[1]));
    expect(top).toBeCloseTo(-10, 1);
    for (const p of pts) expect(Math.hypot(p[0] - 10, p[1])).toBeCloseTo(10, 5);
  });

  it('reaches the curved façade of the plan, so the fit sees the whole plate', () => {
    const outline = vectorFloors[1]!.outline;
    expect(outline).toContain(' A ');
    const xs = samplePath(outline).map((p) => p[0]);
    // the west façade bows out to the plate margin; the chord alone would stop well short
    expect(Math.min(...xs)).toBeLessThan(25);
  });
});
