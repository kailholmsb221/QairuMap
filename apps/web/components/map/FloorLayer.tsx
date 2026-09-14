'use client';

import { memo } from 'react';
import type { MapFloor, RoomLiveState } from '@campuslive/contracts';
import type { RoomDisplayPhase } from '@/features/board/selectors';
import { isPassiveRoom } from '@/lib/room-interaction';
import { vectorFloors } from '@/lib/vector-map';
import { PlanLabels } from './PlanLabels';
import { RoomShape, type SceneMode } from './RoomShape';
import { VectorOver, VectorUnder } from './VectorPlan';

export type RoomLabeller = (
  room: MapFloor['rooms'][number],
  state: RoomLiveState | undefined,
) => string;

export type FloorLayerProps = {
  floor: MapFloor;
  phases: Record<string, RoomDisplayPhase>;
  states: Record<string, RoomLiveState>;
  mode: SceneMode;
  width: number;
  height: number;
  selected?: string | null;
  /** Room codes and space ids to point at. */
  highlight?: ReadonlySet<string>;
  dots?: boolean;
  interactive?: boolean;
  label: RoomLabeller;
  /** Print the captions, doors and glyphs. Only ever true for the one plate in focus. */
  labels?: boolean;
  onSelect?: (code: string) => void;
  onHover?: (code: string | null) => void;
};

/**
 * One floor plate, bottom to top: the slab and the unnamed spaces, the rooms
 * the API knows (coloured by phase), the walls and doors, the captions, and in
 * the exploded stack the status dots.
 */
function Layer({
  floor,
  phases,
  states,
  mode,
  width,
  height,
  selected,
  highlight,
  dots,
  interactive = true,
  label,
  labels,
  onSelect,
  onHover,
}: FloorLayerProps) {
  const idPrefix = `f${floor.number}-`;
  const vec = vectorFloors[floor.number];
  if (!vec) return null;
  const hl = highlight ?? new Set<string>();
  const dimOthers = hl.size > 0 || !!selected;
  const dimTo = hl.size > 0 ? 0.35 : 0.5;

  return (
    <svg
      className="floor-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 1000"
      width={width}
      height={height}
      data-floor={floor.number}
      data-building="A"
      overflow="visible"
      aria-hidden={interactive ? undefined : true}
      style={{ display: 'block' }}
    >
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

      <VectorUnder floor={vec} idPrefix={idPrefix} highlight={hl} dimmed={dimOthers} dimTo={dimTo} />

      <g id={`${idPrefix}rooms`}>
        {floor.rooms.map((room) => {
          const isSel = selected === room.code;
          const isHl = hl.has(room.code);
          return (
            <RoomShape
              key={room.code}
              room={room}
              phase={phases[room.code] ?? 'free'}
              mode={mode}
              idPrefix={idPrefix}
              selected={isSel}
              highlighted={isHl}
              dimmed={dimOthers && !isSel && !isHl}
              dimTo={dimTo}
              interactive={interactive}
              ariaLabel={label(room, states[room.code])}
              onSelect={onSelect}
              onHover={onHover}
            />
          );
        })}
      </g>

      <VectorOver floor={vec} idPrefix={idPrefix} detail={!!labels} />

      {labels ? <PlanLabels floor={floor} idPrefix={idPrefix} /> : null}

      {dots ? (
        <g id={`${idPrefix}dots`} pointerEvents="none">
          {floor.rooms.map((room) => {
            const phase = states[room.code]?.phase;
            if (isPassiveRoom(room.code) || !room.schedulable || !phase || phase === 'free') return null;
            const colour =
              phase === 'ending'
                ? 'var(--status-ending)'
                : phase === 'soon'
                  ? 'var(--status-soon)'
                  : 'var(--status-live)';
            const dimmed = dimOthers && selected !== room.code && !hl.has(room.code);
            return (
              <g key={room.code} opacity={dimmed ? dimTo : 1}>
                <circle
                  cx={room.label.x}
                  cy={room.label.y}
                  r={6}
                  fill={colour}
                  className="pulse"
                  opacity={0.9}
                />
                <circle cx={room.label.x} cy={room.label.y} r={4} fill={colour} />
              </g>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}

export const FloorLayer = memo(Layer);

/** The darker copy under a plate that gives it thickness (`slabUnderSvg()`). */
export const SlabUnder = memo(function SlabUnder({
  outline,
  width,
  height,
}: {
  outline: string;
  width: number;
  height: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 1000"
      width={width}
      height={height}
      overflow="visible"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d={outline} fill="var(--slab-edge)" stroke="rgba(0,0,0,.6)" strokeWidth={2} />
    </svg>
  );
});
