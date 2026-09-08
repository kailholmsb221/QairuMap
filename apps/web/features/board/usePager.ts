'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type Pager<T> = {
  page: number;
  pages: number;
  items: T[];
};

/**
 * Airport-board pagination: rotate to the next page every `intervalMs`, wrapping
 * around. Paused while the user hovers the board (`paused`), and inert while
 * everything fits on one page.
 */
export function usePager<T>(
  items: readonly T[],
  perPage: number,
  intervalMs = 8000,
  paused = false,
): Pager<T> {
  const size = Math.max(0, perPage);
  const pages = size > 0 ? Math.max(1, Math.ceil(items.length / size)) : 1;
  const [page, setPage] = useState(0);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  // A shrinking list must never leave the pager on a page that no longer exists.
  useEffect(() => {
    setPage((p) => (p >= pages ? 0 : p));
  }, [pages]);

  useEffect(() => {
    if (paused || pages <= 1 || intervalMs <= 0) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pagesRef.current), intervalMs);
    return () => clearInterval(id);
  }, [paused, pages, intervalMs]);

  const current = Math.min(page, pages - 1);
  const visible = useMemo(
    () => (size > 0 ? items.slice(current * size, current * size + size) : []),
    [items, current, size],
  );

  return { page: current, pages, items: visible as T[] };
}
