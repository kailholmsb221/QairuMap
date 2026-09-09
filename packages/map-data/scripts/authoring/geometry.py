"""
From a pixel contour to a drawn wall.

A trace is not geometry: every wall comes back as a staircase of pixels that
wobbles a degree either side of true. Straightening it happens twice.

`rectify` works on one room, **in its own frame** — the building is an arc, so
its rooms fan out around the curve and there is no single axis to snap the whole
plate to. A room here is a rectangle that happens to be rotated, so the polygon
is turned onto the axis its own walls run at, every edge is forced to the nearer
of the two axes, runs of edges that end up parallel are merged, and the ring is
rebuilt from those lines. What comes out is rectilinear: straight walls, square
corners, no stray diagonals.

`consolidate` then works on the whole floor at once, because a wall is shared.
Every edge of every space becomes a line; lines that are nearly parallel and
nearly coincident are one wall the trace saw twice, and are replaced by their
common average. That is what makes a column of offices line up, gives two
neighbours exactly one wall between them, and makes rooms the plan draws the
same width come out the same width.

The façade is not snapped at all — it really is curved — only resampled and
low-pass filtered into a smooth ring. Rooms on it are rectified like any other
and then clipped back to it, so they keep straight party walls and a curved
outer edge, exactly as the plan draws them.
"""
from __future__ import annotations

import math
import numpy as np
from shapely.geometry import LineString, Point, Polygon

AREA_GUARD = 0.18       # reject a straightening that moves this much area
MOVE_GUARD = 0.12       # ... or that throws a vertex this far, relative to the room


# ---------------------------------------------------------------- basics ----

def area(poly: np.ndarray) -> float:
    x, y = poly[:, 0], poly[:, 1]
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2)


def _rdp(pts: np.ndarray, eps: float) -> np.ndarray:
    """Douglas–Peucker on an open run."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = math.hypot(*ab)
    if n < 1e-9:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(np.cross(ab, pts - a)) / n
    i = int(d.argmax())
    if d[i] <= eps:
        return np.array([a, b])
    return np.vstack([_rdp(pts[:i + 1], eps)[:-1], _rdp(pts[i:], eps)])


def simplify(ring: np.ndarray, eps: float) -> np.ndarray:
    """Douglas–Peucker on a closed ring, anchored at its two extreme points."""
    if len(ring) < 4:
        return ring
    i = int(np.argmax(ring[:, 0] + ring[:, 1]))
    ring = np.roll(ring, -i, axis=0)
    j = int(np.argmin(ring[:, 0] + ring[:, 1]))
    a = _rdp(ring[:j + 1], eps)
    b = _rdp(np.vstack([ring[j:], ring[:1]]), eps)
    out = np.vstack([a[:-1], b[:-1]])
    return dedupe(out)


def dedupe(poly: np.ndarray, tol: float = 0.35) -> np.ndarray:
    keep = [poly[0]]
    for p in poly[1:]:
        if math.hypot(*(p - keep[-1])) > tol:
            keep.append(p)
    while len(keep) > 3 and math.hypot(*(keep[0] - keep[-1])) <= tol:
        keep.pop()
    return np.array(keep)


def drop_collinear(poly: np.ndarray, tol: float = 0.45) -> np.ndarray:
    n = len(poly)
    if n < 4:
        return poly
    keep = []
    for i in range(n):
        a, b, c = poly[i - 1], poly[i], poly[(i + 1) % n]
        ac = c - a
        L = math.hypot(*ac)
        d = abs(np.cross(ac, b - a)) / L if L > 1e-9 else 0.0
        if d > tol:
            keep.append(b)
    return np.array(keep) if len(keep) >= 3 else poly


# ------------------------------------------------------------ straighten ----

def _axis(poly: np.ndarray) -> float:
    """The angle, in [0, 90), that most of this room's wall length runs at."""
    d = np.roll(poly, -1, axis=0) - poly
    L = np.hypot(d[:, 0], d[:, 1])
    ang = (np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 90.0) * 4.0   # 90° -> full turn
    s = float(np.sum(L * np.sin(np.radians(ang))))
    c = float(np.sum(L * np.cos(np.radians(ang))))
    return (math.degrees(math.atan2(s, c)) / 4.0) % 90.0


def axis_of(poly: np.ndarray) -> float:
    """The angle a polygon's own walls run at — see `_axis`."""
    return _axis(poly)


def _rot(deg: float) -> np.ndarray:
    t = math.radians(deg)
    return np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])


