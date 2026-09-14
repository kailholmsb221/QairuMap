import type { RoomDisplayPhase } from '@/features/board/selectors';
import type { SpaceType, VectorLook } from '@/lib/vector-map';

/**
 * The look of the vector plans, lifted verbatim from the authoring tool's
 * `src/styles/theme.ts` and `globals.css` (`building-vector-map`). The plan is
 * drawn dark in both themes — it is one design, not a themed component.
 *
 * Everything here is a plate-unit or a colour; the plan's pixel sizes are
 * converted at `PX` (the authoring tool showed 1600 plan units across ~1300 px,
 * the focused plate shows 600 across ~800 — the same ~0.8 px per unit, so a
 * 1 px line there is 1 unit here, before the 0.62 plan→plate scale).
 */

export type PlanStatus = 'free' | 'busy' | 'ending' | 'soon' | 'service';

export const STATUS_COLORS: Record<PlanStatus, string> = {
  free: '#2d6fd6',
  busy: '#1f8f7d',
  ending: '#c9651c',
  soon: '#c99a1c',
  service: '#3b4b60',
};

export const TYPE_COLORS: Partial<Record<SpaceType, string>> = {
  corridor: '#172432',
  wc: '#2b4766',
  stairs: '#293a51',
  lift: '#2f4059',
  tech: '#2a3443',
};

export const UI = {
  appBg: '#0d1520',
  mapBg: '#111c29',
  floorBg: '#15233299',
  outline: '#4fd1ff',
  wall: '#9cd8f5',
  wallInner: '#7fc3e6',
  text: '#e6f1fb',
  textMuted: '#9fb3c8',
  selection: '#ffffff',
} as const;

/** The API phase as the plan's status vocabulary. */
export function phaseStatus(phase: RoomDisplayPhase): PlanStatus {
  switch (phase) {
    case 'live':
    case 'delayed':
      return 'busy';
    case 'ending':
    case 'conflict':
      return 'ending';
    case 'soon':
      return 'soon';
    default:
      return 'free';
  }
}

/**
 * The plan's `roomFill()`: circulation and plant by kind, everything else by
 * status. Only a room the building's own list numbers carries a status — a
 * teaching room its live phase, an office or a facility "free" (blue),
 * administration grey; every space the list does not know is a service area,
 * so the plate reads the way the photographed plates did: numbered rooms in
 * colour, the rest quiet.
 */
export function planFill(look: VectorLook, status?: PlanStatus): string {
  const byType = TYPE_COLORS[look.type];
  if (byType) return byType;
  return STATUS_COLORS[status ?? 'service'];
}

/** The status a room the API knows is painted with. */
export function roomStatus(room: { type: string; schedulable: boolean }, phase: RoomDisplayPhase): PlanStatus {
  if (room.type === 'admin') return 'service';
  return room.schedulable ? phaseStatus(phase) : 'free';
}
