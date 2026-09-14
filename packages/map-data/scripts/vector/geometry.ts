/**
 * Path construction for the topological plan — a port of the authoring tool's
 * `src/geometry/{bulgeToArc,buildRoomPath,doorGeometry}.ts`, unchanged except
 * for the `Room` → `PlanRoom` naming. Every function takes a plan whose points
 * are already in the coordinate space the output should be in; the transform
 * into the plate lives in `vector2map.ts`, not here.
 */

import type { BoundaryRef, Door, FloorPlan, Point, Wall } from './plan';

/* ------------------------------------------------------------------ arcs */

export interface ArcParams {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  /** Walked clockwise in screen coordinates (y down). */
  clockwise: boolean;
  largeArc: boolean;
}

/** bulge = tan(θ/4), θ the central angle; positive bulges to the right of start→end. */
export function bulgeToArc(a: Point, b: Point, bulge: number): ArcParams {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(theta / 2));
  const d = radius * Math.cos(theta / 2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const sign = bulge > 0 ? 1 : -1;
  const center = { x: mx + sign * nx * d, y: my + sign * ny * d };
  return {
    center,
    radius,
    startAngle: Math.atan2(a.y - center.y, a.x - center.x),
    endAngle: Math.atan2(b.y - center.y, b.x - center.x),
    clockwise: bulge > 0,
    largeArc: Math.abs(bulge) > 1,
  };
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** The SVG `A` command from a to b. */
export function arcSvgCommand(a: Point, b: Point, bulge: number): string {
  const { radius, largeArc, clockwise } = bulgeToArc(a, b, bulge);
  return `A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc ? 1 : 0} ${clockwise ? 1 : 0} ${fmt(b.x)} ${fmt(b.y)}`;
}

/** Interior points of the arc, for area, centroid and hit tests. */
export function sampleArc(a: Point, b: Point, bulge: number, segments = 12): Point[] {
  const { center, radius, startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const pts: Point[] = [];
  for (let i = 1; i < segments; i++) {
    const ang = startAngle + (clockwise ? 1 : -1) * theta * (i / segments);
    pts.push({ x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) });
  }
  return pts;
}

export function pointOnArc(a: Point, b: Point, bulge: number, t: number): Point {
  const { center, radius, startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
  return { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) };
}

/** Unit tangent at parameter t, pointing from a towards b. */
export function arcTangent(a: Point, b: Point, bulge: number, t: number): Point {
  const { startAngle, clockwise } = bulgeToArc(a, b, bulge);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const ang = startAngle + (clockwise ? 1 : -1) * theta * t;
  const s = clockwise ? 1 : -1;
  return { x: -Math.sin(ang) * s, y: Math.cos(ang) * s };
}

/* ------------------------------------------------------------ boundaries */

export interface ResolvedSegment {
  wallId: string;
  direction: 1 | -1;
  wall: Wall;
  from: Point;
  to: Point;
  /** bulge as seen walking in `direction`. */
  bulge: number;
}

export function resolveBoundary(plan: FloorPlan, boundary: BoundaryRef[]): ResolvedSegment[] {
  const out: ResolvedSegment[] = [];
  for (const ref of boundary) {
    const wall = plan.walls[ref.wallId];
    if (!wall) continue;
    const from = plan.points[ref.direction === 1 ? wall.start : wall.end];
    const to = plan.points[ref.direction === 1 ? wall.end : wall.start];
    if (!from || !to) continue;
    const bulge = wall.type === 'arc' ? (wall.bulge ?? 0) * ref.direction : 0;
    out.push({ wallId: ref.wallId, direction: ref.direction, wall, from, to, bulge });
  }
  return out;
}

/** A closed SVG path from a boundary; arcs are real `A` commands. */
export function buildRoomPath(plan: FloorPlan, boundary: BoundaryRef[]): string {
  const segs = resolveBoundary(plan, boundary);
  const first = segs[0];
  if (!first) return '';
  const parts: string[] = [`M ${fmt(first.from.x)} ${fmt(first.from.y)}`];
  for (const s of segs) {
    parts.push(s.bulge !== 0 ? arcSvgCommand(s.from, s.to, s.bulge) : `L ${fmt(s.to.x)} ${fmt(s.to.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** The boundary as a polygon (arcs sampled) — for bbox, centroid and hit tests. */
export function boundaryPolyline(plan: FloorPlan, boundary: BoundaryRef[], arcSegments = 10): Point[] {
  const pts: Point[] = [];
  for (const s of resolveBoundary(plan, boundary)) {
    pts.push(s.from);
    if (s.bulge !== 0) pts.push(...sampleArc(s.from, s.to, s.bulge, arcSegments));
  }
  return pts;
}

/** One wall as an open path (segment or arc). */
export function wallPath(plan: FloorPlan, wall: Wall): string {
  const a = plan.points[wall.start];
  const b = plan.points[wall.end];
  if (!a || !b) return '';
  if (wall.type === 'arc' && wall.bulge) return `M ${fmt(a.x)} ${fmt(a.y)} ${arcSvgCommand(a, b, wall.bulge)}`;
  return `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)}`;
}

export function signedArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function centroid(pts: Point[]): Point {
  const area = signedArea(pts);
  if (Math.abs(area) < 1e-9) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function bbox(pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/* ----------------------------------------------------------------- doors */

export interface DoorGeometry {
  center: Point;
  /** Unit vector along the wall. */
  along: Point;
  /** Unit normal, towards "in". */
  normal: Point;
  a: Point;
  b: Point;
}

export function doorGeometry(plan: FloorPlan, door: Door): DoorGeometry | null {
  const w = plan.walls[door.wallId];
  if (!w) return null;
  const p0 = plan.points[w.start];
  const p1 = plan.points[w.end];
  if (!p0 || !p1) return null;
  let center: Point;
  let along: Point;
  if (w.type === 'arc' && w.bulge) {
    center = pointOnArc(p0, p1, w.bulge, door.position);
    along = arcTangent(p0, p1, w.bulge, door.position);
  } else {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    along = { x: dx / len, y: dy / len };
    center = { x: p0.x + dx * door.position, y: p0.y + dy * door.position };
  }
  const normal = { x: -along.y, y: along.x };
  const h = door.width / 2;
  return {
    center,
    along,
    normal,
    a: { x: center.x - along.x * h, y: center.y - along.y * h },
    b: { x: center.x + along.x * h, y: center.y + along.y * h },
  };
}

/**
 * The door as drawn: the opening (a gap cut into the wall) and the leaf with its
 * quarter-circle swing — `DoorShape.tsx` in the authoring tool.
 */
export function doorPaths(plan: FloorPlan, door: Door): { opening: string; leaves: string[] } | null {
  const g = doorGeometry(plan, door);
  if (!g) return null;
  const { a, b, along, normal } = g;
  const dir = door.swing.endsWith('out') ? -1 : 1;
  const leaves: string[] = [];
  const leaf = (hinge: Point, sign: number, len: number) => {
    const tip = { x: hinge.x + normal.x * dir * len, y: hinge.y + normal.y * dir * len };
    const end = { x: hinge.x + along.x * sign * len, y: hinge.y + along.y * sign * len };
    const sweep = (sign === 1) === (dir === 1) ? 0 : 1;
    leaves.push(
      `M ${fmt(hinge.x)} ${fmt(hinge.y)} L ${fmt(tip.x)} ${fmt(tip.y)} A ${fmt(len)} ${fmt(len)} 0 0 ${sweep} ${fmt(end.x)} ${fmt(end.y)}`,
    );
  };
  switch (door.swing) {
    case 'left-in':
    case 'left-out':
      leaf(a, 1, door.width);
      break;
    case 'right-in':
    case 'right-out':
      leaf(b, -1, door.width);
      break;
    case 'double':
      leaf(a, 1, door.width / 2);
      leaf(b, -1, door.width / 2);
      break;
    default:
      break;
  }
  return { opening: `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)}`, leaves };
}

/* ---------------------------------------------------------------- glyphs */

/** Stair flight: treads across the direction of travel, an arrow along it (`StairShape.tsx`). */
export function stairsPaths(poly: Point[], angle: number): { steps: string; arrow: string } {
  const b = bbox(poly);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const w = (b.maxX - b.minX) * 0.7;
  const h = (b.maxY - b.minY) * 0.7;
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const vx = -uy;
  const vy = ux;
  const len = Math.abs(ux) * w + Math.abs(uy) * h;
  const wid = Math.abs(vx) * w + Math.abs(vy) * h;
  // tread pitch in plan units; the authoring tool used 9 of its (larger) units
  const step = 5.4;
  const n = Math.max(3, Math.floor(len / step));
  const lines: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    const px = cx + ux * t;
    const py = cy + uy * t;
    lines.push(
      `M ${fmt(px - (vx * wid) / 2)} ${fmt(py - (vy * wid) / 2)} L ${fmt(px + (vx * wid) / 2)} ${fmt(py + (vy * wid) / 2)}`,
    );
  }
  const ax = cx - (ux * len) / 2;
  const ay = cy - (uy * len) / 2;
  const bx = cx + (ux * len) / 2;
  const by = cy + (uy * len) / 2;
  const head = 3.6;
  const half = 2.4;
  const arrow =
    `M ${fmt(ax)} ${fmt(ay)} L ${fmt(bx)} ${fmt(by)} ` +
    `M ${fmt(bx - ux * head - vx * half)} ${fmt(by - uy * head - vy * half)} L ${fmt(bx)} ${fmt(by)} ` +
    `L ${fmt(bx - ux * head + vx * half)} ${fmt(by - uy * head + vy * half)}`;
  return { steps: lines.join(' '), arrow };
}

/** Lift shaft: an inset rectangle with both diagonals (`LiftShape.tsx`). */
export function liftPath(poly: Point[]): string {
  const b = bbox(poly);
  const inset = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.18;
  const x0 = b.minX + inset;
  const y0 = b.minY + inset;
  const x1 = b.maxX - inset;
  const y1 = b.maxY - inset;
  return (
    `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)} L ${fmt(x0)} ${fmt(y1)} Z ` +
    `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)} M ${fmt(x1)} ${fmt(y0)} L ${fmt(x0)} ${fmt(y1)}`
  );
}
