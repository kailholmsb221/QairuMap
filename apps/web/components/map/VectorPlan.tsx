'use client';

import { memo } from 'react';
import { planFill } from '@/lib/plan-theme';
import { vectorScale, type VectorFloor, type VectorSpace } from '@/lib/vector-map';
import { PlanCaption } from './PlanCaption';

/**
 * Everything on a plate the schedule never touches, drawn exactly as the
 * authoring tool draws it (`FloorMap.tsx` → `floor-bg`, `rooms-service`,
 * `WallLayer`, `DoorShape`, `ZoneIcons`, `RoomLabel`), minus the editor.
 *
 * Two pieces because the rooms the API knows are drawn between them:
 * `VectorUnder` is the floor and the spaces the API does not know, `VectorOver`
 * is the line work and the captions on top. Both are memoised — a 1 Hz tick or
 * a phase change must never re-render them.
 */

const S = vectorScale;

export type VectorUnderProps = {
  floor: VectorFloor;
  idPrefix: string;
  /** Spaces to point at (a search hit); everything else dims when set. */
  highlight?: ReadonlySet<string>;
  dimmed?: boolean;
};

function Under({ floor, idPrefix, highlight, dimmed }: VectorUnderProps) {
  const hl = highlight ?? new Set<string>();
  return (
    <g id={`${idPrefix}plan`} pointerEvents="none">
      <defs>
        <pattern
          id={`${idPrefix}hatch`}
          width={6 * S}
          height={6 * S}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={6 * S} stroke="#6b8cae" strokeWidth={1 * S} opacity="0.5" />
        </pattern>
        <filter id={`${idPrefix}glow`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={3 * S} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 1. the façade and the floor */}
      <g className="floor-bg">
        <path d={floor.outline} className="floor-outline-glow" filter={`url(#${idPrefix}glow)`} />
        <path id={`${idPrefix}outline`} d={floor.outline} className="floor-outline-fill" />
      </g>

      {/* 3. the spaces the API does not know */}
      <g id={`${idPrefix}spaces`} className="rooms rooms-service">
        {floor.spaces.map((s) => {
          const isHl = hl.has(s.id);
          const cls = ['room', isHl ? 'is-selected' : '', dimmed && !isHl ? 'is-dimmed' : ''].filter(Boolean).join(' ');
          return (
            <path
              key={s.id}
              className={cls}
              fill={planFill(s)}
              data-space={s.id}
              data-space-type={s.type}
              data-highlighted={isHl || undefined}
              d={s.path}
            />
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
  highlight?: ReadonlySet<string>;
};

function Over({ floor, idPrefix, detail, highlight }: VectorOverProps) {
  const hl = highlight ?? new Set<string>();
  return (
    <g id={`${idPrefix}plan-lines`} pointerEvents="none" aria-hidden="true">
      {/* 4. walls, each exactly once, interior first */}
      <g id={`${idPrefix}walls`} className="walls">
        <g className="walls-interior">
          {floor.walls.map((w, i) =>
            w.exterior ? null : (
              <path key={i} className={w.virtual ? 'wall wall-interior wall-virtual' : 'wall wall-interior'} d={w.d} />
            ),
          )}
        </g>
        <g className="walls-exterior">
          {floor.walls.map((w, i) =>
            w.exterior ? (
              <path key={i} className={w.virtual ? 'wall wall-exterior wall-virtual' : 'wall wall-exterior'} d={w.d} />
            ) : null,
          )}
        </g>
      </g>

      {detail ? (
        <>
          {/* 5. doors: the opening cut into the wall, the leaf and its swing */}
          <g id={`${idPrefix}doors`} className="doors">
            {floor.doors.map((d, i) => (
              <g key={i} className="door">
                <path className="door-opening" d={d.opening} />
                {d.leaves.map((leaf, j) => (
                  <path key={j} className="door-leaf" d={leaf} />
                ))}
              </g>
            ))}
          </g>

          {/* 6. stairs, lifts, restrooms, plant */}
          <g id={`${idPrefix}glyphs`} className="zones">
            {floor.glyphs.map((g, i) => {
              switch (g.kind) {
                case 'stairs':
                  return (
                    <g key={i} className="stairs">
                      <path className="stairs-steps" d={g.steps} />
                      <path className="stairs-arrow" d={g.arrow} />
                    </g>
                  );
                case 'lift':
                  return <path key={i} className="lift" d={g.d} />;
                case 'wc':
                  return (
                    <text
                      key={i}
                      className="zone-glyph"
                      x={g.x}
                      y={g.y}
                      fontSize={Math.min(9 * S, g.size / 4)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(90 ${g.x} ${g.y})`}
                    >
                      WC
                    </text>
                  );
                default:
                  return (
                    <rect
                      key={i}
                      className={g.kind === 'shaft' ? 'zone-shaft' : 'zone-tech'}
                      x={g.x}
                      y={g.y}
                      width={g.w}
                      height={g.h}
                      rx={g.kind === 'shaft' ? 12 * S : 0}
                      fill={`url(#${idPrefix}hatch)`}
                    />
                  );
              }
            })}
          </g>

          {/* 7. a space the API does not know is captioned only while it is pointed at */}
          <SpaceCaptions spaces={floor.spaces} idPrefix={idPrefix} highlight={hl} />
        </>
      ) : null}
    </g>
  );
}

export const VectorOver = memo(Over);

function Captions({
  spaces,
  idPrefix,
  highlight,
}: {
  spaces: VectorSpace[];
  idPrefix: string;
  highlight: ReadonlySet<string>;
}) {
  return (
    <g id={`${idPrefix}space-labels`} className="labels">
      {spaces.map((s) =>
        highlight.has(s.id) ? (
          <PlanCaption key={s.id} text={s.name} bbox={s.bbox} label={s.label} look={s} />
        ) : null,
      )}
    </g>
  );
}

const SpaceCaptions = memo(Captions);
