'use client';

import { memo } from 'react';
import type { BBox, PlanPoint, VectorLook } from '@/lib/vector-map';
import { vectorScale } from '@/lib/vector-map';

/**
 * A space's caption: the number large, the name smaller, sized to the space —
 * the authoring tool's `RoomLabel.tsx`, with its plan-unit constants scaled to
 * the plate. The focused plate is turned −90° on screen, so a caption is
 * counter-rotated by +90° (plus the plan's own turn) and measures itself along
 * the space's viewBox *height*.
 */

const CHAR_W = 0.58; // average glyph advance, em
const S = vectorScale;

function shorten(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  const words = name.split(/\s+/);
  let out = '';
  for (const w of words) {
    if (`${out} ${w}`.trim().length > maxChars - 1) break;
    out = `${out} ${w}`.trim();
  }
  return `${out || name.slice(0, maxChars - 1)}…`;
}

export type CaptionLayout = {
  fs: number;
  secFs: number;
  primary: string;
  secText: string;
};

export function captionLayout(number: string, name: string, bbox: BBox, look: VectorLook): CaptionLayout | null {
  const rotated = Math.abs(look.angle ?? 0) === 90;
  const availW = (rotated ? bbox.w : bbox.h) - 8 * S;
  const availH = (rotated ? bbox.h : bbox.w) - 6 * S;
  const primary = number || name;
  const secondary = number && name.toLowerCase() !== number.toLowerCase() ? name : '';
  let fs = look.fontSize ?? Math.min(14 * S, Math.max(6 * S, availH / 3.2));
  // shrink so the number / name fits the width
  const fitFont = (text: string, base: number, min: number) => {
    const need = text.length * CHAR_W * base;
    return need <= availW ? base : Math.max(min, availW / (text.length * CHAR_W));
  };
  fs = fitFont(primary, fs, 5 * S);
  if (!(fs >= 5 * S && availH >= fs)) return null;
  let secFs = Math.max(4.5 * S, fs * 0.62);
  let secText = secondary;
  if (secText) {
    const maxChars = Math.floor(availW / (CHAR_W * secFs));
    if (maxChars < 6 || availH < fs + secFs + 2 * S) secText = '';
    else secText = shorten(secText, maxChars);
  }
  if (!secText) secFs = 0;
  return { fs, secFs, primary, secText };
}

export type PlanCaptionProps = {
  number: string;
  name: string;
  bbox: BBox;
  label: PlanPoint;
  look: VectorLook;
  /** Show even a hidden caption (the space is hovered or selected). */
  forceShow?: boolean;
  dimmed?: boolean;
};

function Caption({ number, name, bbox, label, look, forceShow, dimmed }: PlanCaptionProps) {
  if (look.hideLabel && !forceShow) return null;
  const layout = captionLayout(number, name, bbox, look);
  if (!layout) return null;
  const { fs, secFs, primary, secText } = layout;
  const angle = 90 + (look.angle ?? 0);
  const dy = secText ? -secFs * 0.55 : 0;
  return (
    <g
      className={dimmed ? 'room-label label-dimmed' : 'room-label'}
      transform={`translate(${label.x} ${label.y}) rotate(${angle})`}
      pointerEvents="none"
    >
      <text className="room-label-primary" fontSize={fs} textAnchor="middle" dominantBaseline="middle" y={dy}>
        {primary}
      </text>
      {secText ? (
        <text
          className="room-label-secondary"
          fontSize={secFs}
          textAnchor="middle"
          dominantBaseline="middle"
          y={dy + fs * 0.62 + secFs * 0.6}
        >
          {secText}
        </text>
      ) : null}
    </g>
  );
}

export const PlanCaption = memo(Caption);
