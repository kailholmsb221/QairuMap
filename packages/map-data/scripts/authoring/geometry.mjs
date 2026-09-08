// CampusLive — authoring geometry for the two real floors of building A.
//
// Same visual language as `docs/design/src/geometry.mjs`: every space is an
// axis-aligned rectangle in the shared `viewBox 0 0 600 1000` space, clipped to
// the building silhouette. Corridors are the white gaps left between the
// rectangles — they are never drawn as rooms.
//
// The silhouette is the real one, traced from the floor-1 photo
// (`reference/outline-traced.txt`, 60 points). Floor 1 is placed directly from
// `reference/floor-1.png` through the photo→viewBox transform
//   x' = 0.37911·x − 68.8 , y' = 0.37911·y + 16.1
// Floor 2's photo is drawn at another orientation and scale, so its rooms are
// placed topologically — the real plan rotated 90° clockwise, same ring order,
// same neighbours — inside the same silhouette.
//
// Room codes, types, capacities and schedulable flags come from docs/BUILDING.md
// and nothing here may invent one.

export const VB = [0, 0, 600, 1000];

/** Traced silhouette — `reference/outline-traced.txt`, verbatim. */
export const OUTLINE_D =
  'M 403.7 26.0 L 387.6 28.1 L 355.0 37.4 L 307.1 58.5 L 149.6 139.6 L 123.8 158.6 ' +
  'L 89.3 192.5 L 70.8 219.4 L 63.7 234.5 L 47.4 284.1 L 41.9 337.1 L 51.1 422.8 ' +
  'L 53.6 432.7 L 78.3 479.3 L 82.7 498.7 L 79.9 521.0 L 53.5 575.6 L 47.3 639.4 ' +
  'L 47.3 675.6 L 52.4 710.6 L 57.1 727.3 L 71.6 758.9 L 102.3 799.8 L 141.5 831.5 ' +
  'L 244.2 894.6 L 333.0 953.9 L 363.6 968.0 L 394.6 974.0 L 424.5 970.1 L 438.2 964.2 ' +
  'L 462.3 944.9 L 481.5 918.0 L 501.8 869.9 L 520.5 801.3 L 525.2 769.9 L 520.5 745.1 ' +
  'L 495.1 692.4 L 495.8 689.3 L 518.6 680.3 L 513.8 677.3 L 507.8 664.8 L 506.1 652.0 ' +
  'L 508.7 648.6 L 516.1 648.7 L 538.9 642.0 L 548.6 629.9 L 553.1 585.3 L 530.6 537.0 ' +
  'L 526.3 517.1 L 530.6 495.1 L 553.1 457.2 L 558.1 439.8 L 554.3 356.1 L 542.3 246.4 ' +
  'L 526.4 157.4 L 511.8 106.1 L 504.8 90.1 L 487.1 61.6 L 463.5 40.0 L 435.3 28.3 Z';

/* -------------------------------------------------------------------------- */
/* Polygon helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Flatten an absolute SVG path (`M L Q C Z`) into a polygon. */
export function samplePath(d, seg = 28) {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+/g);
  const pts = [];
  let i = 0;
  let cur = [0, 0];
  const num = () => Number.parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') {
      cur = [num(), num()];
      pts.push(cur);
    } else if (c === 'Q') {
      const p0 = cur;
      const c1 = [num(), num()];
      const p1 = [num(), num()];
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
      const c1 = [num(), num()];
      const c2 = [num(), num()];
      const p1 = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
        ]);
      }
      cur = p1;
    }
  }
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
  }
  return pts;
}

export const OUTLINE_POLY = samplePath(OUTLINE_D);

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function intersect(p, q, a, b) {
  const A1 = q[1] - p[1];
  const B1 = p[0] - q[0];
  const C1 = A1 * p[0] + B1 * p[1];
  const A2 = b[1] - a[1];
  const B2 = a[0] - b[0];
  const C2 = A2 * a[0] + B2 * a[1];
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return q;
  return [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
}

/**
 * Sutherland–Hodgman. Exact only when the **clip** polygon is convex, so this is
 * never called with the silhouette as the clip window: the real outline is
 * concave (a bay on the west façade around y 470…530 and a deep notch on the
 * east around y 645…695).
 */
export function shClip(subject, clip) {
  const sign = signedArea(clip) > 0 ? 1 : -1;
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    const inside = (p) =>
      sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9;
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) output.push(intersect(prev, cur, a, b));
        output.push(cur);
      } else if (pi) {
        output.push(intersect(prev, cur, a, b));
      }
    }
  }
  return output;
}

