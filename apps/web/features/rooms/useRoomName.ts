'use client';

import { useCallback } from 'react';
import { useMessages } from 'next-intl';

/**
 * The display name of a room in the reader's language.
 *
 * `rooms.name` in the database is the university's own Kazakh wording — one
 * string, no locale — because the seed writes the room programme of
 * `docs/BUILDING.md` verbatim. The translations live in `messages/{ru,kk,en}.json`
 * under `rooms.<CODE>`, keyed by the same codes, so switching language renames
 * every space on the plan: Кітапхана · Библиотека · Library.
 *
 * A code with no translation falls back to whatever the API sent, so a room
 * added to the building shows up under its seeded name until it is translated.
 */
export function useRoomName(): (code: string, fallback?: string) => string {
  const messages = useMessages() as { rooms?: Record<string, string> } | undefined;
  const rooms = messages?.rooms;
  return useCallback(
    (code: string, fallback = '') => rooms?.[code] ?? fallback,
    [rooms],
  );
}
