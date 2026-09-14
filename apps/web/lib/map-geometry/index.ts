/**
 * The projection maths of the 2.5D scene, ported from `docs/design/src/ui.mjs`
 * (`projector()`, `explodedScene()`, `focusScene()`).
 *
 * Coordinates come only from `@campuslive/contracts` / `@campuslive/map-data` —
 * nothing here hard-codes a room.
 */

export type Point2 = [number, number];

/**
 * Sample an SVG path into a polygon. Absolute `M`/`L`/`Q`/`C`/`A`/`Z` only —
 * what `svg2map` and `vector2map` emit (the vector plans draw the curved façade
 * as real arcs).
 */
export function samplePath(d: string, seg = 28): Point2[] {
  const tok = d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const pts: Point2[] = [];
  if (!tok) return pts;
  let i = 0;
  let cur: Point2 = [0, 0];
  const num = () => parseFloat(tok[i++] as string);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') {
      cur = [num(), num()];
      pts.push(cur);
    } else if (c === 'Q') {
      const p0 = cur;
      const c1: Point2 = [num(), num()];
      const p1: Point2 = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const u = 1 - t;
        pts.push([
          u * u * p0[0] + 2 * u * t * c1[0] + t * t * p1[0],
          u * u * p0[1] + 2 * u * t * c1[1] + t * t * p1[1],
        ]);
      }
      cur = p1;
    } else if (c === 'C') {
      const p0 = cur;
      const c1: Point2 = [num(), num()];
      const c2: Point2 = [num(), num()];
      const p1: Point2 = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
        ]);
      }
      cur = p1;
    } else if (c === 'A') {
      const p0 = cur;
      const rx = Math.abs(num());
      const ry = Math.abs(num());
      const phi = rad(num());
      const large = num() !== 0;
      const sweep = num() !== 0;
      const p1: Point2 = [num(), num()];
      pts.push(...sampleArc(p0, p1, rx, ry, phi, large, sweep, seg));
      cur = p1;
    }
  }
  if (pts.length > 1) {
    const a = pts[0] as Point2;
    const b = pts[pts.length - 1] as Point2;
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
  }
  return pts;
}

const rad = (a: number) => (a * Math.PI) / 180;

/**
 * The points of an SVG elliptical arc after its start point, by the endpoint →
 * centre conversion of the SVG spec (implementation notes, §B.2.4), radii
 * scaled up when the endpoints are too far apart for them.
 */
function sampleArc(
  p0: Point2,
  p1: Point2,
  rx: number,
  ry: number,
  phi: number,
  large: boolean,
  sweep: boolean,
  seg: number,
): Point2[] {
  if (rx === 0 || ry === 0) return [p1];
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cosP * dx + sinP * dy;
  const y1 = -sinP * dx + cosP * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cosP * cx1 - sinP * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sinP * cx1 + cosP * cy1 + (p0[1] + p1[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    return sign * Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))));
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: Point2[] = [];
  for (let k = 1; k <= seg; k++) {
    const t = theta1 + (delta * k) / seg;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cosP * ex - sinP * ey + cx, sinP * ex + cosP * ey + cy]);
  }
  out[out.length - 1] = p1;
  return out;
}

export type ProjectorOptions = {
  /** Scene rotation, degrees. */
  rx?: number;
  rz?: number;
  /** Perspective distance, px. */
  d?: number;
  /** Vertical gap between plates, px. */
  dz?: number;
  /** How many plates the stack holds; it is centred on z = 0. */
  floorCount?: number;
};

export const EXPLODED_RX = 58;
export const EXPLODED_RZ = -38;
export const PERSPECTIVE = 2200;
export const PLATE_GAP = 118;
export const DEFAULT_FLOOR_COUNT = 2;

/**
 * The z of plate `floorIdx` in a stack of `floorCount` plates, centred on 0 —
 * so two plates sit at ∓½ gap exactly where four sat at ∓½ and ∓1½.
 * `Scene` translates the real DOM plates by the same value.
 */
export function plateZ(floorIdx: number, floorCount: number, dz = PLATE_GAP): number {
  return (floorIdx - (floorCount - 1) / 2) * dz;
}

/**
 * Project a plan point on floor `floorIdx` (0-based) to stage coordinates,
 * relative to the stage centre. Returns `[x, y, perspectiveScale]`.
 */
