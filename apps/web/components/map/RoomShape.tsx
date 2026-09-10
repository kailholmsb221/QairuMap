'use client';

import { memo } from 'react';
import type { MapRoom, RoomLiveState } from '@campuslive/contracts';
import { isPassiveRoom } from '@/lib/room-interaction';

export type SceneMode = 'exploded' | 'focus';
export type PhotoPhase = RoomLiveState['phase'] | 'admin' | 'void';

export type RoomShapeProps = {
  room: MapRoom;
  phase: PhotoPhase;
  mode: SceneMode;
  idPrefix: string;
  maskId: string;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  dimTo?: number;
  ariaLabel: string;
  interactive?: boolean;
  onSelect?: (code: string) => void;
  onHover?: (code: string | null) => void;
};

/** The same photographed contour owns the tint, hit target and focus stroke. */
function Shape({
  room, phase, mode, idPrefix, maskId, selected, highlighted, dimmed, dimTo = 0.5,
  ariaLabel, interactive = true, onSelect, onHover,
}: RoomShapeProps) {
  if (isPassiveRoom(room.code)) {
    return highlighted ? (
      <g data-passive-highlight={room.code}>
        <path d={room.path} fill="none" stroke="var(--accent)" strokeWidth={10}
          opacity={0.22} pointerEvents="none" />
        <path d={room.path} fill="none" stroke="var(--accent)" strokeWidth={2.5}
          pointerEvents="none" />
      </g>
    ) : null;
  }
  const canInteract = interactive && room.type !== 'void';
  const color = phase === 'admin' ? '#888888'
    : phase === 'free' || phase === 'void' ? null : `var(--status-${phase})`;
  return (
    <>
      {color ? (
        <path data-room-tint={room.code} d={room.path} fill={color}
          mask={`url(#${maskId})`} className={phase === 'soon' ? 'blink' : undefined}
          style={{ mixBlendMode: 'color' }} pointerEvents="none" />
      ) : null}
      {dimmed ? (
        <path d={room.path} fill="#000000" opacity={1 - dimTo}
          mask={`url(#${maskId})`} pointerEvents="none" />
      ) : null}
      <g opacity={dimmed ? dimTo : 1} style={{ transition: 'opacity var(--dur-base) var(--ease-out)' }}>
        <path
          id={`${idPrefix}room-${room.code}`}
          className="photo-room-hit"
          data-phase={phase}
          data-type={room.type}
          data-room={room.code}
          data-highlighted={highlighted || undefined}
          d={room.path}
          fill="transparent"
          stroke="transparent"
          strokeWidth={1}
          {...(canInteract ? {
            role: 'button',
            pointerEvents: 'fill' as const,
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
            onMouseEnter: () => onHover?.(room.code),
            onMouseLeave: () => onHover?.(null),
            onFocus: () => onHover?.(room.code),
            onBlur: () => onHover?.(null),
            style: { cursor: 'pointer' },
          } : { 'aria-hidden': true, pointerEvents: 'none' as const })}
        />
        {selected || highlighted ? (
          <>
            <path d={room.path} fill="none" stroke="var(--accent)" strokeWidth={10} opacity={0.22} pointerEvents="none" />
            <path d={room.path} fill="none" stroke="var(--accent)" strokeWidth={2.5} pointerEvents="none" />
          </>
        ) : null}
        {mode === 'focus' && !selected && !highlighted && phase === 'live' ? (
          <path d={room.path} fill="none" stroke="var(--status-live)" strokeWidth={6} opacity={0.14} pointerEvents="none" />
        ) : null}
      </g>
    </>
  );
}

export const RoomShape = memo(Shape);
