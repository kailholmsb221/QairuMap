// CampusLive — building geometry (viewBox 0 0 600 1000, north up, straight façade east)
// Outline traced from the floor-plan photos: straight east façade, small NE/SE radii,
// long NW sweep, convex west façade, large SW radius, slightly bowed south edge.

export const VB = [0, 0, 600, 1000];

export const OUTLINE_D =
  'M 320 40 L 545 40 Q 580 40 580 75 L 580 925 Q 580 960 545 960 ' +
  'L 260 984 C 140 986 44 900 34 770 Q 10 585 24 400 C 16 240 140 80 320 40 Z';

// ---------- path sampling ----------
function samplePath(d, seg = 28) {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+/g);
  const pts = [];
  let i = 0, cur = [0, 0];
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') { cur = [num(), num()]; pts.push(cur); }
    else if (c === 'Q') {
      const p0 = cur, c1 = [num(), num()], p1 = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg, u = 1 - t;
        pts.push([u * u * p0[0] + 2 * u * t * c1[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c1[1] + t * t * p1[1]]);
      }
      cur = p1;
    } else if (c === 'C') {
      const p0 = cur, c1 = [num(), num()], c2 = [num(), num()], p1 = [num(), num()];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg, u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
        ]);
      }
      cur = p1;
    } else if (c === 'Z') { /* closed */ }
  }
  // drop duplicate closing point
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
  }
  return pts;
}

export const OUTLINE_POLY = samplePath(OUTLINE_D);

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function intersect(p, q, a, b) {
  const A1 = q[1] - p[1], B1 = p[0] - q[0], C1 = A1 * p[0] + B1 * p[1];
  const A2 = b[1] - a[1], B2 = a[0] - b[0], C2 = A2 * a[0] + B2 * a[1];
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return q;
  return [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
}

// Sutherland–Hodgman: clip subject polygon by convex clip polygon
export function clipPolygon(subject, clip = OUTLINE_POLY) {
  const sign = signedArea(clip) > 0 ? 1 : -1;
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    const inside = (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9;
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) output.push(intersect(prev, cur, a, b)); output.push(cur); }
      else if (pi) output.push(intersect(prev, cur, a, b));
    }
  }
  return output;
}

// inset polygon (convex) by d — used for walls gap; simple centroid-scaling approximation
export function polyCentroid(poly) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * f; y += (p[1] + q[1]) * f; a += f;
  }
  if (Math.abs(a) < 1e-9) return bboxCenter(poly);
  return [x / (3 * a), y / (3 * a)];
}
export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function bboxCenter(poly) { const b = bbox(poly); return [b.x + b.w / 2, b.y + b.h / 2]; }

export function rectPoly([x, y, w, h]) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }

const r1 = (v) => Math.round(v * 10) / 10;
export function polyToPath(poly) {
  if (!poly.length) return '';
  return 'M ' + poly.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L ') + ' Z';
}

// ---------- rooms ----------
// R(code, name, type, wing, capacity, schedulable, rect)
const R = (code, name, type, wing, cap, sched, rect) => ({ code, name, type, wing, cap, sched, rect });

// Bands shared by every floor
export const BANDS = {
  hall: [430, 570],         // central hall / gallery y-range
  corridorN: [300, 330],    // north inner corridor
  corridorS: [670, 700],    // south inner corridor
  coreX: [470, 580],        // east strip of cores
};

