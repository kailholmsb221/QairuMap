'use client';

import { memo } from 'react';
import type { MapRoom } from '@campuslive/contracts';
import type { RoomDisplayPhase } from '@/features/board/selectors';
import { planFill } from '@/lib/plan-theme';
import { isPassiveRoom } from '@/lib/room-interaction';
import type { VectorLook } from '@/lib/vector-map';

export type SceneMode = 'exploded' | 'focus';

export type RoomShapeProps = {
  room: MapRoom;
  /** How the plan draws this space: kind, service or place, caption hints. */
  look: VectorLook;
  phase: RoomDisplayPhase;
  mode: SceneMode;
  idPrefix: string;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  ariaLabel: string;
  interactive?: boolean;
  onSelect?: (code: string) => void;
  onHover?: (code: string | null) => void;
};

/**
 * One room the API knows — the authoring tool's `RoomShape.tsx`: the contour is
 * the fill and the hit target, painted by the plan's rules (circulation and
 * plant by kind, everything else by status), lifted on hover, dimmed when
 * something else is being pointed at. The selection outline is drawn by
 * `FloorLayer` above the walls, as the tool does.
 */
function Shape({
  room,
  look,
  phase,
  idPrefix,
  selected,
  highlighted,
  dimmed,
  ariaLabel,
  interactive = true,
  onSelect,
  onHover,
}: RoomShapeProps) {
  const isVoid = room.type === 'void';
  const passive = isPassiveRoom(room.code);
  // Every space answers to a click, not just the teaching ones: the point of the
  // plan is to find the cafe, a restroom or an office as readily as a lecture
  // hall. The atrium void is a hole, not a room, and the first-floor public
  // facilities are drawn but have no map actions (`room-interaction.ts`).
  const canInteract = interactive && !isVoid && !passive;
  // a room without a timetable is what the plan says it is, never a live phase
  const status = room.schedulable ? phase : undefined;
  const cls = [
    'room',
    selected || highlighted ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    status === 'soon' ? 'blink' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <path
      id={`${idPrefix}room-${room.code}`}
      className={cls}
      fill={planFill(look, status)}
      data-phase={status ?? (look.quiet ? 'service' : 'room')}
      data-type={room.type}
      data-room={room.code}
      data-passive={passive || undefined}
      data-highlighted={highlighted || undefined}
      d={room.path}
      {...(canInteract
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': ariaLabel,
            'aria-pressed': !!selected,
            onClick: () => onSelect?.(room.code),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(room.code);
              }
            },
            onPointerEnter: () => onHover?.(room.code),
            onPointerLeave: () => onHover?.(null),
            onFocus: () => onHover?.(room.code),
            onBlur: () => onHover?.(null),
          }
        : { 'aria-hidden': true, pointerEvents: 'none' as const })}
    />
  );
}

export const RoomShape = memo(Shape);
