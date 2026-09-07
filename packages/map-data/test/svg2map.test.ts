import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MapSpec } from '@campuslive/contracts';
import { buildMapSpec } from '../scripts/svg2map.js';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Appendix A of docs/ARCHITECTURE.md. */
const EXPECTED = {
  totalRooms: 89,
  totalSchedulable: 41,
  perFloor: {
    1: { schedulable: 5 },
    2: { schedulable: 12 },
    3: { schedulable: 12 },
    4: { schedulable: 12 },
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
    expect(spec.floors.map((f) => f.number)).toEqual([1, 2, 3, 4]);
    expect(spec.floors.map((f) => f.planKey)).toEqual(['a-f1', 'a-f2', 'a-f3', 'a-f4']);
  });

  it('produces the expected room counts', () => {
    const rooms = spec.floors.flatMap((f) => f.rooms);
    expect(rooms).toHaveLength(EXPECTED.totalRooms);
    expect(rooms.filter((r) => r.schedulable)).toHaveLength(EXPECTED.totalSchedulable);

    for (const floor of spec.floors) {
      const n = floor.number as 1 | 2 | 3 | 4;
      expect(
        floor.rooms.filter((r) => r.schedulable).length,
        `floor ${n} schedulable count`,
      ).toBe(EXPECTED.perFloor[n].schedulable);
    }
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
    expect(paths.length).toBeGreaterThan(100);
    for (const [where, d] of paths) {
      expect(d.startsWith('M'), `${where} starts with M`).toBe(true);
      expect(d.endsWith('Z'), `${where} ends with Z`).toBe(true);
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

  it('emits both cores as rooms and the atrium on floor 2 only', () => {
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
      expect(floor.corridors.map((c) => c.id)).toEqual(['corridor-north', 'corridor-south']);
    }

    const withAtrium = spec.floors.filter((f) => f.atrium !== undefined).map((f) => f.number);
    expect(withAtrium).toEqual([2]);
    const atriumRoom = spec.floors
      .flatMap((f) => f.rooms)
      .filter((r) => r.code === 'ATRIUM');
    expect(atriumRoom).toHaveLength(1);
    expect(atriumRoom[0]?.type).toBe('void');
  });

  it('decodes XML entities in room names', () => {
    const names = spec.floors.flatMap((f) => f.rooms).map((r) => r.name);
    expect(names).toContain('Lecture Hall "Gamma"');
    expect(names).toContain('Print & Copy Center');
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
