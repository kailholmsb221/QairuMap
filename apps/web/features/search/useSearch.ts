'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SearchResult } from '@campuslive/contracts';
import { api } from '@/lib/api/client';
import { useUiStore, type Highlight } from '@/lib/store/uiStore';
import { isMapSearchableRoom } from '@/lib/room-interaction';

const EMPTY: SearchResult = { teachers: [], groups: [], rooms: [], courses: [] };

/** Debounced `/search?q=` with the highlight helper the palette commits with. */
export function useSearch(debounceMs = 180) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), debounceMs);
    return () => clearTimeout(id);
  }, [query, debounceMs]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced, 8),
    enabled: debounced.length >= 1,
    staleTime: 30_000,
  });

  const raw = debounced.length >= 1 ? (data ?? EMPTY) : EMPTY;
  const results = { ...raw, rooms: raw.rooms.filter((room) => isMapSearchableRoom(room.code)) };
  const total =
    results.teachers.length + results.groups.length + results.rooms.length + results.courses.length;

  return {
    query,
    setQuery,
    debounced,
    results,
    total,
    loading: isFetching && debounced.length >= 1,
  };
}

/** Commit a hit: highlight it on the map and filter the board to it. */
export function applyHighlight(h: Highlight): void {
  const ui = useUiStore.getState();
  ui.setHighlight(h);
  ui.setSearchOpen(false);
}

export function clearHighlight(): void {
  useUiStore.getState().setHighlight(null);
}
