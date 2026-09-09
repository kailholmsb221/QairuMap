'use client';

import { memo } from 'react';
import type { MapFloor, MapRoom } from '@campuslive/contracts';
import { useRoomName } from '@/features/rooms/useRoomName';

/**
 * The room numbers and landmark names printed on a plate, the way a wayfinding
 * board does it.
 *
 * The focused plate is turned −90° about Z (`Scene`), so every label is
 * counter-rotated by +90° about its own anchor to read horizontally on screen.
 * Labels are drawn above the rooms and never take pointer events, so they do not
 * interfere with hover or selection.
 */

/** Spaces that get their name in full rather than their code. */
const LANDMARKS = new Set([
  '100', // Мәжіліс залы
  '102', // Кітапхана
  '219',
  '224',
  '228', // Коворкинг
  'AI-LAB',
  'CAFE',
  'CINEMA',
  'VOID-2',
]);

/**
 * Spaces that carry no caption at all. The served zone — the hall, the structures
 * standing in it, the stair cores and the atrium void — is filled like the rest
 * of the plan but never labelled: it is what you walk through, not what you are
 * looking for.
 */
const UNNUMBERED = /^(ATRIUM|CORE|TECH|VOID)/;
/** Restrooms are signed, not numbered — exactly as the plan prints them. */
const SIGNED: Record<string, string> = { 'WC-1': 'WC', 'WC-2': 'WC', 'WC-N2': 'WC', 'WC-S2': 'WC' };

/** Rough advance width of the UI face, as a fraction of the font size. */
const GLYPH = 0.6;
const NAME_MAX = 21;
/** Below this a name is unreadable; the room shows its number instead. */
const NAME_MIN = 13;
const CODE_SIZE = 13;
/** Below this a number cannot be drawn legibly at all. */
const CODE_MIN = 26;

/**
 * The plate is turned -90 degrees, so a label counter-rotated by +90 runs along
 * the room's viewBox *height*: that, not its width, is the room across the
 * screen. Rooms also sit at an angle, so a bounding box overstates the straight
 * run a label really has — hence the margins.
 */
const across = (room: MapRoom): number => room.bbox.h * 0.72;
const down = (room: MapRoom): number => room.bbox.w;

/**
 * The largest size at which `text` still fits the room, or 0 if none does.
 *
 * Names are fitted rather than accepted or rejected outright: "LIBRARY",
 * "БИБЛИОТЕКА" and "КІТАПХАНА" are the same room in three languages and three
 * lengths, and a room that can only take the short one would flip to a bare
 * number the moment the reader switched language.
 */
function fitSize(text: string, room: MapRoom, max: number): number {
  const byWidth = across(room) / (text.length * GLYPH);
  const byHeight = down(room) / 2.1;
  return Math.floor(Math.min(max, byWidth, byHeight));
}

export type PlanLabelsProps = { floor: MapFloor; idPrefix: string };

function Labels({ floor, idPrefix }: PlanLabelsProps) {
  const roomName = useRoomName();
  return (
    <g id={`${idPrefix}plan-labels`} pointerEvents="none" aria-hidden="true">
      {floor.rooms.map((room) => {
        const { x, y } = room.label;
        const spin = `rotate(90 ${x} ${y})`;

        if (LANDMARKS.has(room.code)) {
          const name = roomName(room.code, room.name).toUpperCase();
          const size = fitSize(name, room, NAME_MAX);
          if (size >= NAME_MIN) {
            return (
              <text
                key={room.code}
                className="plan-label plan-label--name"
                x={x}
                y={y}
                fontSize={size}
                transform={spin}
              >
                {name}
              </text>
            );
          }
        }

        if (UNNUMBERED.test(room.code)) return null;
        const text = SIGNED[room.code] ?? room.code;
        if (Math.min(room.bbox.w, room.bbox.h) < CODE_MIN) return null;
        if (fitSize(text, room, CODE_SIZE) < CODE_SIZE) return null;

        return (
          <text
            key={room.code}
            className="plan-label plan-label--code"
            x={x}
            y={y}
            transform={spin}
          >
            {text}
          </text>
        );
      })}
    </g>
  );
}

export const PlanLabels = memo(Labels);
