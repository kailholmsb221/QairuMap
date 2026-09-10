import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import building from '@campuslive/map-data/building-a.json';
import type { MapSpec, RoomLiveState } from '@campuslive/contracts';
import { roomState, session } from '@/test/fixtures';
import { photoFloors, photoPhase, withPhotoGeometry } from './photo-map';

describe('photo geometry adapter', () => {
  const spec = building as MapSpec;
  const mapped = withPhotoGeometry(spec);

  it('covers both floors and all rooms without changing API identities or metadata', () => {
    expect(mapped.floors).toHaveLength(2);
    expect(mapped.floors.flatMap((f) => f.rooms)).toHaveLength(54);
    for (const [index, floor] of mapped.floors.entries()) {
      const original = spec.floors[index]!;
      const photo = photoFloors[floor.number]!;
      expect(Object.keys(photo.rooms).sort()).toEqual(original.rooms.map((r) => r.code).sort());
      expect(floor.outline).toBe(photo.outline);
      for (const [i, room] of floor.rooms.entries()) {
        const source = photo.rooms[room.code]!;
        expect(room).toEqual({ ...original.rooms[i], path: source.path, bbox: source.bbox, label: source.label });
        expect(room.label.x).toBeGreaterThanOrEqual(room.bbox.x);
        expect(room.label.y).toBeGreaterThanOrEqual(room.bbox.y);
        expect(room.label.x).toBeLessThanOrEqual(room.bbox.x + room.bbox.w);
        expect(room.label.y).toBeLessThanOrEqual(room.bbox.y + room.bbox.h);
      }
    }
    expect(spec.floors[0]!.outline).not.toBe(mapped.floors[0]!.outline);
  });

  it('keeps the supplied original images byte-for-byte', () => {
    for (const photo of Object.values(photoFloors)) {
      const bytes = readFileSync(resolve('public', photo.image.replace(/^\//, '')));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.sha256);
    }
  });

  it('retains separate identities for duplicate printed numbers', () => {
    for (const [floor, first, second] of [[1, '102', '102A'], [2, '226', '226A']] as const) {
      const rooms = photoFloors[floor]!.rooms;
      expect(rooms[first]!.path).not.toBe(rooms[second]!.path);
      expect(rooms[first]!.label).not.toEqual(rooms[second]!.label);
    }
  });
});

describe('photo phase colors', () => {
  const phases: RoomLiveState['phase'][] = ['free', 'soon', 'live', 'ending'];

  it.each(phases)('uses the API %s phase even for delayed or conflicting sessions', (phase) => {
    const state = roomState({ phase, current: session({ status: 'delayed', conflict: true }) });
    expect(photoPhase({ type: 'lecture' }, state)).toBe(phase);
  });

  it.each(phases)('keeps administration gray during %s', (phase) => {
    expect(photoPhase({ type: 'admin' }, roomState({ phase }))).toBe('admin');
  });

  it('defaults missing state to free, not an invented lesson', () => {
    expect(photoPhase({ type: 'lecture' })).toBe('free');
    expect(photoPhase({ type: 'void' }, roomState())).toBe('void');
  });
});
