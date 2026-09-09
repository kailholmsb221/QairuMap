"""
svg:check - check `svg/floor-{1,2}.svg` against the plan each was traced from.

    python scripts/authoring/check.py        (pnpm --filter @campuslive/map-data run svg:check)

Writes `reference/authored-check.png` - authored plate, reference plate, authored
plate, reference plate - and prints, for every space, the overlap between the
polygon that was drawn and the cell it was traced from. A room that sits
somewhere the plan does not put it shows up in both.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
PKG = HERE.parent.parent
W, H, S = 600, 1000, 1.35

INK = (74, 46, 24)
SLAB = (243, 238, 232)
ZONE = (232, 226, 218)
CORR = (250, 247, 244)
FILL = {'lecture': (196, 132, 74), 'seminar': (206, 158, 96), 'lab': (188, 146, 96),
        'coworking': (210, 176, 128), 'admin': (214, 178, 140), 'service': (222, 206, 190),
        'void': (236, 232, 228)}


def paths(svg: str):
    out = []
    for m in re.finditer(r'<path([^>]*?)/>', svg):
        a = dict(re.findall(r'([a-zA-Z-]+)="([^"]*)"', m.group(1)))
        if 'd' in a:
            out.append(a)
    return out


def poly(d: str) -> np.ndarray:
    n = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
    return (np.array(n).reshape(-1, 2) * S).astype(np.int32)


def render(n: int) -> np.ndarray:
    svg = (PKG / 'svg' / f'floor-{n}.svg').read_text(encoding='utf8')
    img = np.full((int(H * S), int(W * S), 3), 255, np.uint8)
    ps = paths(svg)
    by_id = {a.get('id', ''): a for a in ps}
    if 'outline' in by_id:
        cv2.fillPoly(img, [poly(by_id['outline']['d'])], SLAB)
    for a in ps:
        if a.get('id', '').startswith('zone-'):
            cv2.fillPoly(img, [poly(a['d'])], ZONE)
    for a in ps:
        if a.get('id', '').startswith('corridor-'):
            cv2.fillPoly(img, [poly(a['d'])], CORR)
    for a in ps:
        i = a.get('id', '')
        if not (i.startswith('room-') or i.startswith('core-') or i == 'atrium'):
            continue
        col = FILL.get(a.get('data-type', 'service'), (200, 200, 200))
        if i.startswith('core-'):
            col = (190, 190, 190)
        cv2.fillPoly(img, [poly(a['d'])], col)
        cv2.polylines(img, [poly(a['d'])], True, INK, 1, cv2.LINE_AA)
    if 'outline' in by_id:
        cv2.polylines(img, [poly(by_id['outline']['d'])], True, (40, 60, 90), 2, cv2.LINE_AA)
    for a in ps:
        i = a.get('id', '')
        if not i.startswith('room-'):
            continue
        p = poly(a['d'])
        m = np.zeros(img.shape[:2], np.uint8)
        cv2.fillPoly(m, [p], 255)
        d = cv2.distanceTransform(m, cv2.DIST_L2, 3)
        cy, cx = np.unravel_index(d.argmax(), d.shape)
        t = i[5:]
        sz = 0.42 if len(t) > 4 else 0.5
        (tw, _), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, sz, 1)
        for c, th in (((255, 255, 255), 4), ((20, 20, 20), 1)):
            cv2.putText(img, t, (int(cx) - tw // 2, int(cy) + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, sz, c, th, cv2.LINE_AA)
    return img


def reference(n: int, h: int) -> np.ndarray:
    a = np.array(Image.open(PKG / 'reference' / f'floor-{n}.png').convert('RGBA'))
    rgb = a[..., :3][:, :, ::-1].copy()
    rgb[a[..., 3] < 40] = (255, 255, 255)
    if n == 2:
        rgb = cv2.rotate(rgb, cv2.ROTATE_90_CLOCKWISE)
    s = h / rgb.shape[0]
    return cv2.resize(rgb, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)


def room_paths(svg: str) -> dict[str, str]:
    out = {m.group(1): m.group(2)
           for m in re.finditer(r'<path id="room-([A-Z0-9-]+)"[^>]*?d="([^"]+)"', svg)}
    for m in re.finditer(r'<path id="core-([ns])"[^>]*?d="([^"]+)"', svg):
        out['CORE-N' if m.group(1) == 'n' else 'CORE-S'] = m.group(2)
    m = re.search(r'<path id="atrium" d="([^"]+)"', svg)
    if m:
        out['VOID'] = m.group(1)
    return out


def overlap(n: int) -> list[tuple[str, float]]:
    """Intersection over union of each drawn room with the cell it came from."""
    from build_svg import BOX, DOOR, MIN_CELL, MIN_SEED
    from geometry import Fit
    from plan import cells
    from rooms import ANCHORS

    res = cells(str(PKG / 'reference'), n, MIN_SEED[n], DOOR[n], MIN_CELL[n])
    lab, solid = res['labels'], res['solid']
    h = solid.shape[0]
    ys, xs = np.where(solid)
    box = ((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if n == 1
           else (h - 1 - ys.max(), xs.min(), h - 1 - ys.min(), xs.max() + 1))
    fit = Fit(box, BOX, rotate=(n == 2), height=h)
    drawn = room_paths((PKG / 'svg' / f'floor-{n}.svg').read_text(encoding='utf8'))

    rows = []
    for code, pts in ANCHORS[n].items():
        ids = sorted({int(lab[y, x]) for x, y in pts})
        a = np.zeros((H, W), np.uint8)
        cn, _ = cv2.findContours(np.isin(lab, ids).astype(np.uint8),
                                 cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for c in cn:
            cv2.fillPoly(a, [np.round(fit(c.reshape(-1, 2).astype(float))).astype(np.int32)], 1)
        b = np.zeros((H, W), np.uint8)
        nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', drawn[code])]
        cv2.fillPoly(b, [np.round(np.array(nums).reshape(-1, 2)).astype(np.int32)], 1)
        union = int((a | b).sum())
        rows.append((code, int((a & b).sum()) / union if union else 0.0))
    rows.sort(key=lambda r: r[1])
    return rows


def main() -> None:
    for n in (1, 2):
        rows = overlap(n)
        vals = [v for _, v in rows]
        worst = '  '.join(f'{c} {v:.2f}' for c, v in rows[:4])
        print(f'floor {n}: {len(rows)} spaces, median overlap '
              f'{float(np.median(vals)):.3f}, worst {worst}')
        low = [c for c, v in rows if v < 0.80]
        if low:
            print(f'  !! floor {n}: {", ".join(low)} differ from the plan by more than a fifth')

    plates = []
    for n in (1, 2):
        a = render(n)
        plates += [a, reference(n, a.shape[0])]
    out = np.hstack([np.pad(p, ((0, 0), (12, 12), (0, 0)), constant_values=255) for p in plates])
    dst = PKG / 'reference' / 'authored-check.png'
    cv2.imwrite(str(dst), out)
    print(f'svg:check -> {dst}  {out.shape[1]}x{out.shape[0]}')


if __name__ == '__main__':
    main()
