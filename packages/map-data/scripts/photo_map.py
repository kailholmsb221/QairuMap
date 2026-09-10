"""Trace interaction regions in the supplied photos; never rewrite the photos."""
from pathlib import Path
import json
import hashlib

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / 'apps/web/public/maps'
OUT = ROOT / 'packages/map-data/photo-map.json'

# Interior sample points identify existing room codes, not new geometry.
ANCHORS = {
    1: {
        '100': [(1000, 850), (835, 820)], '101': [(1160, 730)],
        '102': [(1250, 600)], '102A': [(1320, 420)],
        '103': [(1230, 280), (1110, 230)], 'CR': [(870, 660)],
        'CINEMA': [(990, 675)], 'WC-1': [(900, 520)], 'WC-2': [(1030, 550)],
        'ATRIUM-N': [(120, 430), (500, 800)], 'TECH-N2': [(500, 530)],
    },
    2: {
        '200': [(520, 812)], '201': [(370, 802)], '202': [(302, 681)],
        '203': [(303, 597)], '204': [(450, 450)], '205': [(581, 424)],
        '206': [(279, 466)], '207': [(257, 530)], '208': [(198, 481)],
        '209': [(257, 325)], '210': [(268, 390)], '211': [(167, 397)],
        '212': [(160, 310)], '213': [(235, 267)], '214': [(370, 266)],
        '215': [(563, 235)], 'AI-LAB': [(722, 215)], '217': [(864, 222)],
        '218': [(1083, 240)], '219': [(1268, 278)],
        '220': [(1203, 368), (1284, 353), (1269, 411)],
        '221': [(1208, 466), (1198, 518)], '222': [(1189, 609)],
        '223': [(921, 579)], '224': [(948, 786)], '225': [(855, 735)],
        '226': [(715, 789)], '226A': [(510, 600)], '227': [(1023, 367)],
        '228': [(421, 373)], '229': [(1092, 782)], '231': [(564, 350)],
        '232': [(866, 352)], 'WC-N2': [(857, 415), (886, 456)],
        'WC-S2': [(981, 437)], 'CORE-N2': [(964, 229)],
        'CORE-S2': [(1037, 412), (1033, 465)],
    },
}

# These neutral spaces have no blue fill to segment. Vertices follow the
# photographed boundary, in original image pixels; no layout regularisation.
NEUTRAL = {
    1: {
        'CAFE': [(694,485),(771,487),(769,545),(694,544)],
        'CORE-N1': [(658,154),(828,155),(827,177),(822,192),(814,202),(802,208),(698,207),(684,203),(672,194),(664,181)],
        'CORE-S1': [(932,166),(1007,177),(1002,204),(978,201),(963,268),(944,269),(944,275),(1040,279),(1060,183)],
        'TECH-N3': [(566,164),(650,160),(655,183),(663,200),(672,210),(610,259),(594,253),(575,257)],
        'TECH-S1': [(837,162),(922,166),(907,260),(891,261),(873,271),(813,213),(826,202),(833,184)],
    },
    2: {
        'VOID-2': [(694,394),(743,394),(743,408),(748,414),(748,627),(688,627),(688,415),(694,407)],
    },
}

# Only these caption pixels are concealed in the distant view. The original
# images, including the duplicate 102/226 labels, are used unchanged in focus.
CAPTIONS = {
    1: [(964,805,1030,844),(1140,699,1206,736),(1209,574,1276,610),
        (1271,450,1340,488),(1209,245,1276,282),(850,614,906,651),
        (945,626,1060,667),(878,480,936,518),(1022,498,1084,539),(695,497,768,534)],
    2: [(484,761,546,796),(332,747,397,786),(259,649,319,681),
        (254,576,315,609),(246,436,305,472),(214,508,279,548),
        (162,449,226,485),(220,302,280,341),(233,365,293,402),
        (131,371,192,408),(141,271,176,329),(203,245,265,280),
        (294,207,355,244),(575,192,635,225),(671,190,776,224),
        (836,193,898,226),(1050,204,1115,239),(1222,251,1283,285),
        (1180,340,1219,401),(1169,445,1232,480),(1153,586,1218,620),
        (895,549,958,582),(916,745,980,780),(839,700,875,774),
        (677,762,741,796),(489,549,553,585),(841,398,884,432),(960,411,1008,446)],
}


