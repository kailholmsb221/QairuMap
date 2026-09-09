'use client';

import { memo } from 'react';
import type { MapRoom } from '@campuslive/contracts';
import type { RoomDisplayPhase } from '@/features/board/selectors';

export type SceneMode = 'exploded' | 'focus';

/**
 * How a space with no timetable is painted.
 *
 * Blue is every room a visitor can walk into — the cafe, the library, an office —
 * so they stay as legible as a lecture hall. Grey is the served zone: the north
 * hall, the structures standing inside it and the stair cores. It is filled like
 * everything else on the plan but carries no name, because it is what you walk
 * through rather than what you are looking for.
 */
function quietPhase(code: string): 'service' | 'room' {
  return /^(ATRIUM|TECH|CORE)/.test(code) ? 'service' : 'room';
}

export type RoomShapeProps = {
  room: MapRoom;
  phase: RoomDisplayPhase;
  mode: SceneMode;
  idPrefix: string;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  dimTo?: number;
  ariaLabel: string;
  interactive?: boolean;
  onSelect?: (code: string) => void;
  onHover?: (code: string | null) => void;
};

/**
 * One room polygon. The fill comes from `data-phase` through CSS variables, so a
 * phase change never rebuilds the path; the glow is a second stroked path, never
 * a filter.
 */
function Shape({
  room,
  phase,
  mode,
  idPrefix,
  selected,
  highlighted,
  dimmed,
  dimTo = 0.5,
  ariaLabel,
  interactive = true,
  onSelect,
  onHover,
}: RoomShapeProps) {
  const isVoid = room.type === 'void';
  const dataPhase = isVoid ? 'void' : !room.schedulable ? quietPhase(room.code) : phase;
  const conflict = phase === 'conflict' && room.schedulable && !isVoid;
  // Every space answers to a click, not just the teaching ones: the point of the
  // plan is to find the cafe, a restroom or an office as readily as a lecture
  // hall. Only the atrium void stays inert — it is a hole, not a room.
  const canInteract = interactive && !isVoid;

  return (
    <g opacity={dimmed ? dimTo : 1} style={{ transition: 'opacity var(--dur-base) var(--ease-out)' }}>
      <path
        id={`${idPrefix}room-${room.code}`}
        className={`room-shape${dataPhase === 'soon' ? ' blink' : ''}`}
        data-phase={conflict ? 'conflict' : dataPhase}
        data-type={room.type}
        data-room={room.code}
        d={room.path}
        strokeWidth={1}
        {...(conflict
          ? { fill: `url(#${idPrefix}hatch)`, stroke: 'rgba(251,146,60,.75)' }
          : {})}
        {...(canInteract
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': ariaLabel,
              onClick: () => onSelect?.(room.code),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(room.code);
                }
              },
              onMouseEnter: () => onHover?.(room.code),
              onMouseLeave: () => onHover?.(null),
              onFocus: () => onHover?.(room.code),
              onBlur: () => onHover?.(null),
              style: { cursor: 'pointer' },
            }
          : { 'aria-hidden': true, pointerEvents: 'none' as const })}
      />
      {room.type === 'void' && room.code === 'VOID-2' ? (
        <rect
          x={room.bbox.x + room.bbox.w / 2 - 12}
          y={room.bbox.y}
          width={24}
          height={room.bbox.h}
          fill="var(--slab)"
          stroke="rgba(255,255,255,.30)"
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      ) : null}
      {selected || highlighted ? (
        <>
          <path
            d={room.path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={10}
            opacity={0.22}
            pointerEvents="none"
          />
          <path
            d={room.path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            pointerEvents="none"
          />
        </>
      ) : null}
      {mode === 'focus' && !selected && !highlighted && (phase === 'live' || phase === 'delayed') ? (
        <path
          d={room.path}
          fill="none"
          stroke="var(--status-live)"
          strokeWidth={6}
          opacity={0.14}
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

export const RoomShape = memo(Shape);
