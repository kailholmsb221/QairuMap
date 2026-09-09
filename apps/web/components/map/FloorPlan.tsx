'use client';

import { memo } from 'react';
import type { MapCore, MapFloor } from '@campuslive/contracts';

/**
 * Stairs + elevator glyphs, ported from `coreGlyph()` in `docs/design/src/plan.mjs`.
 *
 * Not currently drawn: the cores sit at authoring rectangles rather than at
 * anything the real floor plans show, so the furniture read as clutter on the
 * plate. Kept for when the cores are traced from the plans like the rooms.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CoreGlyph({ core }: { core: MapCore }) {
  const { x, y } = core.bbox;
  const isNorth = core.id === 'core-n';
  const sx = x + 10;
  const sy = y + 14;
  const sw = 56;
  const sh = 92;
  const ex = x + 76;
  const ew = 24;
  const lifts = isNorth ? [sy, sy + 34] : [sy];

  return (
    <g>
      <path
        d={core.path}
        fill="rgba(255,255,255,.03)"
        stroke="rgba(255,255,255,.14)"
        strokeWidth={1}
      />
      <rect
        x={sx}
        y={sy}
        width={sw}
        height={sh}
        fill="none"
        stroke="rgba(255,255,255,.28)"
        strokeWidth={1}
      />
      {Array.from({ length: 7 }, (_, i) => i + 1).map((i) => (
        <line
          key={i}
          x1={sx}
          y1={sy + (sh / 8) * i}
          x2={sx + sw}
          y2={sy + (sh / 8) * i}
          stroke="rgba(255,255,255,.22)"
          strokeWidth={1}
        />
      ))}
      <line
        x1={sx + sw / 2}
        y1={sy}
        x2={sx + sw / 2}
        y2={sy + sh}
        stroke="rgba(255,255,255,.22)"
        strokeWidth={1}
      />
      {lifts.map((ey) => (
        <g key={ey}>
          <rect
            x={ex}
            y={ey}
            width={ew}
            height={ew}
            fill="none"
            stroke="rgba(255,255,255,.28)"
            strokeWidth={1}
          />
          <path
            d={`M ${ex} ${ey} L ${ex + ew} ${ey + ew} M ${ex + ew} ${ey} L ${ex} ${ey + ew}`}
            stroke="rgba(255,255,255,.18)"
            strokeWidth={1}
          />
        </g>
      ))}
    </g>
  );
}

export type FloorPlanProps = {
  floor: MapFloor;
  idPrefix: string;
};

/**
 * Everything on a plate that never changes with the schedule: slab, wing tints,
 * corridors, cores, entrances and the lit top edge. Memoised — a 1 Hz tick or a
 * phase change must never re-render it.
 */
function Plan({ floor, idPrefix }: FloorPlanProps) {
  const zone = (id: string) => floor.zones.find((z) => z.id === id)?.path ?? '';

  return (
    <>
      <defs>
        <pattern
          id={`${idPrefix}hatch`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="rgba(251,146,60,.18)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(251,146,60,.7)" strokeWidth="2" />
        </pattern>
      </defs>

      <path id={`${idPrefix}outline`} d={floor.outline} fill="var(--slab)" />

      <g id={`${idPrefix}zones`}>
        <path d={zone('zone-north')} fill="var(--wing-north)" />
        <path d={zone('zone-hall')} fill="var(--wing-core)" />
        <path d={zone('zone-south')} fill="var(--wing-south)" />
      </g>

      <g id={`${idPrefix}corridors`}>
        {floor.corridors.map((c) => (
          <path key={c.id} d={c.path} fill="rgba(255,255,255,.035)" />
        ))}
      </g>


      {/*
        Entrances are not drawn: like the stair cores they sit at authoring
        rectangles rather than at anything the traced plans mark, so they landed
        as stray squares on the façade. `floor.entrances` is still in the map
        data, ready for when the doorways are traced from the plans.
      */}
    </>
  );
}

export const FloorPlan = memo(Plan);

/** The lit top edge is drawn above the rooms, so it is a separate memoised piece. */
export const FloorEdge = memo(function FloorEdge({ d }: { d: string }) {
  return <path d={d} fill="none" stroke="var(--slab-top)" strokeWidth={1.5} />;
});