def _moved(a: np.ndarray, b: np.ndarray) -> float:
    """The farthest either wall line strays from the other — a Hausdorff distance.

    Measured point-to-*wall*, not point-to-corner: straightening replaces the
    dozen vertices a trace leaves along one wall with the two ends of it, and
    comparing corner to corner would read that as a huge move.
    """
    try:
        la = LineString(np.vstack([a, a[:1]]))
        lb = LineString(np.vstack([b, b[:1]]))
        return float(max(max(lb.distance(Point(*q)) for q in a),
                         max(la.distance(Point(*q)) for q in b)))
    except Exception:
        return float('inf')


def _rect_ring(p: np.ndarray, min_edge: float, jog: float) -> np.ndarray | None:
    """A rectilinear ring through `p`, which is already near axis-aligned.

    Every edge is forced to whichever axis it is closer to, runs that end up
    parallel are merged into one wall at their length-weighted position, and the
    corners fall out as the intersections. Walls shorter than `min_edge` are
    swallowed by their neighbours rather than left as a jag, and a step shallower
    than `jog` between two walls that face the same way is flattened — that is a
    serration the trace left along a soft edge, not a notch the plan drew.
    """
    n = len(p)
    if n < 4:
        return None
    # horizontal (constant y) or vertical (constant x), per edge
    d = np.roll(p, -1, axis=0) - p
    horiz = np.abs(d[:, 0]) >= np.abs(d[:, 1])
    if horiz.all() or (~horiz).all():
        return None

    start = next((i for i in range(n) if horiz[i] != horiz[i - 1]), None)
    if start is None:
        return None
    runs: list[tuple[bool, list[int]]] = []
    for k in range(n):
        i = (start + k) % n
        if not runs or bool(horiz[i]) != runs[-1][0]:
            runs.append((bool(horiz[i]), [i]))
        else:
            runs[-1][1].append(i)
    if len(runs) < 4 or len(runs) % 2:                      # must alternate H, V, H, V
        return None

    walls = []                                              # [is_horizontal, position, length]
    for is_h, idx in runs:
        w = np.maximum(np.array([np.hypot(*d[i]) for i in idx]), 1e-6)
        mid = np.array([(p[i] + p[(i + 1) % n]) / 2 for i in idx])
        pos = float(np.average(mid[:, 1] if is_h else mid[:, 0], weights=w))
        walls.append([is_h, pos, float(w.sum())])

    # a wall shorter than min_edge is a jag: drop it and merge its neighbours
    for _ in range(len(walls)):
        if len(walls) <= 4:
            break
        spans = []
        for i, (is_h, pos, _w) in enumerate(walls):
            prev, nxt = walls[i - 1], walls[(i + 1) % len(walls)]
            spans.append(abs(nxt[1] - prev[1]))
        i = int(np.argmin(spans))
        if spans[i] >= min_edge:
            break
        j, k = (i - 1) % len(walls), (i + 1) % len(walls)
        tot = walls[j][2] + walls[k][2]
        walls[j][1] = (walls[j][1] * walls[j][2] + walls[k][1] * walls[k][2]) / max(tot, 1e-6)
        walls[j][2] = tot
        for m in sorted({i, k}, reverse=True):
            walls.pop(m)

    # two walls that face the same way a hair apart are one wall the trace saw
    # step: flatten the jog between them. A real notch is deep, a serration is not.
    for _ in range(len(walls)):
        m = len(walls)
        if m <= 4:
            break
        jogs = [abs(walls[i][1] - walls[(i + 2) % m][1]) for i in range(m)]
        i = int(np.argmin(jogs))
        if jogs[i] >= jog:
            break
        a, b = walls[i], walls[(i + 2) % m]
        tot = a[2] + b[2]
        a[1] = (a[1] * a[2] + b[1] * b[2]) / max(tot, 1e-6)
        a[2] = tot
        for k in sorted({(i + 1) % m, (i + 2) % m}, reverse=True):
            walls.pop(k)

    if len(walls) < 4 or len(walls) % 2:
        return None
    out = []
    for i, (is_h, pos, _w) in enumerate(walls):
        nxt = walls[(i + 1) % len(walls)]
        out.append([pos if not is_h else nxt[1], pos if is_h else nxt[1]])
    ring = np.array(out, dtype=np.float64)
    return ring if len(ring) >= 4 and area(ring) > 1e-6 else None


def clip_to(poly: np.ndarray, hull) -> np.ndarray:
    """Hold a polygon inside the smoothed façade it was traced against."""
    if hull is None:
        return poly
    try:
        g = Polygon(poly).buffer(0)
        if hull.contains(g):
            return poly
        s = g.intersection(hull)
        if s.is_empty:
            return poly
        if s.geom_type != 'Polygon':
            s = max(s.geoms, key=lambda q: q.area)
        out = drop_collinear(dedupe(np.array(s.exterior.coords)[:-1], 0.2), 0.2)
        return out if len(out) >= 3 else poly
    except Exception:
        return poly


