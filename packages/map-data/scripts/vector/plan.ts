/**
 * The topological floor model of the hand-digitised vector plans in `vector/`
 * (`points → walls → rooms.boundary`), ported verbatim from the authoring tool's
 * `src/types/plan.ts`. The authoring tool owns these files; this package only
 * reads them.
 */

export interface Point {
  x: number;
  y: number;
}

export type WallKind = 'line' | 'arc';

export interface Wall {
  start: string;
  end: string;
  type: WallKind;
  /** For an arc: tan(θ/4); the sign is the side the arc bulges to (clockwise from start→end when > 0). */
  bulge?: number;
  /** Façade wall — drawn heavier. */
  exterior?: boolean;
  /** Notional partition (a zone boundary with no physical wall). */
  virtual?: boolean;
}

export interface BoundaryRef {
  wallId: string;
  /** 1 — walk the wall start→end, -1 — end→start. */
  direction: 1 | -1;
}

export type SpaceType =
  | 'office'
  | 'class'
  | 'hall'
  | 'corridor'
  | 'wc'
  | 'stairs'
  | 'lift'
  | 'service'
  | 'tech'
  | 'lobby'
  | 'cafe'
  | 'storage';

export interface RoomLabelPos {
  x: number;
  y: number;
  /** Label rotation, degrees; 0 when absent. */
  angle?: number;
  /** Forced font size. */
  fontSize?: number;
}

export interface PlanRoom {
  id: string;
  number: string;
  name: string;
  type: SpaceType;
  /** The authoring tool's demo status. Ignored: live state comes from the API. */
  status: string;
  boundary: BoundaryRef[];
  label: RoomLabelPos;
  area?: number;
  planName?: string;
  hideLabel?: boolean;
}

export type DoorSwing = 'left-in' | 'left-out' | 'right-in' | 'right-out' | 'double' | 'none';

export interface Door {
  id: string;
  wallId: string;
  /** Centre of the opening along the wall, 0..1. */
  position: number;
  width: number;
  swing: DoorSwing;
}

export type SpecialZoneKind = 'stairs' | 'lift' | 'wc' | 'tech' | 'shaft';

export interface SpecialZone {
  id: string;
  kind: SpecialZoneKind;
  roomId: string;
  /** Direction of the stair flight, degrees (0 — to the right). */
  angle?: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorPlan {
  id: string;
  name: string;
  level: number;
  viewBox: ViewBox;
  points: Record<string, Point>;
  walls: Record<string, Wall>;
  rooms: PlanRoom[];
  /** The ordered façade. */
  exterior: BoundaryRef[];
  doors: Door[];
  specialZones: SpecialZone[];
}