def outline_mask(rgb, n):
    bright = (rgb[..., 2] > (82 if n == 1 else 135)).astype('uint8')
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((5, 5), 'uint8'))
    contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros(bright.shape, 'uint8')
    cv2.drawContours(mask, [max(contours, key=cv2.contourArea)], -1, 1, cv2.FILLED)
    return cv2.dilate(mask, np.ones((3, 3), 'uint8')).astype(bool)


def path_of(mask, transform=lambda x, y: (x, y)):
    contours, _ = cv2.findContours(mask.astype('uint8'), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    parts = []
    for contour in contours:
        if cv2.contourArea(contour) <= 4:
            continue
        points = [transform(float(x), float(y)) for x, y in contour[:, 0]]
        parts.append('M' + ' L'.join(f'{x:.3f},{y:.3f}' for x, y in points) + ' Z')
    return ' '.join(parts)


def segments(n, rgb):
    r, g, b = np.moveaxis(rgb.astype(float), -1, 0)
    blue = (b > (65 if n == 1 else 85)) & (g < b * .68) & (r < b * .32)
    if n == 2:
        blue |= (b > 85) & (b < 180) & (g < b * .86) & (r < b * .25)
    inner = ndi.binary_erosion(blue, iterations=1)
    # Close only the photographed openings between neighbouring room interiors.
    cuts = {
        1: [((1126, 628), (1268, 675)), ((1178, 493), (1365, 557)),
            ((1248, 397), (1320, 240)), ((983, 464), (960, 558))],
        2: [((205, 325), (212, 340)), ((248, 345), (271, 340)),
            ((143, 449), (151, 430)), ((236, 455), (251, 496)),
            ((264, 424), (281, 419)), ((246, 497), (280, 483)),
            ((203, 302), (219, 358)), ((228, 418), (245, 462))],
    }
    for a, z in cuts[n]:
        cv2.line(inner.view('uint8'), a, z, 0, 3)
    # Small caption holes belong to their room; edges remain in source pixels.
    labels, count = ndi.label(inner)
    distance, nearest = ndi.distance_transform_edt(labels == 0, return_indices=True)
    grow = blue & (distance <= 1.5)
    labels[grow] = labels[tuple(nearest)][grow]
    sizes = np.bincount(labels.ravel())
    regions = {}
    for code, anchors in ANCHORS[n].items():
        ids = set()
        for x, y in anchors:
            region = int(labels[y, x])
            if region == 0 or sizes[region] < 100:
                local = labels[max(0, y-8):y+9, max(0, x-8):x+9]
                candidates = np.unique(local)
                region = int(max(candidates, key=lambda i: sizes[i] if i else 0))
            ids.add(region)
        mask = ndi.binary_fill_holes(np.isin(labels, list(ids - {0})))
        regions[code] = mask
        ys, xs = np.where(mask)
        if not len(xs):
            raise ValueError(f'Empty room: {n}/{code}')
    for code, points in NEUTRAL[n].items():
        mask = np.zeros(blue.shape, dtype='uint8')
        cv2.fillPoly(mask, [np.array(points, dtype='int32')], 1)
        regions[code] = mask.astype(bool)
    return blue, regions, labels


def main():
    result = {'floors': {}}
    qa = ROOT / 'docs/screenshots/photo-map'
    qa.mkdir(parents=True, exist_ok=True)
    spec = json.loads((ROOT / 'packages/map-data/building-a.json').read_text(encoding='utf-8'))
    for n in (1, 2):
        source = ASSETS / f'floor-{n}.png'
        if n == 1:
            # Lossless quarter-turn only; retain the supplied HD file separately.
            Image.open(ASSETS / 'floor-1-hd.png').transpose(Image.Transpose.ROTATE_90).save(source)
        rgb = np.array(Image.open(source).convert('RGB'))
        blue, regions, labels = segments(n, rgb)
        solid = outline_mask(rgb, n)
        sy, sx = np.where(solid)
        cx, cy = (sx.min() + sx.max()) / 2, (sy.min() + sy.max()) / 2
        scale = min(960 / (sx.max() - sx.min()), 560 / (sy.max() - sy.min()))
        def to_plan(x, y):
            return (300 + (cy - y) * scale, 500 + (x - cx) * scale)
        photo_transform = f'matrix(0 {scale:.9f} {-scale:.9f} 0 {300+cy*scale:.9f} {500-cx*scale:.9f})'
        expected = {r['code'] for f in spec['floors'] if f['number'] == n for r in f['rooms']}
        assert set(regions) == expected, (n, expected - set(regions), set(regions) - expected)
        occupied = np.zeros(blue.shape, dtype='uint8')
        rooms = {}
        preview = Image.fromarray(rgb)
        draw = ImageDraw.Draw(preview)
        for code, mask in regions.items():
            assert not (occupied & mask).any(), f'Overlapping room: {n}/{code}'
            occupied |= mask
            contours, _ = cv2.findContours(mask.astype('uint8'), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                if cv2.contourArea(c) > 4:
                    draw.line([tuple(p) for p in c[:, 0]], fill='yellow', width=1)
            # Tooltip anchors are guaranteed to lie inside their photographed room.
            y, x = np.unravel_index(ndi.distance_transform_edt(mask).argmax(), mask.shape)
            px, py = to_plan(x, y)
            ys, xs = np.where(mask)
            bx, by = to_plan(xs.min(), ys.max())
            rooms[code] = {
                'path': path_of(mask, to_plan), 'sourcePath': path_of(mask),
                'label': {'x': round(px, 3), 'y': round(py, 3)},
                'sourceLabel': {'x': int(x), 'y': int(y)},
                'bbox': {'x': round(bx, 3), 'y': round(by, 3),
                         'w': round((ys.max()-ys.min())*scale, 3),
                         'h': round((xs.max()-xs.min())*scale, 3)},
            }
            draw.text((x, y), code, fill='red')
        preview.save(qa / f'contours-floor-{n}.png')
        # Exclude text, bright wall strokes and their antialiased fringes. The
        # original blue's luminance/texture remains under the CSS color blend.
        ink_safe = ndi.binary_erosion(blue, iterations=1)
        Image.fromarray(ink_safe.astype('uint8') * 255).save(ASSETS / f'floor-{n}-fill-mask.png')
        caption = np.zeros(solid.shape, 'uint8')
        for x1, y1, x2, y2 in CAPTIONS[n]:
            caption[y1:y2, x1:x2] = 1
        caption &= ndi.binary_erosion(occupied, iterations=2).astype('uint8')
        distant = cv2.inpaint(rgb, caption * 255, 5, cv2.INPAINT_NS)
        assert np.array_equal(distant[caption == 0], rgb[caption == 0])
        Image.fromarray(distant).save(ASSETS / f'floor-{n}-distant.png')
        distant_ink = ink_safe | (caption.astype(bool) & occupied.astype(bool))
        Image.fromarray(distant_ink.astype('uint8') * 255).save(ASSETS / f'floor-{n}-distant-mask.png')
        Image.fromarray(caption * 255).save(qa / f'caption-mask-{n}.png')
        # Transparent preview checks the cutout; production clips the untouched image.
        cutout = np.dstack((rgb, solid.astype('uint8') * 255))
        Image.fromarray(cutout).save(qa / f'cutout-floor-{n}.png')
        result['floors'][str(n)] = {
            'width': rgb.shape[1], 'height': rgb.shape[0],
            'image': f'/maps/floor-{n}.png', 'mask': f'/maps/floor-{n}-fill-mask.png',
            'distantImage': f'/maps/floor-{n}-distant.png',
            'distantMask': f'/maps/floor-{n}-distant-mask.png',
            'transform': photo_transform, 'outline': path_of(solid, to_plan),
            'sourceOutline': path_of(solid),
            'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'rooms': rooms,
        }
        print(f'Floor {n}: {len(rooms)} nonoverlapping regions, {rgb.shape[1]} x {rgb.shape[0]}')
    OUT.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
