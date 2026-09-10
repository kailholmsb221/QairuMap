'use client';

import { memo } from 'react';
import type { MapFloor, RoomLiveState } from '@campuslive/contracts';
import type { RoomDisplayPhase } from '@/features/board/selectors';
import { photoFloors, photoPhase } from '@/lib/photo-map';
import { isPassiveRoom } from '@/lib/room-interaction';
import { RoomShape, type SceneMode } from './RoomShape';

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
  highlight?: ReadonlySet<string>;
  dots?: boolean;
  interactive?: boolean;
  label: RoomLabeller;
  /** Print the room numbers. Only ever true for the one plate in focus. */
  labels?: boolean;
  onSelect?: (code: string) => void;
  onHover?: (code: string | null) => void;
};

function Layer({
  floor,
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
  const photo = photoFloors[floor.number];
  if (!photo) return null;
  const maskId = `${idPrefix}photo-ink`;
  const hl = highlight ?? new Set<string>();
  const dimOthers = hl.size > 0 || !!selected;
  const dimTo = hl.size > 0 ? 0.35 : 0.5;

  return (
    <svg
      className="photo-floor-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 1000"
      width={width}
      height={height}
      data-floor={floor.number}
      data-building="A"
      overflow="visible"
      aria-hidden={interactive ? undefined : true}
      style={{ isolation: 'isolate', display: 'block' }}
    >
      <defs>
        <clipPath id={`${idPrefix}photo-outline`}><path d={floor.outline} /></clipPath>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={600} height={1000} style={{ maskType: 'luminance' }}>
          <image href={labels ? photo.mask : photo.distantMask} width={photo.width} height={photo.height} transform={photo.transform} />
        </mask>
      </defs>
      <g clipPath={`url(#${idPrefix}photo-outline)`} pointerEvents="none">
        <image data-testid={`floor-texture-${floor.number}`} href={photo.distantImage}
          width={photo.width} height={photo.height} transform={photo.transform} />
        <image data-testid={`floor-captions-${floor.number}`} href={photo.image}
          width={photo.width} height={photo.height} transform={photo.transform}
          opacity={labels ? 1 : 0} style={{ transition: 'opacity var(--dur-base) var(--ease-out)' }} />
      </g>

      <g id={`${idPrefix}rooms`}>
        {floor.rooms.map((room) => {
          const phase = photoPhase(room, states[room.code]);
          const isSel = selected === room.code;
          const isHl = hl.has(room.code);
          return (
            <RoomShape
              key={room.code}
              room={room}
              phase={phase}
              mode={mode}
              idPrefix={idPrefix}
              maskId={maskId}
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
