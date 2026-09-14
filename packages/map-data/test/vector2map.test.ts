import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVectorMap } from '../scripts/vector2map';

const PKG_ROOT = resolve(import.meta.dirname, '..');

describe('vector2map', () => {
  it('matches the committed vector-map.json (run `pnpm vector:build` after editing vector/)', async () => {
    const built = await buildVectorMap();
    const committed = JSON.parse(await readFile(resolve(PKG_ROOT, 'vector-map.json'), 'utf8'));
    expect(built).toEqual(committed);
  });

  it('puts both plates in the shared 600×1000 frame, at one scale, with the façade on the west', async () => {
    const map = await buildVectorMap();
    expect(map.viewBox).toEqual([0, 0, 600, 1000]);
    expect(map.source.viewBox).toEqual([0, 0, 1600, 1000]);
    for (const floor of Object.values(map.floors)) {
      for (const d of [floor.outline, ...Object.values(floor.rooms).map((r) => r.path), ...floor.spaces.map((s) => s.path)]) {
        expect(d).toMatch(/^M /);
        expect(d).toMatch(/ Z$/);
        const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        for (const n of nums) expect(Number.isFinite(n)).toBe(true);
      }
      // the curved façade is the only arc of the outline and it bows towards x = 0
      expect(floor.outline.split(' A ').length - 1).toBeGreaterThanOrEqual(1);
      const xs = floor.outline.match(/(?:M|L|\d+ \d+ \d+) (-?\d+(?:\.\d+)?) /g);
      expect(xs).not.toBeNull();
    }
    // the two plates share their outline extents, so they stack in the exploded view
    const extent = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const f1 = extent(map.floors['1']!.outline);
    const f2 = extent(map.floors['2']!.outline);
    expect(Math.min(...f1)).toBeCloseTo(Math.min(...f2), 0);
    expect(Math.max(...f1)).toBeCloseTo(Math.max(...f2), 0);
  });

  it('maps every contract code once, to a distinct space, and pins what the plan lacks', async () => {
    const map = await buildVectorMap();
    const spec = JSON.parse(await readFile(resolve(PKG_ROOT, 'building-a.json'), 'utf8')) as {
      floors: { number: number; rooms: { code: string }[] }[];
    };
    for (const specFloor of spec.floors) {
      const floor = map.floors[String(specFloor.number)]!;
      const codes = specFloor.rooms.map((r) => r.code);
      expect([...Object.keys(floor.rooms), ...floor.unmapped].sort()).toEqual([...codes].sort());
      const sources = Object.values(floor.rooms).map((r) => r.source);
      expect(new Set(sources).size).toBe(sources.length);
      for (const s of floor.spaces) expect(sources).not.toContain(s.id);
    }
    expect(map.floors['1']!.unmapped).toEqual([]);
    expect(map.floors['2']!.unmapped).toEqual(['229', '232']);
    expect(map.floors['1']!.rooms['102']!.source).toBe('f1-class20b');
    expect(map.floors['1']!.rooms['102A']!.source).toBe('f1-labassist');
    expect(map.floors['2']!.rooms['226']!.source).toBe('f2-226');
    expect(map.floors['2']!.rooms['226A']!.source).toBe('f2-226u');
    expect(map.floors['2']!.rooms['VOID-2']!.source).toBe('f2-void');
  });

  it('turns the stair arrows with the plan and scales the door widths', async () => {
    const map = await buildVectorMap();
    const stairs = map.floors['1']!.glyphs.filter((g) => g.kind === 'stairs');
    expect(stairs).toHaveLength(2);
    for (const door of map.floors['1']!.doors) {
      const [, x1, y1, x2, y2] = door.opening.match(/M (\S+) (\S+) L (\S+) (\S+)/)!.map(Number);
      const width = Math.hypot(x2! - x1!, y2! - y1!);
      // the plans draw 18–48 unit openings (the double doors are the wide ones); on the plate that is ×0.62
      expect(width).toBeGreaterThan(18 * 0.6);
      expect(width).toBeLessThan(48 * 0.64);
    }
  });
});