/** Drop repeated and collinear vertices so the emitted `d` stays small. */
export function simplify(poly, eps = 0.05) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < eps && Math.abs(last[1] - p[1]) < eps) continue;
    out.push(p);
  }
  while (
    out.length > 1 &&
    Math.abs(out[0][0] - out[out.length - 1][0]) < eps &&
    Math.abs(out[0][1] - out[out.length - 1][1]) < eps
  ) {
    out.pop();
  }
  const keep = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length];
    const b = out[i];
    const c = out[(i + 1) % out.length];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 1e-4) keep.push(b);
  }
  return keep.length >= 3 ? keep : out;
}

export function rectPoly([x, y, w, h]) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/**
 * Concave-safe clip of a room rectangle to the building silhouette.
 *
 * The rectangle — not the outline — is the Sutherland–Hodgman clip window, so the
 * concavity of the real façade is handled exactly: what comes back is the part of
 * the (concave) outline that lies inside the rectangle.
 */
export function clipRect(rect, clip = OUTLINE_POLY) {
  return simplify(shClip(clip, rectPoly(rect)));
}

export function bbox(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function polyArea(poly) {
  return Math.abs(signedArea(poly));
}

const r1 = (v) => Math.round(v * 10) / 10;

export function polyToPath(poly) {
  if (poly.length < 3) return '';
  return `M ${poly.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L ')} Z`;
}

/** Rectangle → closed path, clipped to the silhouette. */
export const rectPath = (rect) => polyToPath(clipRect(rect));

/* -------------------------------------------------------------------------- */
/* Shared bands                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The plate splits into the same three tinted zones on both floors. The split
 * follows floor 1's photo: the north hall bottoms out at y≈440 and the south
 * block starts at y≈556.
 */
export const BANDS = { hall: [440, 556] };

/* -------------------------------------------------------------------------- */
/* Room tables — docs/BUILDING.md is the contract                             */
/* -------------------------------------------------------------------------- */

/**
 * `wing` is `north | south | core` (packages/contracts `Wing`, and the `wing`
 * enum in the API's 0001_init.sql). It records which band of the shared plate a
 * space sits in, so floor 2's perimeter ring resolves per room by its own centre.
 */
const R = (code, nameRu, nameEn, type, wing, capacity, schedulable, rect) => ({
  code,
  nameRu,
  nameEn,
  type,
  wing,
  capacity,
  schedulable,
  rect,
});

/**
 * Floor 1 — read straight off `reference/floor-1.png`.
 *
 *   north ~45 %  one dark hall (ATRIUM-N) with three white structures inside it
 *   middle band  LOBBY spanning it, CAFE in the centre, CORE-N1 rounded, east
 *   south block  100 west · CR over CINEMA · WC-1 over WC-2 · TECH-S1 · CORE-S1
 *                and, along the south/south-east edge, 101 · 102 · 102A · 103
 */
export const FLOOR1 = [
  // ---- north: the hall, then the three structures standing inside it --------
  R('ATRIUM-N', 'Солтүстік атриум', 'North Atrium', 'service', 'north', null, false,
    [0, 0, 600, 442]),
  R('TECH-N1', 'Техникалық бөлме', 'Technical', 'service', 'north', null, false,
    [152, 244, 126, 196]),
  R('TECH-N2', 'Техникалық бөлме', 'Technical', 'service', 'north', null, false,
    [366, 212, 100, 218]),
  R('TECH-N3', 'Техникалық бөлме', 'Technical', 'service', 'north', null, false,
    [478, 288, 74, 96]),

  // ---- middle band ---------------------------------------------------------
  R('LOBBY', 'Фойе', 'Main Lobby', 'service', 'core', null, false,
    [0, 440, 494, 116]),
  R('CAFE', 'Асхана', 'Cafe', 'service', 'core', 120, false,
    [312, 470, 76, 76]),

  // ---- south block ---------------------------------------------------------
  R('100', 'Мәжіліс залы', 'Assembly Hall', 'lecture', 'south', 180, true,
    [30, 556, 142, 196]),
  R('CR', 'Конференц-бөлме (CR)', 'Conference Room', 'seminar', 'south', 24, true,
    [190, 560, 80, 76]),
  R('CINEMA', 'Кинозал', 'Cinema', 'lecture', 'south', 60, false,
    [190, 642, 80, 100]),
  R('WC-1', 'Дәретхана', 'Restrooms', 'service', 'south', null, false,
    [296, 574, 68, 96]),
  R('WC-2', 'Дәретхана', 'Restrooms', 'service', 'south', null, false,
    [276, 678, 68, 96]),
  R('TECH-S1', 'Техникалық бөлме', 'Technical', 'service', 'south', null, false,
    [368, 594, 84, 200]),

  // ---- south / south-east edge, west → east --------------------------------
  R('101', 'Оқу зертханасы', 'Teaching Laboratory', 'lab', 'south', 30, true,
    [140, 752, 100, 122]),
  R('102', 'Кітапхана', 'Library', 'coworking', 'south', 60, false,
    [246, 790, 84, 150]),
  R('102A', 'Кітапхана — оқу залы', 'Library — Reading Room', 'coworking', 'south', 40, false,
    [336, 818, 92, 146]),
  R('103', 'Медициналық пункт', 'Medical Room', 'service', 'south', 4, false,
    [456, 706, 86, 200]),
];

/**
 * Floor 2 — `reference/floor-2.png` rotated 90° clockwise, so its long axis runs
 * north–south, then fitted topologically into the same silhouette. A perimeter
 * ring around a corridor ring around an inner core.
 *
 *   north  202 203 207 [206/208] [210/211] 209 [213/212]   (pairs stack: lower/upper)
 *   east   214 215 AI-LAB 217 218 219
 *   south  222 221 220
 *   west   201 200 226 225 224
 *   core   226A · 204/205 · VOID-2 strip · CORE-N2/CORE-S2 · 223 · WC-N2/WC-S2
 */
export const FLOOR2 = [
  // ---- west edge, north → south --------------------------------------------
  R('201', 'Кеңес өткізу залы', 'Conference Hall', 'seminar', 'north', 40, true,
    [16, 116, 134, 170]),
  R('200', 'Дәріс аудиториясы', 'Lecture Hall', 'lecture', 'north', 120, true,
    [16, 292, 134, 106]),
  R('226', 'Оқу зертханасы', 'Teaching Laboratory', 'lab', 'core', 30, true,
    [16, 404, 134, 172]),
  R('225', 'Қызметтік бөлме', 'Staff Room', 'service', 'south', 6, false,
    [16, 582, 134, 44]),
  R('224', 'Дәріс аудиториясы', 'Lecture Hall', 'lecture', 'south', 100, true,
    [16, 632, 134, 154]),

  // ---- north edge, west → east. Inner row first, then the three outer rooms
  //      that stand in front of 206, 210 and 213 on the photo. ----------------
  R('202', 'Деканат', "Dean's Office", 'admin', 'north', 10, false,
    [156, 128, 48, 92]),
  R('203', 'Академиялық қызмет департаменті', 'Department of Academic Activities',
    'admin', 'north', 12, false, [208, 128, 48, 92]),
  R('207', 'Ректор', "Rector's Office", 'admin', 'north', 8, false,
    [260, 128, 48, 92]),
  R('206', 'Ректордың қабылдау бөлмесі', "Rector's Reception Office", 'admin', 'north', 6, false,
    [312, 128, 48, 92]),
  R('208', 'Бірінші проректор', 'First Vice-Rector', 'admin', 'north', 8, false,
    [312, 44, 48, 76]),
  R('210', 'Кабинет 210', 'Office 210', 'admin', 'north', 6, false,
    [364, 128, 48, 92]),
  R('211', 'Кабинет 211', 'Office 211', 'admin', 'north', 6, false,
    [364, 44, 48, 76]),
  R('209', 'Проректорлардың қабылдау бөлмесі', "Vice-Rectors' Reception", 'admin', 'north', 6, false,
    [416, 128, 48, 92]),
  R('213', 'Ректор кеңесшісі', 'Advisor to the Rector', 'admin', 'north', 4, false,
    [468, 128, 48, 92]),
  R('212', 'Кабинет 212', 'Office 212', 'admin', 'north', 6, false,
    [416, 44, 48, 76]),

  // ---- east edge, north → south --------------------------------------------
  R('214', 'Бухгалтерлік есеп департаменті', 'Accounting Department', 'admin', 'north', 12, false,
    [440, 228, 132, 116]),
  R('215', 'Кабинет 215', 'Office 215', 'admin', 'north', 8, false,
    [440, 350, 132, 92]),
  R('AI-LAB', 'AI зертханасы', 'AI Lab', 'lab', 'core', 25, true,
    [440, 448, 132, 104]),
  R('217', 'Маркетинг және қоғаммен байланыс департаменті', 'Dept. of Marketing and PR',
    'admin', 'south', 12, false, [440, 558, 132, 92]),
  R('218', 'Білім беру бағдарламалары мектебі', 'School of Educational Programs',
    'admin', 'south', 14, false, [440, 656, 132, 100]),
  R('219', 'Дәріс аудиториясы', 'Lecture Hall', 'lecture', 'south', 100, true,
    [440, 762, 132, 130]),

  // ---- south edge, west → east ---------------------------------------------
  R('222', 'Компьютерлік сынып', 'Computer Lab', 'lab', 'south', 25, true,
    [190, 786, 88, 140]),
  R('221', 'Тіркеу кеңсесі', "Registrar's Office", 'admin', 'south', 10, false,
    [286, 794, 74, 140]),
  R('220', 'Қызметтік бөлме', 'Staff Room', 'service', 'south', 8, false,
    [368, 800, 66, 140]),

  // ---- inner core ----------------------------------------------------------
  R('226A', 'Оқу зертханасы', 'Teaching Laboratory', 'lab', 'core', 25, true,
    [196, 250, 104, 148]),
  R('204', 'Оқу зертханасы', 'Teaching Laboratory', 'lab', 'core', 25, true,
    [312, 250, 104, 70]),
  R('205', 'Қойма бөлмесі', 'Warehouse', 'service', 'core', null, false,
    [312, 328, 104, 70]),
  R('223', 'Оқу зертханасы', 'Teaching Laboratory', 'lab', 'core', 25, true,
    [196, 560, 104, 196]),
  R('WC-N2', 'Дәретхана', 'Restrooms', 'service', 'core', null, false,
    [312, 560, 104, 64]),
  R('WC-S2', 'Дәретхана', 'Restrooms', 'service', 'core', null, false,
    [312, 632, 104, 64]),
];

/**
 * The two vertical circulation cores of each floor. `<g id="cores">` carries
 * them separately; `svg2map` names them `CORE-{N,S}{floor}` and emits them as
 * rooms too.
 */
export const CORES = {
  1: [
    { id: 'core-n', nameRu: 'Баспалдақ және лифт', nameEn: 'Stairs & Lifts', rect: [498, 446, 60, 122] },
    { id: 'core-s', nameRu: 'Баспалдақ', nameEn: 'Stairs', rect: [486, 568, 54, 68] },
  ],
  2: [
    { id: 'core-n', nameRu: 'Баспалдақ және лифт', nameEn: 'Stairs & Lifts', rect: [312, 406, 104, 46] },
    { id: 'core-s', nameRu: 'Баспалдақ', nameEn: 'Stairs', rect: [312, 512, 104, 46] },
  ],
};

/** Floor 2's atrium void — `VOID-2` in docs/BUILDING.md. */
export const ATRIUM_RECT = [196, 460, 220, 46];

export const LANDMARKS = {
  1: [
    { id: 'stairs-sf1', x: 506, y: 456 },
    { id: 'stairs-sf2', x: 492, y: 578 },
  ],
  2: [
    { id: 'stairs-sf1', x: 320, y: 414 },
    { id: 'stairs-sf2', x: 320, y: 520 },
  ],
};

/**
 * Doorways on the façade. West is the main one, on the hall band where the west
 * wall bays inward; east sits on the widest part of the straight east façade.
 * `apps/web` draws entrances on floor 1 only.
 */
export const ENTRANCES = [
  { id: 'entrance-w', main: true, rect: [70, 478, 46, 60] },
  { id: 'entrance-e', main: false, rect: [512, 392, 48, 48] },
];

export const FLOORS = { 1: FLOOR1, 2: FLOOR2 };

/* -------------------------------------------------------------------------- */
/* Derived                                                                    */
/* -------------------------------------------------------------------------- */

export function zonePaths() {
  const [h0, h1] = BANDS.hall;
  return {
    north: rectPath([0, 0, 600, h0]),
    hall: rectPath([0, h0, 600, h1 - h0]),
    south: rectPath([0, h1, 600, 1000 - h1]),
  };
}

/** Rooms of a floor, resolved to clipped polygons. */
export function resolveFloor(n) {
  return FLOORS[n].map((r) => {
    const poly = clipRect(r.rect);
    return { ...r, floor: n, poly, path: polyToPath(poly), bbox: bbox(poly), area: polyArea(poly) };
  });
}

export const schedulableCodes = (n) => FLOORS[n].filter((r) => r.schedulable).map((r) => r.code);
