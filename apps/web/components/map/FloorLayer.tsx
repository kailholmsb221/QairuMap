'use client';

import { memo, useMemo } from 'react';
import type { MapFloor, RoomLiveState } from '@campuslive/contracts';
import type { RoomDisplayPhase } from '@/features/board/selectors';
import { useRoomName } from '@/features/rooms/useRoomName';
import { STATUS_COLORS, phaseStatus } from '@/lib/plan-theme';
import { isPassiveRoom } from '@/lib/room-interaction';
import { roomLooks, vectorFloors, type VectorLook } from '@/lib/vector-map';
import { PlanCaption } from './PlanCaption';
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
  hovered?: string | null;
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

/** Spaces that carry no number on the plan: the caption is the name alone. */
const UNNUMBERED = /^(ATRIUM|CORE|TECH|VOID)/;
/** Restrooms are signed, not numbered — exactly as the plan prints them. */
const SIGNED: Record<string, string> = { 'WC-1': 'WC', 'WC-2': 'WC', 'WC-N2': 'WC', 'WC-S2': 'WC' };

const FALLBACK_LOOK: VectorLook = { type: 'office' };

/**
 * One floor plate in the authoring tool's layer order: the floor and the
 * unnamed spaces, the rooms the API knows (painted by phase), the walls, the
 * doors and fittings, the captions, the selection outline — and, in the
 * exploded stack, the status dots.
 */
function Layer({
  floor,
  phases,
  states,
  mode,
  width,
  height,
  selected,
  hovered,
  highlight,
  dots,
  interactive = true,
  label,
  labels,
  onSelect,
  onHover,
}: FloorLayerProps) {
  const idPrefix = `f${floor.number}-`;
  const roomName = useRoomName();
  const looks = useMemo(() => roomLooks(floor.number), [floor.number]);
  const vec = vectorFloors[floor.number];
  if (!vec) return null;
  const hl = highlight ?? new Set<string>();
  const dimOthers = hl.size > 0;
  const pointed = (code: string) => selected === code || hl.has(code);

  return (
    <svg
      className="floor-svg map-svg"
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
      <VectorUnder floor={vec} idPrefix={idPrefix} highlight={hl} dimmed={dimOthers} />

      {/* 2. the rooms the timetable knows */}
      <g id={`${idPrefix}rooms`} className="rooms rooms-main">
        {floor.rooms.map((room) => (
          <RoomShape
            key={room.code}
            room={room}
            look={looks[room.code] ?? FALLBACK_LOOK}
            phase={phases[room.code] ?? 'free'}
            mode={mode}
            idPrefix={idPrefix}
            selected={selected === room.code}
            highlighted={hl.has(room.code)}
            dimmed={dimOthers && !pointed(room.code)}
            interactive={interactive}
            ariaLabel={label(room, states[room.code])}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </g>

      <VectorOver floor={vec} idPrefix={idPrefix} detail={!!labels} highlight={hl} dimmed={dimOthers} />

      {labels ? (
        <g id={`${idPrefix}plan-labels`} className="labels" pointerEvents="none" aria-hidden="true">
          {floor.rooms.map((room) => {
            const number = UNNUMBERED.test(room.code) ? '' : (SIGNED[room.code] ?? room.code);
            return (
              <PlanCaption
                key={room.code}
                number={number}
                name={roomName(room.code, room.name)}
                bbox={room.bbox}
                label={room.label}
                look={looks[room.code] ?? FALLBACK_LOOK}
                forceShow={pointed(room.code) || hovered === room.code}
                dimmed={dimOthers && !pointed(room.code)}
              />
            );
          })}
        </g>
      ) : null}

      {/* 9. the selection outline, above everything */}
      <g id={`${idPrefix}selection`} className="selection" pointerEvents="none">
        {floor.rooms.map((room) =>
          pointed(room.code) ? <path key={room.code} d={room.path} className="selection-outline" /> : null,
        )}
        {vec.spaces.map((s) =>
          hl.has(s.id) ? <path key={s.id} d={s.path} className="selection-outline" /> : null,
        )}
      </g>

      {dots ? (
        <g id={`${idPrefix}dots`} pointerEvents="none">
          {floor.rooms.map((room) => {
            const phase = phases[room.code];
            if (isPassiveRoom(room.code) || !room.schedulable || !phase || phase === 'free') return null;
            const colour = STATUS_COLORS[phaseStatus(phase)];
            const dimmed = dimOthers && !pointed(room.code);
            return (
              <g key={room.code} opacity={dimmed ? 0.28 : 1}>
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
