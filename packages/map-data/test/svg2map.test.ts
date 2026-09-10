import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MapSpec } from '@campuslive/contracts';
import { buildMapSpec } from '../scripts/svg2map.js';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** docs/BUILDING.md — the room programme of the real building. */
const EXPECTED = {
  totalRooms: 54,
  totalSchedulable: 12,
  perFloor: {
    1: {
      rooms: 16,
      schedulable: ['100', '101'],
      codes: [
        '100', '101', '102', '102A', '103', 'ATRIUM-N', 'CAFE', 'CINEMA', 'CORE-N1', 'CORE-S1',
        'CR', 'TECH-N2', 'TECH-N3', 'TECH-S1', 'WC-1', 'WC-2',
      ],
    },
    2: {
      rooms: 38,
      schedulable: ['200', '201', '204', '219', '222', '223', '224', '226', '226A', 'AI-LAB'],
      codes: [
        '200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211',
        '212', '213', '214', '215', '217', '218', '219', '220', '221', '222', '223', '224',
        '225', '226', '226A', '227', '228', '229', '231', '232', 'AI-LAB', 'CORE-N2',
        'CORE-S2', 'VOID-2', 'WC-N2', 'WC-S2',
      ],
    },
  },
} as const;

describe('svg2map', () => {
  let spec: MapSpec;

  beforeAll(async () => {
    spec = await buildMapSpec();
  });

  it('describes building A with the shared viewBox', () => {
    expect(spec.building).toBe('A');
    expect(spec.timezone).toBe('Asia/Almaty');
    expect(spec.viewBox).toEqual([0, 0, 600, 1000]);
    expect(spec.floors.map((f) => f.number)).toEqual([1, 2]);
    expect(spec.floors.map((f) => f.planKey)).toEqual(['a-f1', 'a-f2']);
  });

  it('produces the room programme of docs/BUILDING.md', () => {
    const rooms = spec.floors.flatMap((f) => f.rooms);
    expect(rooms).toHaveLength(EXPECTED.totalRooms);
    expect(rooms.filter((r) => r.schedulable)).toHaveLength(EXPECTED.totalSchedulable);

    for (const floor of spec.floors) {
      const n = floor.number as 1 | 2;
      const want = EXPECTED.perFloor[n];
      expect(floor.rooms, `floor ${n} room count`).toHaveLength(want.rooms);
      expect([...floor.rooms.map((r) => r.code)].sort(), `floor ${n} codes`).toEqual([
        ...want.codes,
      ]);
      expect(
        floor.rooms.filter((r) => r.schedulable).map((r) => r.code).sort(),
        `floor ${n} schedulable`,
      ).toEqual([...want.schedulable]);
    }
  });

  it('accepts the real codes — letters, digits and hyphens', () => {
    const codes = spec.floors.flatMap((f) => f.rooms).map((r) => r.code);
    for (const code of codes) expect(code, code).toMatch(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
    expect(codes).toEqual(expect.arrayContaining(['AI-LAB', '226A', 'WC-N2', 'CORE-S1']));
  });

  it('gives every room a unique code and a deterministic v5 id', () => {
    const rooms = spec.floors.flatMap((f) => f.rooms);
    const codes = rooms.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);

    const ids = rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('is deterministic across runs', async () => {
    const again = await buildMapSpec();
    expect(again).toEqual(spec);
  });

  it('closes every path with M … Z', () => {
    const paths: Array<[string, string]> = [];
    for (const floor of spec.floors) {
      paths.push([`floor ${floor.number} outline`, floor.outline]);
      for (const z of [...floor.zones, ...floor.corridors]) paths.push([z.id, z.path]);
      for (const r of floor.rooms) paths.push([`room ${r.code}`, r.path]);
      for (const c of floor.cores) paths.push([`core ${c.code}`, c.path]);
      for (const e of floor.entrances) paths.push([e.id, e.path]);
      if (floor.atrium) paths.push([`floor ${floor.number} atrium`, floor.atrium]);
    }
    expect(paths.length).toBeGreaterThan(60);
    for (const [where, d] of paths) {
      expect(d.startsWith('M'), `${where} starts with M`).toBe(true);
      expect(d.endsWith('Z'), `${where} ends with Z`).toBe(true);
    }
  });

  it('keeps every room inside the building silhouette', () => {
    for (const floor of spec.floors) {
      const outline = floor.outline.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < outline.length; i += 2) {
        x0 = Math.min(x0, outline[i] as number);
        x1 = Math.max(x1, outline[i] as number);
        y0 = Math.min(y0, outline[i + 1] as number);
        y1 = Math.max(y1, outline[i + 1] as number);
      }
      for (const r of floor.rooms) {
        expect(r.bbox.x, `${r.code} left`).toBeGreaterThanOrEqual(x0 - 0.1);
        expect(r.bbox.y, `${r.code} top`).toBeGreaterThanOrEqual(y0 - 0.1);
        expect(r.bbox.x + r.bbox.w, `${r.code} right`).toBeLessThanOrEqual(x1 + 0.1);
        expect(r.bbox.y + r.bbox.h, `${r.code} bottom`).toBeLessThanOrEqual(y1 + 0.1);
      }
    }
  });

  it('anchors every label inside its own bbox', () => {
    for (const floor of spec.floors) {
      for (const r of floor.rooms) {
        expect(r.label.x, `room ${r.code} label.x`).toBeGreaterThanOrEqual(r.bbox.x - 0.1);
        expect(r.label.x).toBeLessThanOrEqual(r.bbox.x + r.bbox.w + 0.1);
        expect(r.label.y, `room ${r.code} label.y`).toBeGreaterThanOrEqual(r.bbox.y - 0.1);
        expect(r.label.y).toBeLessThanOrEqual(r.bbox.y + r.bbox.h + 0.1);
        expect(r.bbox.w).toBeGreaterThan(0);
        expect(r.bbox.h).toBeGreaterThan(0);
      }
    }
  });

  it('emits both cores as rooms and the atrium void on floor 2 only', () => {
    for (const floor of spec.floors) {
      expect(floor.cores.map((c) => c.id)).toEqual(['core-n', 'core-s']);
      for (const core of floor.cores) {
        const asRoom = floor.rooms.find((r) => r.code === core.code);
        expect(asRoom, `${core.code} must also exist as a room`).toBeDefined();
        expect(asRoom?.type).toBe('service');
        expect(asRoom?.wing).toBe('core');
        expect(asRoom?.schedulable).toBe(false);
      }
      expect(floor.landmarks.length).toBeGreaterThan(0);
      expect(floor.entrances.some((e) => e.main)).toBe(true);
      expect(floor.corridors.length, `floor ${floor.number} corridors`).toBeGreaterThan(0);
      for (const c of floor.corridors) expect(c.id).toMatch(/^corridor-\d+$/);
      expect(floor.zones.map((z) => z.id).sort()).toEqual(['zone-hall', 'zone-north', 'zone-south']);
    }

    const withAtrium = spec.floors.filter((f) => f.atrium !== undefined).map((f) => f.number);
    expect(withAtrium).toEqual([2]);
    const atriumRoom = spec.floors.flatMap((f) => f.rooms).filter((r) => r.code === 'VOID-2');
    expect(atriumRoom).toHaveLength(1);
    expect(atriumRoom[0]?.type).toBe('void');
  });

  it('decodes XML entities in room names', () => {
    const names = spec.floors.flatMap((f) => f.rooms).map((r) => r.name);
    expect(names).toContain('Stairs & Lifts');
    expect(names).toContain("Dean's Office");
    for (const name of names) expect(name).not.toMatch(/&(quot|amp|lt|gt|apos|#\d+);/);
  });

  it('validates against schema.json', async () => {
    const schema = JSON.parse(await readFile(resolve(PKG_ROOT, 'schema.json'), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const validate = ajv.compile(schema);
    const ok = validate(spec);
    expect(
      validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n') ?? '',
    ).toBe('');
    expect(ok).toBe(true);
  });

  it('matches the committed building-a.json', async () => {
    const committed = JSON.parse(
      await readFile(resolve(PKG_ROOT, 'building-a.json'), 'utf8'),
    ) as MapSpec;
    expect(committed).toEqual(spec);
  });
});
