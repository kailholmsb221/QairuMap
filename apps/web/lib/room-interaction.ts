const PASSIVE_ROOMS = new Set(['102', '102A', 'CR', 'CINEMA', 'WC-1', 'WC-2']);
const SEARCHABLE_PASSIVE_ROOMS = new Set(['102', '102A']);

/** First-floor public facilities remain visible but have no map actions. */
export function isPassiveRoom(code: string): boolean {
  return PASSIVE_ROOMS.has(code);
}

/** Libraries may be located by search while remaining noninteractive. */
export function isMapSearchableRoom(code: string): boolean {
  return !PASSIVE_ROOMS.has(code) || SEARCHABLE_PASSIVE_ROOMS.has(code);
}