def _keeps(cand: np.ndarray, poly: np.ndarray, hull) -> bool:
    """Is `cand` still the room the trace found?

    Judged **after** clipping to the façade: a room on the outer wall is
    rectified like any other, which throws its curved edge a long way out, and
    the clip is what puts it back. Comparing before that would reject every
    perimeter room on the plate.
    """
    a, b = clip_to(cand, hull), clip_to(poly, hull)
    a0, a1 = area(b), area(a)
    if a0 <= 0 or a1 <= 0 or abs(a1 - a0) / a0 > AREA_GUARD:
        return False
    return _moved(a, b) <= MOVE_GUARD * math.sqrt(a0) + 1.2


def _soften(poly: np.ndarray, tol: float = 12.0) -> np.ndarray:
    """Straighten the walls that are near the room's axis, leave the rest alone.

    The fallback for a space the plan genuinely does not draw square — a room on
    the arc of the façade, or one with a chamfered corner.
    """
    n = len(poly)
    if n < 4:
        return poly
    base = _axis(poly)
    mids, dirs = [], []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        d = b - a
        L = math.hypot(*d)
        if L < 1e-9:
            return poly
        ang = math.degrees(math.atan2(d[1], d[0]))
        target = base + 90.0 * round((ang - base) / 90.0)
        if abs(ang - target) <= tol:
            t = math.radians(target)
            d = np.array([math.cos(t), math.sin(t)])
        else:
            d = d / L
        mids.append((a + b) / 2)
        dirs.append(d)
    out = []
    for i in range(n):
        j = (i - 1) % n
        det = dirs[j][0] * dirs[i][1] - dirs[j][1] * dirs[i][0]
        if abs(det) < 1e-7:
            out.append(poly[i])
            continue
        t = ((mids[i][0] - mids[j][0]) * dirs[i][1] - (mids[i][1] - mids[j][1]) * dirs[i][0]) / det
        out.append(mids[j] + t * dirs[j])
    return np.array(out)


def rectify(poly: np.ndarray, min_edge: float = 2.0, jog: float = 5.0, hull=None,
            axis: float | None = None) -> np.ndarray:
    """Make a room rectilinear in its own frame: straight walls, square corners.

    `axis` overrides the frame. A room's own walls say which way it runs, but a
    partition traced from an open line drawing has half its outline in common
    with a neighbour and no reliable axis of its own — it is squared to the
    room beside it instead, which is what keeps a block of them a grid.
    """
    if len(poly) < 4 or area(poly) <= 0:
        return poly
    th = _axis(poly) if axis is None else axis
    ring = _rect_ring(poly @ _rot(-th).T, min_edge, jog)
    if ring is not None:
        cand = ring @ _rot(th).T
        if _keeps(cand, poly, hull):
            return cand
    soft = _soften(poly)
    return soft if _keeps(soft, poly, hull) else poly


# ----------------------------------------------------------- consolidate ----

