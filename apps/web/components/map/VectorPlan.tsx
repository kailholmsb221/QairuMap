'use client';

import { memo } from 'react';
import type { VectorFloor, VectorSpace } from '@/lib/vector-map';

/**
 * Everything on a plate the schedule never touches: the slab, the spaces the
 * API does not know (corridors, lift halls, the coworking …), the walls, the
 * doors and the stair / lift / plant glyphs. Ported from the authoring tool's
 * `FloorMap.tsx`, `WallLayer`, `DoorShape` and `ZoneIcons`, minus the editor.
 *
 * Two pieces because the rooms are drawn between them: `VectorUnder` is the
 * ground the rooms sit on, `VectorOver` is the line work on top of them.
 * Both are memoised — a 1 Hz tick or a phase change must never re-render them.
 */

export type VectorUnderProps = {
  floor: VectorFloor;
  idPrefix: string;
  /** Spaces to point at (a search hit); everything else dims when set. */
  highlight?: ReadonlySet<string>;
  dimmed?: boolean;
  dimTo?: number;
};

function Under({ floor, idPrefix, highlight, dimmed, dimTo = 0.5 }: VectorUnderProps) {
  const hl = highlight ?? new Set<string>();
  return (
    <g id={`${idPrefix}plan`} pointerEvents="none">
      <defs>
        <pattern
          id={`${idPrefix}plant`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--plan-plant)" strokeWidth="1" />
        </pattern>
      </defs>

      <path id={`${idPrefix}outline`} d={floor.outline} fill="var(--slab)" />

      <g id={`${idPrefix}spaces`}>
        {floor.spaces.map((s) => {
          const isHl = hl.has(s.id);
          return (
            <g
              key={s.id}
              opacity={dimmed && !isHl ? dimTo : 1}
              style={{ transition: 'opacity var(--dur-base) var(--ease-out)' }}
            >
              <path
                className="plan-space"
                data-space={s.id}
                data-space-type={s.type}
                data-highlighted={isHl || undefined}
                d={s.path}
              />
              {isHl ? (
                <>
                  <path d={s.path} fill="none" stroke="var(--accent)" strokeWidth={10} opacity={0.22} />
                  <path d={s.path} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
                </>
              ) : null}
            </g>
          );
        })}
      </g>
    </g>
  );
}

export const VectorUnder = memo(Under);

export type VectorOverProps = {
  floor: VectorFloor;
  idPrefix: string;
  /** The focused plate carries the doors, glyphs and captions; the exploded stack only the walls. */
  detail?: boolean;
};

function Over({ floor, idPrefix, detail }: VectorOverProps) {
  return (
    <g id={`${idPrefix}plan-lines`} pointerEvents="none" aria-hidden="true">
      <g id={`${idPrefix}walls`} className="plan-walls">
        {floor.walls.map((w, i) => (
          <path
            key={i}
            className={w.exterior ? 'plan-wall plan-wall--exterior' : 'plan-wall plan-wall--interior'}
            strokeDasharray={w.virtual ? '3 2.4' : undefined}
            opacity={w.virtual ? 0.6 : undefined}
            d={w.d}
          />
        ))}
      </g>

      {detail ? (
        <>
          <g id={`${idPrefix}doors`} className="plan-doors">
            {floor.doors.map((d, i) => (
              <g key={i}>
                <path className="plan-door-opening" d={d.opening} />
                {d.leaves.map((leaf, j) => (
                  <path key={j} className="plan-door-leaf" d={leaf} />
                ))}
              </g>
            ))}
          </g>

          <g id={`${idPrefix}glyphs`} className="plan-glyphs">
            {floor.glyphs.map((g, i) => {
              switch (g.kind) {
                case 'stairs':
                  return (
                    <g key={i}>
                      <path className="plan-stairs" d={g.steps} />
                      <path className="plan-stairs-arrow" d={g.arrow} />
                    </g>
                  );
                case 'lift':
                  return <path key={i} className="plan-lift" d={g.d} />;
                case 'wc':
                  return (
                    <text
                      key={i}
                      className="plan-label plan-label--sign"
                      x={g.x}
                      y={g.y}
                      fontSize={Math.min(6, g.size / 4)}
                      transform={`rotate(90 ${g.x} ${g.y})`}
                    >
                      WC
                    </text>
                  );
                default:
                  return (
                    <rect
                      key={i}
                      className={g.kind === 'shaft' ? 'plan-shaft' : 'plan-plant'}
                      x={g.x}
                      y={g.y}
                      width={g.w}
                      height={g.h}
                      rx={g.kind === 'shaft' ? 7 : 0}
                      fill={`url(#${idPrefix}plant)`}
                    />
                  );
              }
            })}
          </g>

          <SpaceLabels spaces={floor.spaces} idPrefix={idPrefix} />
        </>
      ) : null}
    </g>
  );
}

export const VectorOver = memo(Over);

/* ---------------------------------------------------------------- captions */

/**
 * Rough advance width of the UI face as a fraction of the font size; space
 * names are set at the regular weight, so the estimate is the narrower one.
 */
const GLYPH = 0.6;
const SIZE_MAX = 9;
const SIZE_MIN = 4.5;

/**
 * The plate is turned −90° on screen, so a caption counter-rotated by +90° runs
 * along the space's viewBox *height*. A caption the plan turns (angle ±90)
 * runs along the width instead.
 */
function fit(name: string, s: VectorSpace): number {
  const turned = Math.abs(s.angle ?? 0) === 90;
  const across = (turned ? s.bbox.w : s.bbox.h) - 6;
  const down = (turned ? s.bbox.h : s.bbox.w) - 4;
  return Math.floor(Math.min(SIZE_MAX, across / (name.length * GLYPH), down / 2.2) * 2) / 2;
}

function shorten(name: string, max: number): string {
  if (name.length <= max) return name;
  let out = '';
  for (const w of name.split(/\s+/)) {
    if (`${out} ${w}`.trim().length > max - 1) break;
    out = `${out} ${w}`.trim();
  }
  return `${out || name.slice(0, max - 1)}…`;
}

function Labels({ spaces, idPrefix }: { spaces: VectorSpace[]; idPrefix: string }) {
  return (
    <g id={`${idPrefix}space-labels`}>
      {spaces.map((s) => {
        if (s.hideLabel) return null;
        let size = fit(s.name, s);
        let text = s.name;
        if (size < SIZE_MIN) {
          // too long for the space at a readable size: cut the name to what fits
          const turned = Math.abs(s.angle ?? 0) === 90;
          const across = (turned ? s.bbox.w : s.bbox.h) - 6;
          const max = Math.floor(across / (GLYPH * SIZE_MIN));
          if (max < 6) return null;
          text = shorten(s.name, max);
          size = fit(text, s);
          if (size < SIZE_MIN) return null;
        }
        const { x, y } = s.label;
        return (
          <text
            key={s.id}
            className="plan-label plan-label--space"
            x={x}
            y={y}
            fontSize={size}
            transform={`rotate(${90 + (s.angle ?? 0)} ${x} ${y})`}
          >
            {text}
          </text>
        );
      })}
    </g>
  );
}

const SpaceLabels = memo(Labels);
