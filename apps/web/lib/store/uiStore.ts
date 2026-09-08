'use client';

import type { LessonType } from '@campuslive/contracts';
import { createBoundStore } from './create';

export type Locale = 'ru' | 'kk' | 'en';
export type HighlightKind = 'group' | 'teacher' | 'room' | 'course';
export type Highlight = { kind: HighlightKind; id: string; label?: string } | null;

export type UiState = {
  focusedFloor: number | null;
  selectedRoomCode: string | null;
  hoveredRoomCode: string | null;
  highlight: Highlight;
  filters: { floors: number[]; lessonTypes: LessonType[] };
  locale: Locale;
  reducedMotion: boolean;
  searchOpen: boolean;
  adminOpen: boolean;
  travelOpen: boolean;
  /** Below 1024 px the map and the board become tabs. */
  compactTab: 'map' | 'board';

  setFocusedFloor: (n: number | null) => void;
  selectRoom: (code: string | null) => void;
  hoverRoom: (code: string | null) => void;
  setHighlight: (h: Highlight) => void;
  setFilters: (f: Partial<UiState['filters']>) => void;
  setLocale: (l: Locale) => void;
  setReducedMotion: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setAdminOpen: (v: boolean) => void;
  setTravelOpen: (v: boolean) => void;
  setCompactTab: (t: 'map' | 'board') => void;
  showOnMap: (floor: number, code: string) => void;
};

export const useUiStore = createBoundStore<UiState>((set) => ({
  focusedFloor: null,
  selectedRoomCode: null,
  hoveredRoomCode: null,
  highlight: null,
  filters: { floors: [], lessonTypes: [] },
  locale: 'en',
  reducedMotion: false,
  searchOpen: false,
  adminOpen: false,
  travelOpen: false,
  compactTab: 'map',

  setFocusedFloor: (focusedFloor) =>
    set((s) => ({
      focusedFloor,
      // leaving focus drops the selection with it
      selectedRoomCode: focusedFloor === null ? null : s.selectedRoomCode,
    })),
  selectRoom: (selectedRoomCode) => set({ selectedRoomCode }),
  hoverRoom: (hoveredRoomCode) => set({ hoveredRoomCode }),
  setHighlight: (highlight) => set({ highlight }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setLocale: (locale) => set({ locale }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  setTravelOpen: (travelOpen) => set({ travelOpen }),
  setCompactTab: (compactTab) => set({ compactTab }),
  showOnMap: (floor, code) => set({ focusedFloor: floor, selectedRoomCode: code }),
}));

export const selectFocusedFloor = (s: UiState) => s.focusedFloor;
export const selectSelectedRoom = (s: UiState) => s.selectedRoomCode;
export const selectHighlight = (s: UiState) => s.highlight;