def _lines_of(poly: np.ndarray):
    """Every edge as its line: (normal angle in [0, 180), offset, edge length)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        d = b - a
        L = math.hypot(*d)
        if L < 1e-9:
            out.append(None)
            continue
        phi = math.degrees(math.atan2(d[0], -d[1])) % 180.0   # normal is (-dy, dx)
        t = math.radians(phi)
        out.append([phi, math.cos(t) * a[0] + math.sin(t) * a[1], L])
    return out


def consolidate(polys: dict, ang_tol: float = 4.0, dist_tol: float = 3.0, hull=None) -> dict:
    """Snap the walls of a whole floor together.

    Two edges that are nearly parallel and nearly coincident are one wall the
    trace saw twice; they are replaced by the line both of them average to. Rooms
    then share their party walls exactly, and a row of them lines up.
    """
    items = []                                   # (key, edge index, phi, c, length)
    for key, poly in polys.items():
        for i, e in enumerate(_lines_of(poly)):
            if e is not None:
                items.append([key, i, e[0], e[1], e[2]])
    if not items:
        return polys

    order = sorted(range(len(items)), key=lambda k: (items[k][2], items[k][3]))
    groups, cur = [], [order[0]]
    for k in order[1:]:
        pk, ck = items[k][2], items[k][3]
        pj, cj = items[cur[-1]][2], items[cur[-1]][3]
        if abs(pk - pj) <= ang_tol and abs(ck - cj) <= dist_tol:
            cur.append(k)
        else:
            groups.append(cur)
            cur = [k]
    groups.append(cur)

    snapped = {}
    for g in groups:
        w = np.array([items[k][4] for k in g])
        phi = float(np.average([items[k][2] for k in g], weights=w))
        c = float(np.average([items[k][3] for k in g], weights=w))
        for k in g:
            snapped[(items[k][0], items[k][1])] = (phi, c)

    out = {}
    for key, poly in polys.items():
        n = len(poly)
        lines = []
        for i in range(n):
            s = snapped.get((key, i))
            if s is None:
                a, b = poly[i], poly[(i + 1) % n]
                d = b - a
                L = math.hypot(*d) or 1.0
                nx, ny = -d[1] / L, d[0] / L
                lines.append((nx, ny, nx * a[0] + ny * a[1]))
            else:
                phi, c = s
                t = math.radians(phi)
                lines.append((math.cos(t), math.sin(t), c))
        pts = []
        for i in range(n):
            (ax, ay, ac), (bx, by, bc) = lines[i - 1], lines[i]
            det = ax * by - ay * bx
            if abs(det) < 1e-7:
                pts.append(poly[i])
            else:
                pts.append(np.array([(ac * by - bc * ay) / det, (ax * bc - bx * ac) / det]))
        cand = np.array(pts)
        a0, a1 = area(poly), area(cand)
        if a0 > 0 and a1 > 0 and abs(a1 - a0) / a0 <= AREA_GUARD and \
                _moved(cand, poly) <= MOVE_GUARD * math.sqrt(a0) + 1.2:
            out[key] = cand
        else:
            out[key] = poly
    return out


def smooth_ring(ring: np.ndarray, n: int = 260, window: int = 5) -> np.ndarray:
    """Resample a façade to `n` points and low-pass it, keeping its area."""
    d = np.hypot(*np.diff(np.vstack([ring, ring[:1]]), axis=0).T)
    s = np.concatenate([[0], np.cumsum(d)])
    if s[-1] <= 0:
        return ring
    t = np.linspace(0, s[-1], n, endpoint=False)
    r = np.vstack([ring, ring[:1]])
    out = np.column_stack([np.interp(t, s, r[:, 0]), np.interp(t, s, r[:, 1])])
    k = np.ones(window) / window
    pad = np.vstack([out[-window:], out, out[:window]])
    sm = np.column_stack([np.convolve(pad[:, 0], k, 'same'), np.convolve(pad[:, 1], k, 'same')])[window:-window]
    a0, a1 = area(out), area(sm)
    if a1 > 0:
        c = sm.mean(axis=0)
        sm = c + (sm - c) * math.sqrt(a0 / a1)
    return simplify(sm, 0.7)


def inset(poly: np.ndarray, by: float) -> np.ndarray:
    """Pull a room off the centre line of its wall so the wall reads as a line."""
    if by <= 0:
        return poly
    try:
        g = Polygon(poly).buffer(0)
        s = g.buffer(-by, join_style=2, mitre_limit=2.5)
        if s.is_empty:
            return poly
        if s.geom_type == 'MultiPolygon':
            s = max(s.geoms, key=lambda p: p.area)
        out = np.array(s.exterior.coords)[:-1]
        return out if len(out) >= 3 else poly
    except Exception:
        return poly


# ------------------------------------------------------------- transform ----

class Fit:
    """Source pixels -> the shared `viewBox 0 0 600 1000`.

    Floor 2's plan is drawn 90° clockwise from floor 1's, so it is turned back
    (`x' = H − y`, `y' = x`) before both plates are fitted into the same box.
    """

    def __init__(self, bbox, box, rotate=False, height=0):
        self.rotate, self.height = rotate, height
        x0, y0, x1, y1 = bbox
        bx, by, bw, bh = box
        self.sx = bw / (x1 - x0)
        self.sy = bh / (y1 - y0)
        self.ox, self.oy = x0, y0
        self.bx, self.by = bx, by

    def pre(self, pts: np.ndarray) -> np.ndarray:
        if not self.rotate:
            return pts
        return np.column_stack([self.height - pts[:, 1], pts[:, 0]])

    def __call__(self, pts: np.ndarray) -> np.ndarray:
        p = self.pre(np.asarray(pts, dtype=np.float64))
        return np.column_stack([self.bx + (p[:, 0] - self.ox) * self.sx,
                                self.by + (p[:, 1] - self.oy) * self.sy])


def path_of(poly: np.ndarray) -> str:
    pts = ' L '.join(f'{round(float(x), 1):g} {round(float(y), 1):g}' for x, y in poly)
    return f'M {pts} Z'
