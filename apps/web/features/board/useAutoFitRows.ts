'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * How many `rowHeight`-tall rows fit in the observed element, via `ResizeObserver`.
 * The board never scrolls: what does not fit is paginated by {@link usePager}.
 */
export function useAutoFitRows(
  ref: RefObject<HTMLElement | null>,
  rowHeight: number,
  min = 1,
  /** Chrome inside the observed box that is not rows (headers, page dots, gaps). */
  offset = 0,
): number {
  const [rows, setRows] = useState(min);

  useEffect(() => {
    const el = ref.current;
    if (!el || rowHeight <= 0) return;

    const measure = (height: number) => {
      const fit = Math.floor((height - offset) / rowHeight);
      setRows(Math.max(min, Number.isFinite(fit) ? fit : min));
    };

    measure(el.getBoundingClientRect().height);

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentRect?.height ?? entry.target.getBoundingClientRect().height;
        measure(box);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, rowHeight, min, offset]);

  return rows;
}

/**
 * Split the rows that fit between NOW and NEXT. The design's reference split is
 * 7 : 5 at 1080p; a section that needs fewer rows hands the surplus to the other.
 */
export function splitRows(total: number, nowCount: number, nextCount: number): [number, number] {
  if (total <= 0) return [0, 0];
  if (nowCount + nextCount <= total) return [nowCount, Math.max(0, total - nowCount)];
  let now = Math.max(1, Math.round((total * 7) / 12));
  let next = total - now;
  if (nowCount < now) {
    next += now - nowCount;
    now = nowCount;
  } else if (nextCount < next) {
    now += next - nextCount;
    next = nextCount;
  }
  return [now, Math.max(0, next)];
}