export function projector(k: number, tx: number, ty: number, opts: ProjectorOptions = {}) {
  const rx = rad(opts.rx ?? EXPLODED_RX);
  const rz = rad(opts.rz ?? EXPLODED_RZ);
  const D = opts.d ?? PERSPECTIVE;
  const dz = opts.dz ?? PLATE_GAP;
  const n = opts.floorCount ?? DEFAULT_FLOOR_COUNT;
  return (x: number, y: number, floorIdx: number): [number, number, number] => {
    const lx = (x - 300) * k;
    const ly = (y - 500) * k;
    const z = plateZ(floorIdx, n, dz);
    const x1 = lx * Math.cos(rz) - ly * Math.sin(rz);
    const y1 = lx * Math.sin(rz) + ly * Math.cos(rz);
    const y2 = y1 * Math.cos(rx) - z * Math.sin(rx);
    const z2 = y1 * Math.sin(rx) + z * Math.cos(rx);
    const X = x1 + tx;
    const Y = y2 + ty;
    const s = D / (D - z2);
    return [X * s, Y * s, s];
  };
}

export type ExplodedFit = {
  /** Plan-unit → px scale of one plate. */
  k: number;
  tx: number;
  ty: number;
  /** Plate size in px (`600·k × 1000·k`). */
  width: number;
  height: number;
  project: (x: number, y: number, floorIdx: number) => [number, number, number];
};

/**
 * Room kept free on the east side of the stack for the `F2 · 7 busy` labels that
 * hang off it. With four thin plates the fit was height-bound and the labels had
 * room by accident; with two it is width-bound, so the reserve is explicit.
 */
export const LABEL_RESERVE = 132;

/**
 * The fit-to-stage loop of `explodedScene()`: four refinement passes that scale
 * and centre the whole stack inside the stage.
 */
export function fitExploded(
  outline: Point2[],
  floorCount: number,
  stageW: number,
  stageH: number,
  opts: ProjectorOptions & {
    margin?: { x: number; y: number };
    shiftY?: number;
    /** Extra width kept clear to the east of the stack, for the floor labels. */
    reserveRight?: number;
  } = {},
): ExplodedFit {
  const margin = opts.margin ?? {
    x: Math.round(stageW * 0.084),
    y: Math.round(stageH * 0.07),
  };
  const reserveRight = opts.reserveRight ?? LABEL_RESERVE;
  const shiftY = opts.shiftY ?? 0;
  const projOpts: ProjectorOptions = { ...opts, floorCount };
  let k = 0.9;
  let tx = 0;
  let ty = 0;

  for (let it = 0; it < 4; it++) {
    const P = projector(k, tx, ty, projOpts);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let f = 0; f < floorCount; f++) {
      for (const [x, y] of outline) {
        const [X, Y] = P(x, y, f);
        if (X < x0) x0 = X;
        if (Y < y0) y0 = Y;
        if (X > x1) x1 = X;
        if (Y > y1) y1 = Y;
      }
    }
    const w = x1 - x0;
    const h = y1 - y0;
    if (!Number.isFinite(w) || w <= 0 || h <= 0) break;
    const fit = Math.min(
      (stageW - 2 * margin.x - reserveRight) / w,
      (stageH - 2 * margin.y) / h,
    );
    k *= fit;
    // centre the stack in what is left once the label gutter is taken off the east
    tx -= (x0 + x1) / 2 + reserveRight / 2;
    ty -= (y0 + y1) / 2 - shiftY;
  }

  return {
    k,
    tx,
    ty,
    width: 600 * k,
    height: 1000 * k,
    project: projector(k, tx, ty, projOpts),
  };
}

/** The east-most projected point of a plate — where the `F2 · 9 busy` label hangs. */
export function eastMost(
  outline: Point2[],
  project: (x: number, y: number, f: number) => [number, number, number],
  floorIdx: number,
): [number, number] {
  let best: [number, number, number] | null = null;
  for (const [x, y] of outline) {
    const p = project(x, y, floorIdx);
    if (!best || p[0] > best[0]) best = p;
  }
  return best ? [best[0], best[1]] : [0, 0];
}

/* -------------------------------------------------------------- focus view */

export const FOCUS_MARGIN = 34;

export type FocusFit = {
  /** Plan-unit → px scale of the flat plate. */
  s: number;
  cx: number;
  cy: number;
  toScreen: (x: number, y: number) => [number, number];
};

/**
 * `focusScene()`: the plate lies flat, turned −90° (north to the left, the curved
 * west façade at the bottom), scaled to fill the stage.
 */
export function fitFocus(stageW: number, stageH: number): FocusFit {
  const s = Math.min(
    (stageW - 2 * FOCUS_MARGIN) / 1000,
    (stageH - 2 * FOCUS_MARGIN - 24) / 600,
  );
  const cx = stageW / 2;
  const cy = stageH / 2 - 4;
  return {
    s,
    cx,
    cy,
    toScreen: (x, y) => [cx + (y - 500) * s, cy - (x - 300) * s],
  };
}