export const FLOOR1 = [
  // north wing — outer band along the sweeping façade
  R('101', 'Lecture Hall "Alpha"', 'lecture', 'north', 120, true, [20, 40, 215, 260]),
  R('102', 'Open Space Coworking', 'coworking', 'north', 80, false, [235, 40, 120, 260]),
  R('103', 'Canteen', 'service', 'north', 120, false, [355, 40, 225, 165]),
  R('103A', 'Kitchen', 'service', 'north', null, false, [355, 205, 115, 95]),
  // north wing — inner band along the hall
  R('108', 'Wardrobe North', 'service', 'north', null, false, [20, 330, 90, 100]),
  R('104', 'Student Service Center', 'admin', 'north', 12, false, [110, 330, 100, 100]),
  R('105', 'Medical Point', 'service', 'north', 4, false, [210, 330, 50, 100]),
  R('106', 'Admissions Office', 'admin', 'north', 10, false, [260, 330, 60, 100]),
  R('WC-N1', 'Restrooms North', 'service', 'north', null, false, [320, 330, 80, 100]),
  R('107', 'Meeting Room "Bereke"', 'seminar', 'north', 8, true, [400, 330, 70, 100]),
  // core
  R('CORE-N1', 'Stairs SF-1 + Elevators', 'service', 'core', null, false, [470, 205, 110, 190]),
  R('109', 'Security & Dispatch', 'service', 'core', 3, false, [470, 395, 110, 35]),
  R('LOBBY', 'Main Lobby', 'service', 'core', null, false, [20, 430, 560, 140]),
  R('100', 'Info Desk', 'service', 'core', null, false, [270, 475, 60, 50]),
  R('CORE-S1', 'Stairs SF-2 + Elevator P-1', 'service', 'core', null, false, [470, 570, 110, 230]),
  // south wing — inner band
  R('117', 'Wardrobe South', 'service', 'south', null, false, [20, 570, 80, 100]),
  R('114', 'Career Center', 'admin', 'south', 8, false, [100, 570, 90, 100]),
  R('115', 'Student Clubs Office', 'admin', 'south', 8, false, [190, 570, 90, 100]),
  R('WC-S1', 'Restrooms South', 'service', 'south', null, false, [280, 570, 90, 100]),
  R('116', 'Print & Copy Center', 'service', 'south', null, false, [370, 570, 100, 100]),
  // south wing — outer band
  R('110', 'Assembly Hall "Aula"', 'lecture', 'south', 220, true, [20, 700, 190, 290]),
  R('112', 'Skywalkers Robotics Lab', 'lab', 'south', 30, true, [210, 700, 110, 290]),
  R('113', 'Library & Reading Room', 'coworking', 'south', 60, false, [320, 700, 150, 100]),
  R('111', 'Lecture Hall "Beta"', 'lecture', 'south', 90, true, [320, 800, 260, 190]),
];

export const FLOOR2 = [
  R('201', "Dean's Office", 'admin', 'north', 6, false, [20, 40, 170, 260]),
  R('202', 'Dept. of Computer Science', 'admin', 'north', 12, false, [190, 40, 100, 260]),
  R('203', 'Dept. of Cybersecurity', 'admin', 'north', 10, false, [290, 40, 90, 260]),
  R('204', 'Dept. of Data Science & AI', 'admin', 'north', 10, false, [380, 40, 90, 260]),
  R('205', 'Faculty Meeting Room', 'seminar', 'north', 16, true, [470, 40, 110, 165]),
  R('209', "Teachers' Lounge", 'service', 'north', 12, false, [20, 330, 90, 100]),
  R('207', 'Classroom 207', 'seminar', 'north', 24, true, [110, 330, 100, 100]),
  R('208', 'Classroom 208', 'seminar', 'north', 24, true, [210, 330, 100, 100]),
  R('WC-N2', 'Restrooms North', 'service', 'north', null, false, [310, 330, 80, 100]),
  R('206', 'Server Room', 'service', 'north', null, false, [390, 330, 80, 100]),
  R('CORE-N2', 'Stairs SF-1 + Elevators', 'service', 'core', null, false, [470, 205, 110, 225]),
  R('200', 'Study Lounge (atrium gallery)', 'coworking', 'core', 40, false, [20, 430, 560, 140]),
  R('ATRIUM', 'Atrium void', 'void', 'core', null, false, [200, 450, 180, 100]),
  R('CORE-S2', 'Stairs SF-2 + Elevator P-1', 'service', 'core', null, false, [470, 570, 110, 230]),
  R('210', 'Samsung Innovation Lab', 'lab', 'south', 30, true, [20, 570, 130, 100]),
  R('211', 'Astana Hub Startup Lab', 'lab', 'south', 30, true, [150, 570, 120, 100]),
  R('WC-S2', 'Restrooms South', 'service', 'south', null, false, [270, 570, 80, 100]),
  R('218', 'Classroom 218', 'seminar', 'south', 20, true, [350, 570, 60, 100]),
  R('219', 'Language Lab', 'lab', 'south', 20, true, [410, 570, 60, 100]),
  R('213', 'Lecture Hall "Gamma"', 'lecture', 'south', 100, true, [20, 700, 190, 290]),
  R('212', 'Skywalkers Mezzanine', 'void', 'south', null, false, [215, 720, 100, 230]),
  R('214', 'Classroom 214', 'seminar', 'south', 30, true, [320, 700, 80, 100]),
  R('215', 'Classroom 215', 'seminar', 'south', 30, true, [400, 700, 70, 100]),
  R('216', 'Computer Lab 1', 'lab', 'south', 25, true, [320, 800, 130, 190]),
  R('217', 'Computer Lab 2', 'lab', 'south', 25, true, [450, 800, 130, 190]),
];

