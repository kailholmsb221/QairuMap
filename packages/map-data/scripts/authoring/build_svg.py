"""
svg:author - trace `reference/floor-{1,2}.png` into `svg/floor-{1,2}.svg`.

    python scripts/authoring/build_svg.py        (pnpm --filter @campuslive/map-data run svg:author)

The SVGs are the geometry source of truth; `scripts/svg2map.ts` builds
`building-a.json` from them. Re-running this regenerates them from the plans, so
a hand edit made afterwards is overwritten - see README.md.

Both plates share `viewBox 0 0 600 1000`. Floor 2's plan is drawn 90° clockwise
from floor 1's and is turned back before the two are fitted into it, so a room
on the west façade of one sits over the room on the west façade of the other.

Nothing is written unless every code in `docs/BUILDING.md` found a home, no two
rooms of a floor overlap, and no room escapes the silhouette.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi
from shapely.geometry import Polygon

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
PKG = HERE.parent.parent
REF = str(PKG / 'reference')
SVG_DIR = PKG / 'svg'

from geometry import (  # noqa: E402
    Fit, area, axis_of, clip_to, consolidate, dedupe, drop_collinear, inset,
    path_of, rectify, simplify, smooth_ring,
)
from plan import cells, contour_of  # noqa: E402
from rooms import ANCHORS, CORE_NAMES, PROGRAMME, SHAPES  # noqa: E402

BUILDING = 'A'
VIEW = (600, 1000)
BOX = (34.0, 20.0, 532.0, 960.0)     # the target the silhouette is fitted to
MIN_SEED = {1: 1000, 2: 500}         # smallest doorway-seed the segmentation keeps, in source px
MIN_CELL = {1: 260, 2: 200}          # ... and the smallest room the sealing may have swallowed
# floor 1's plan is drawn at 1.6x the scale of floor 2's, so its doorways are wider
DOOR = {1: 47, 2: 31}
EPS = {1: 0.9, 2: 0.8}               # Douglas-Peucker tolerance, viewBox units
MIN_EDGE = 2.6                       # a wall shorter than this is a jag, not a wall
JOG = 5.5                            # ... and a step shallower than this is a serration
INSET = {1: 1.0, 2: 0.9}             # half the wall the plan draws between rooms
SMOOTH = {1: 11, 2: 9}                # files the caption saw-teeth off a room edge, in source px
MIN_SIDE = 8.0
DETAIL_MIN = 14.0                    # smallest structure worth drawing, in square units


def esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;')
             .replace('>', '&gt;').replace('"', '&quot;'))


# ------------------------------------------------------------------ trace ----

def trace(n: int):
    res = cells(REF, n, MIN_SEED[n], DOOR[n], MIN_CELL[n])
    lab, solid = res['labels'], res['solid']
    h, w = solid.shape
    ys, xs = np.where(solid)
    bbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    if n == 2:                                    # turn the plan back upright
        bbox = (h - 1 - ys.max(), xs.min(), h - 1 - ys.min(), xs.max() + 1)
    fit = Fit(bbox, BOX, rotate=(n == 2), height=h)

    outline = smooth_ring(fit(contour_of(solid)))
    hull = Polygon(outline).buffer(0)

    def poly_of(mask, eps, axis=None):
        """One cell as a rectilinear polygon on the centre line of its walls."""
        ring = contour_of(mask, SMOOTH[n])
        if len(ring) < 3:
            return None
        p = drop_collinear(dedupe(simplify(fit(ring), eps)))
        return rectify(p, MIN_EDGE, JOG, hull, axis) if len(p) >= 3 else None

    claimed = {}
    for code, pts in ANCHORS[n].items():
        ids = []
        for x, y in pts:
            i = int(lab[int(y), int(x)])
            if i == 0:
                raise SystemExit(f'floor {n} {code}: anchor ({x}, {y}) is off the plate')
            if i in ids:
                continue
            ids.append(i)
        claimed[code] = ids

    seen = {}
    for code, ids in claimed.items():
        for i in ids:
            if i in seen:
                raise SystemExit(f'floor {n}: cell {i} claimed by both {seen[i]} and {code}')
            seen[i] = code

    raw = {}
    for code, ids in claimed.items():
        m = np.isin(lab, ids)
        if len(ids) > 1 and ndi.label(m)[1] > 1:
            raise SystemExit(f'floor {n} {code}: its {len(ids)} pieces do not touch')
        p = poly_of(m, EPS[n])
        if p is None:
            raise SystemExit(f'floor {n} {code}: traced to nothing')
        raw[code] = p

    # everything the plan draws that carries no code: the circulation, the stub
    # partitions, the service closets, the line work of the south-east block
    rest = [i for i in range(1, res['count'] + 1) if i not in seen and (lab == i).any()]
    centres = np.array([p.mean(axis=0) for p in raw.values()])
    axes = np.array([axis_of(p) for p in raw.values()])
    for i in rest:
        m = lab == i
        ys2, xs2 = np.where(m)
        c = fit(np.array([[xs2.mean(), ys2.mean()]]))[0]
        near = int(np.argmin(np.hypot(*(centres - c).T)))
        p = poly_of(m, EPS[n], float(axes[near]))
        if p is not None and area(p) >= DETAIL_MIN:
            raw[f'#{i}'] = p

    # a wall is shared, so the whole floor is straightened at once
    fixed = consolidate(raw, hull=hull)
    for code, quad in SHAPES[n].items():
        fixed[code] = rectify(fit(np.array(quad, float)), MIN_EDGE, JOG, hull)

    shapes, detail = {}, []
    for key, p in fixed.items():
        ins = INSET[n] * (0.5 if key in SHAPES[n] else 1.0)
        q = clip_to(inset(p, ins), hull)
        if key.startswith('#'):
            if area(q) >= DETAIL_MIN:
                detail.append(q)
        else:
            shapes[key] = q
    detail.sort(key=area, reverse=True)
    return shapes, detail, outline, fit


# ------------------------------------------------------------------ zones ----

def zone_bands(n: int, shapes, outline):
    """Split the plate into the three wing bands the rooms actually fall into."""
    wing = {c: PROGRAMME[n][c][2] for c in PROGRAMME[n]}
    wing.update({'CORE-N': 'core', 'CORE-S': 'core', 'VOID': 'core'})

    def mid(a: str, b: str) -> float:
        lo = [np.mean(p[:, 1]) for c, p in shapes.items() if wing.get(c) == a]
        hi = [np.mean(p[:, 1]) for c, p in shapes.items() if wing.get(c) == b]
        if not lo or not hi:
            return 0.0
        return (max(lo) + min(hi)) / 2

    y0 = mid('north', 'core')
    y1 = mid('core', 'south')
    top, bot = outline[:, 1].min(), outline[:, 1].max()
    y0 = float(np.clip(y0, top + 40, bot - 80))
    y1 = float(np.clip(y1, y0 + 40, bot - 40))
    return y0, y1


def clip_band(outline: np.ndarray, y0: float, y1: float) -> np.ndarray:
    g = Polygon(outline).buffer(0)
    x0, x1 = outline[:, 0].min() - 10, outline[:, 0].max() + 10
    band = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    s = g.intersection(band)
    if s.is_empty:
        return np.zeros((0, 2))
    if s.geom_type != 'Polygon':
        s = max(s.geoms, key=lambda p: p.area)
    return np.array(s.exterior.coords)[:-1]


# ------------------------------------------------------------------ write ----


def room_svg(code: str, poly: np.ndarray, prog) -> str:
    name, typ, wing, cap, sched = prog
    a = [f'id="room-{code}"', f'data-name="{esc(name)}"', f'data-type="{typ}"', f'data-wing="{wing}"']
    if cap is not None:
        a.append(f'data-capacity="{cap}"')
    a.append(f'data-schedulable="{"true" if sched else "false"}"')
    a.append(f'd="{path_of(poly)}"')
    return '    <path ' + ' '.join(a) + '/>'


def facade_point(outline: np.ndarray, y: float, west: bool) -> np.ndarray:
    band = outline[np.abs(outline[:, 1] - y) < 60]
    if len(band) == 0:
        band = outline
    i = band[:, 0].argmin() if west else band[:, 0].argmax()
    return band[i]


def entrance_quad(p: np.ndarray, west: bool) -> np.ndarray:
    dx = 13.0 if west else -13.0
    return np.array([[p[0], p[1] - 15], [p[0] + dx, p[1] - 15],
                     [p[0] + dx, p[1] + 15], [p[0], p[1] + 15]])


def floor_svg(n: int, shapes, detail, outline) -> str:
    y0, y1 = zone_bands(n, shapes, outline)
    zones = [('zone-north', clip_band(outline, outline[:, 1].min() - 10, y0)),
             ('zone-hall', clip_band(outline, y0, y1)),
             ('zone-south', clip_band(outline, y1, outline[:, 1].max() + 10))]

    prog = PROGRAMME[n]
    rooms = '\n'.join(room_svg(c, shapes[c], prog[c]) for c in prog)
    cores = '\n'.join(
        f'    <path id="core-{k[-1].lower()}" data-name="{esc(CORE_NAMES[k])}" d="{path_of(shapes[k])}"/>'
        for k in ('CORE-N', 'CORE-S'))
    marks = '\n'.join(
        f'    <use id="stairs-{k[-1].lower()}f{n}" href="#icon-stairs" '
        f'x="{shapes[k][:, 0].mean():.1f}" y="{shapes[k][:, 1].mean():.1f}"/>'
        for k in ('CORE-N', 'CORE-S'))
    ym = (y0 + y1) / 2
    ents = []
    for side in ('w', 'e'):
        q = entrance_quad(facade_point(outline, ym, side == 'w'), side == 'w')
        main = ' data-main="true"' if side == 'w' else ''
        ents.append(f'    <path id="entrance-{side}"{main} d="{path_of(q)}"/>')
    ents = '\n'.join(ents)
    corr = '\n'.join(f'    <path id="corridor-{i + 1}" d="{path_of(p)}"/>'
                     for i, p in enumerate(detail))
    atrium = f'\n  <path id="atrium" d="{path_of(shapes["VOID"])}"/>' if 'VOID' in shapes else ''

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW[0]} {VIEW[1]}" data-floor="{n}" data-building="{BUILDING}">
  <path id="outline" d="{path_of(outline)}"/>
  <g id="zones">
    <path id="zone-north" d="{path_of(zones[0][1])}"/>
    <path id="zone-hall" d="{path_of(zones[1][1])}"/>
    <path id="zone-south" d="{path_of(zones[2][1])}"/>
  </g>
  <g id="corridors">
{corr}
  </g>
  <g id="rooms">
{rooms}
  </g>
  <g id="cores">
{cores}
  </g>
  <g id="landmarks">
{marks}
  </g>
  <g id="entrances">
{ents}
  </g>{atrium}
</svg>
'''


# ------------------------------------------------------------------ check ----

def check(n: int, shapes, outline) -> list[str]:
    bad = []
    hull = Polygon(outline).buffer(1.5)
    polys = {}
    for code, p in shapes.items():
        g = Polygon(p).buffer(0)
        if g.is_empty or g.area <= 0:
            bad.append(f'{code}: empty')
            continue
        polys[code] = g
        w = p[:, 0].max() - p[:, 0].min()
        h = p[:, 1].max() - p[:, 1].min()
        if min(w, h) < MIN_SIDE:
            bad.append(f'{code}: {w:.0f}x{h:.0f} is below {MIN_SIDE:g} across')
        if not hull.contains(g):
            out = g.difference(hull).area
            if out > 0.02 * g.area:
                bad.append(f'{code}: {out:.0f} units escape the outline')
    codes = list(polys)
    for i, a in enumerate(codes):
        for b in codes[i + 1:]:
            if CONTAINS.get(a) == b or CONTAINS.get(b) == a:
                continue
            ov = polys[a].intersection(polys[b]).area
            if ov > 0.06 * min(polys[a].area, polys[b].area):
                bad.append(f'{a} overlaps {b} by {ov:.0f} units')
    return bad


# The north hall is a container: the technical structures stand inside it,
# exactly as the plan draws them.
CONTAINS = {'TECH-N2': 'ATRIUM-N', 'TECH-N3': 'ATRIUM-N'}


def main() -> None:
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    problems, out = [], {}
    for n in (1, 2):
        shapes, detail, outline, _ = trace(n)
        missing = [c for c in PROGRAMME[n] if c not in shapes]
        if missing:
            problems += [f'floor {n}: no shape for {c}' for c in missing]
        problems += [f'floor {n}: {p}' for p in check(n, shapes, outline)]
        out[n] = floor_svg(n, shapes, detail, outline)
        verts = sum(len(p) for p in shapes.values())
        print(f'floor {n}: {len(shapes)} spaces ({verts} vertices), '
              f'{len(detail)} structures, {len(outline)} outline points')
    if problems:
        print('\nsvg:author FAILED\n  ' + '\n  '.join(problems) + '\n', file=sys.stderr)
        raise SystemExit(1)
    for n in (1, 2):
        (SVG_DIR / f'floor-{n}.svg').write_text(out[n], encoding='utf8')
        print(f'svg:author -> {SVG_DIR / f"floor-{n}.svg"}')


if __name__ == '__main__':
    main()
