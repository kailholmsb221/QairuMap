'use client';

import { memo } from 'react';
import type { BBox, PlanPoint, VectorLook } from '@/lib/vector-map';

/**
 * A room's caption: its number, large, the way the photographed plates printed
 * it — one line, sized to the room, nothing else. The name lives in the tooltip
 * and the detail panel. A space the plan alone draws gets no caption at all
 * unless it is being pointed at, and then its name is printed the same way.
 *
 * The focused plate is turned −90° on screen, so a caption is counter-rotated by
 * +90° (plus the plan's own turn) and measures itself along the space's viewBox
 * *height*.
 */

const CHAR_W = 0.62; // average glyph advance of the caption face, em
const SIZE_MAX = 13;
const SIZE_MIN = 5.5;

export function captionSize(text: string, bbox: BBox, look: VectorLook): number {
  const turned = Math.abs(look.angle ?? 0) === 90;
  const across = (turned ? bbox.w : bbox.h) - 6;
  const down = (turned ? bbox.h : bbox.w) - 4;
  const size = Math.min(SIZE_MAX, across / (text.length * CHAR_W), down / 2.2);
  return size >= SIZE_MIN ? Math.floor(size * 2) / 2 : 0;
}

export type PlanCaptionProps = {
  text: string;
  bbox: BBox;
  label: PlanPoint;
  look: VectorLook;
  dimmed?: boolean;
};

function Caption({ text, bbox, label, look, dimmed }: PlanCaptionProps) {
  if (!text) return null;
  const size = captionSize(text, bbox, look);
  if (!size) return null;
  return (
    <g
      className={dimmed ? 'room-label label-dimmed' : 'room-label'}
      transform={`translate(${label.x} ${label.y}) rotate(${90 + (look.angle ?? 0)})`}
      pointerEvents="none"
    >
      <text className="room-label-primary" fontSize={size} textAnchor="middle" dominantBaseline="middle">
        {text}
      </text>
    </g>
  );
}

export const PlanCaption = memo(Caption);