function typicalFloor(f, names) {
  return [
    R(`${f}01`, names.lecN, 'lecture', 'north', 100, true, [20, 40, 190, 260]),
    R(`${f}02`, `Classroom ${f}02`, 'seminar', 'north', 30, true, [210, 40, 110, 260]),
    R(`${f}03`, `Classroom ${f}03`, 'seminar', 'north', 30, true, [320, 40, 150, 260]),
    R(`${f}04`, `Classroom ${f}04`, 'seminar', 'north', 30, true, [470, 40, 110, 165]),
    R(`${f}05`, `Classroom ${f}05`, 'seminar', 'north', 30, true, [20, 330, 170, 100]),
    R(`${f}06`, names.office, 'admin', 'north', 10, false, [190, 330, 120, 100]),
    R(`WC-N${f}`, 'Restrooms North', 'service', 'north', null, false, [310, 330, 80, 100]),
    R(`TECH-N${f}`, 'Technical', 'service', 'north', null, false, [390, 330, 80, 100]),
    R(`CORE-N${f}`, 'Stairs SF-1 + Elevators', 'service', 'core', null, false, [470, 205, 110, 225]),
    R(`${f}07`, 'Study Lounge', 'coworking', 'core', 30, false, [200, 450, 180, 100]),
    R(`CORE-S${f}`, 'Stairs SF-2 + Elevator P-1', 'service', 'core', null, false, [470, 570, 110, 230]),
    R(`${f}13`, names.lab, 'lab', 'south', 20, true, [20, 570, 150, 100]),
    R(`${f}14`, 'Project Room', 'seminar', 'south', 12, true, [170, 570, 100, 100]),
    R(`WC-S${f}`, 'Restrooms South', 'service', 'south', null, false, [270, 570, 80, 100]),
    R(`TECH-S${f}`, 'Technical', 'service', 'south', null, false, [350, 570, 120, 100]),
    R(`${f}08`, names.lecS, 'lecture', 'south', 100, true, [20, 700, 190, 290]),
    R(`${f}09`, `Classroom ${f}09`, 'seminar', 'south', 30, true, [210, 700, 110, 290]),
    R(`${f}10`, `Classroom ${f}10`, 'seminar', 'south', 30, true, [320, 700, 130, 140]),
    R(`${f}11`, `Classroom ${f}11`, 'seminar', 'south', 30, true, [320, 840, 130, 150]),
    R(`${f}12`, names.clab, 'lab', 'south', 25, true, [450, 800, 130, 190]),
  ];
}

export const FLOOR3 = typicalFloor(3, { lecN: 'Lecture Hall "Delta"', lecS: 'Lecture Hall "Zeta"', office: 'Dept. of Mathematics', lab: 'Cyber Range Lab', clab: 'Computer Lab 3' });
export const FLOOR4 = typicalFloor(4, { lecN: 'Lecture Hall "Epsilon"', lecS: 'Lecture Hall "Theta"', office: 'Dept. of IT Management', lab: 'AI & GPU Lab', clab: 'Computer Lab 4' });

export const FLOORS = { 1: FLOOR1, 2: FLOOR2, 3: FLOOR3, 4: FLOOR4 };

// Resolve room polygons (clipped to outline), centroids and bboxes
export function resolveFloor(n) {
  return FLOORS[n].map((r) => {
    const poly = clipPolygon(rectPoly(r.rect));
    const c = polyCentroid(poly);
    return { ...r, floor: n, poly, path: polyToPath(poly), bbox: bbox(poly), cx: c[0], cy: c[1] };
  });
}

export function zonePaths() {
  const [h0, h1] = BANDS.hall;
  return {
    north: polyToPath(clipPolygon(rectPoly([0, 0, 600, h0]))),
    hall: polyToPath(clipPolygon(rectPoly([0, h0, 600, h1 - h0]))),
    south: polyToPath(clipPolygon(rectPoly([0, h1, 600, 1000 - h1]))),
    corridorN: polyToPath(clipPolygon(rectPoly([0, BANDS.corridorN[0], BANDS.coreX[0], 30]))),
    corridorS: polyToPath(clipPolygon(rectPoly([0, BANDS.corridorS[0], BANDS.coreX[0], 30]))),
  };
}

export function entrancePaths() {
  // W entrance straddles the west façade at the hall's centre; E entrance on the straight façade
  return {
    w: polyToPath(clipPolygon(rectPoly([0, 470, 42, 60]))),
    e: polyToPath(clipPolygon(rectPoly([556, 470, 44, 60]))),
  };
}

export const schedulableCodes = (n) => FLOORS[n].filter((r) => r.sched).map((r) => r.code);
