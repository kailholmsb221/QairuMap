'use client';

import { useState } from 'react';

/** No more than this many cells flip at once; the rest cross-fade instead. */
export const MAX_FLIPPING_CELLS = 40;

let budget = MAX_FLIPPING_CELLS;
let resetScheduled = false;

function claimFlip(): boolean {
  if (!resetScheduled && typeof window !== 'undefined') {
    resetScheduled = true;
    window.setTimeout(() => {
      budget = MAX_FLIPPING_CELLS;
      resetScheduled = false;
    }, 260);
  }
  if (budget <= 0) return false;
  budget -= 1;
  return true;
}

/** Test seam: reset the shared flip budget between cases. */
export function __resetFlipBudget(): void {
  budget = MAX_FLIPPING_CELLS;
  resetScheduled = false;
}

export type SplitFlapProps = {
  value: string;
  /** Cell width in px; defaults to `--flap-w` from the metric table. */
  cellWidth?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  className?: string;
  title?: string;
};

const isNarrow = (ch: string) => ch === ':' || ch === '.';

/**
 * Fixed-width character cells on dark tiles with a horizontal seam. On a value
 * change every changed cell plays a two-half `rotateX` flip — 90 ms per half,
 * staggered 25 ms per cell.
 */
export function SplitFlap({
  value,
  cellWidth,
  height,
  fontSize,
  color,
  className,
  title,
}: SplitFlapProps) {
  const [state, setState] = useState({ value, prev: value, gen: 0 });

  if (state.value !== value) {
    setState((s) => ({ value, prev: s.value, gen: s.gen + 1 }));
  }

  const chars = [...value];
  const prevChars = [...state.prev];
  const w = cellWidth ?? 'var(--flap-w)';
  const h = height ?? 'var(--flap-h)';
  const f = fontSize ?? 'var(--flap)';

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', gap: 2, flex: 'none' }}
      title={title}
    >
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      {chars.map((ch, i) => {
        const changed = state.gen > 0 && prevChars[i] !== ch;
        const flip = changed && claimFlip();
        const cellW =
          typeof w === 'number'
            ? isNarrow(ch)
              ? Math.round(w * 0.5)
              : w
            : isNarrow(ch)
              ? `calc(${w} * 0.5)`
              : w;
        return (
          <span
            key={i}
            aria-hidden="true"
            data-flip={flip ? 'true' : undefined}
            className={`flap${flip ? ' flap-flip' : changed ? ' flap-fade' : ''}`}
            style={{
              width: cellW,
              height: h,
              fontSize: f,
              color: color ?? 'var(--text)',
            }}
          >
            <span className="flap-face">{ch}</span>
            {flip ? (
              <>
                <span
                  key={`t${state.gen}`}
                  className="flap-half flap-half-top"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  <span>{prevChars[i] ?? ' '}</span>
                </span>
                <span
                  key={`b${state.gen}`}
                  className="flap-half flap-half-bottom"
                  style={{ animationDelay: `${90 + i * 25}ms` }}
                >
                  <span>{ch}</span>
                </span>
              </>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
