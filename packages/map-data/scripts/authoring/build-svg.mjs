/**
 * svg:author — writes `svg/floor-1.svg` and `svg/floor-2.svg` from the room
 * tables in `geometry.mjs`.
 *
 *   node scripts/authoring/build-svg.mjs        (pnpm --filter @campuslive/map-data run svg:author)
 *
 * The SVGs are the geometry source of truth; `scripts/svg2map.ts` builds
 * `building-a.json` from them. Re-running this regenerates them from the tables,
 * so a hand edit made afterwards is overwritten — see README.md.
 *
 * Sanity checks run before anything is written: every room must survive the clip
 * with a usable footprint, and no two rooms of a band may overlap (the two
 * container spaces, ATRIUM-N and LOBBY, deliberately contain their structures —
 * that is what the photo shows).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATRIUM_RECT,
  CORES,
  ENTRANCES,
  FLOORS,
  LANDMARKS,
  OUTLINE_D,
  OUTLINE_POLY,
  bbox,
  clipRect,
  polyArea,
  polyToPath,
  rectPath,
  rectPoly,
  zonePaths,
} from './geometry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG_DIR = resolve(HERE, '../../svg');

const BUILDING = 'A';
const MIN_SIDE = 26;

/** Spaces that legitimately contain other rooms: the north hall and the lobby. */
const CONTAINERS = new Set(['ATRIUM-N', 'LOBBY']);

const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Ray casting, plus a tolerance band so vertices that sit *on* the façade pass. */
function insideOutline(p, tol = 0.6) {
  let inside = false;
  for (let i = 0, j = OUTLINE_POLY.length - 1; i < OUTLINE_POLY.length; j = i++) {
    const a = OUTLINE_POLY[i];
    const b = OUTLINE_POLY[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  if (inside) return true;
  for (let i = 0, j = OUTLINE_POLY.length - 1; i < OUTLINE_POLY.length; j = i++) {
    const a = OUTLINE_POLY[i];
    const b = OUTLINE_POLY[j];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const ex = a[0] + t * dx - p[0];
    const ey = a[1] + t * dy - p[1];
    if (Math.hypot(ex, ey) <= tol) return true;
  }
  return false;
}

function rectsOverlap(a, b) {
  const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return ox > 0.5 && oy > 0.5;
}

function check(n) {
  const problems = [];
  const rooms = FLOORS[n];
  const cores = CORES[n].map((c) => ({ code: `CORE-${c.id === 'core-n' ? 'N' : 'S'}${n}`, rect: c.rect }));
  const all = [...rooms.map((r) => ({ code: r.code, rect: r.rect })), ...cores];
  if (n === 2) all.push({ code: 'VOID-2', rect: ATRIUM_RECT });

  for (const r of all) {
    const poly = clipRect(r.rect);
    if (poly.length < 3) {
      problems.push(`${r.code}: clipped away entirely`);
      continue;
    }
    const b = bbox(poly);
    if (b.w < MIN_SIDE || b.h < MIN_SIDE) {
      problems.push(`${r.code}: ${b.w.toFixed(0)}×${b.h.toFixed(0)} is below ${MIN_SIDE}×${MIN_SIDE}`);
    }
    if (polyArea(poly) < MIN_SIDE * MIN_SIDE) {
      problems.push(`${r.code}: visible area ${polyArea(poly).toFixed(0)} is too small`);
    }
    if (polyArea(poly) > polyArea(rectPoly(r.rect)) + 0.5) {
      problems.push(`${r.code}: clip grew the shape — the clipper is wrong`);
    }
    const out = poly.filter((p) => !insideOutline(p));
    if (out.length) problems.push(`${r.code}: ${out.length} vertices fall outside the outline`);
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (CONTAINERS.has(a.code) || CONTAINERS.has(b.code)) continue;
      if (rectsOverlap(a.rect, b.rect)) problems.push(`${a.code} overlaps ${b.code}`);
    }
  }
  return problems;
}

function roomPath(r) {
  const d = rectPath(r.rect);
  const attrs = [
    `id="room-${r.code}"`,
    `data-name="${esc(r.nameEn)}"`,
    `data-type="${r.type}"`,
    `data-wing="${r.wing}"`,
  ];
  if (r.capacity != null) attrs.push(`data-capacity="${r.capacity}"`);
  attrs.push(`data-schedulable="${r.schedulable ? 'true' : 'false'}"`);
  attrs.push(`d="${d}"`);
  return `    <path ${attrs.join(' ')}/>`;
}

function floorSvg(n) {
  const z = zonePaths();
  const rooms = FLOORS[n].map(roomPath).join('\n');
  const cores = CORES[n]
    .map((c) => `    <path id="${c.id}" data-name="${esc(c.nameEn)}" d="${rectPath(c.rect)}"/>`)
    .join('\n');
  const landmarks = LANDMARKS[n]
    .map((l) => `    <use id="${l.id}" href="#icon-stairs" x="${l.x}" y="${l.y}"/>`)
    .join('\n');
  const entrances = ENTRANCES.map(
    (e) =>
      `    <path id="${e.id}"${e.main ? ' data-main="true"' : ''} d="${rectPath(e.rect)}"/>`,
  ).join('\n');
  const atrium = n === 2 ? `\n  <path id="atrium" d="${polyToPath(clipRect(ATRIUM_RECT))}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" data-floor="${n}" data-building="${BUILDING}">
  <path id="outline" d="${OUTLINE_D}"/>
  <g id="zones">
    <path id="zone-north" d="${z.north}"/>
    <path id="zone-hall" d="${z.hall}"/>
    <path id="zone-south" d="${z.south}"/>
  </g>
  <g id="rooms">
${rooms}
  </g>
  <g id="cores">
${cores}
  </g>
  <g id="landmarks">
${landmarks}
  </g>
  <g id="entrances">
${entrances}
  </g>${atrium}
</svg>
`;
}

async function main() {
  const problems = [];
  for (const n of [1, 2]) problems.push(...check(n).map((p) => `floor ${n}: ${p}`));
  if (problems.length) {
    console.error(`\nsvg:author FAILED\n  ${problems.join('\n  ')}\n`);
    process.exit(1);
  }

  await mkdir(SVG_DIR, { recursive: true });
  for (const n of [1, 2]) {
    const file = resolve(SVG_DIR, `floor-${n}.svg`);
    await writeFile(file, floorSvg(n), 'utf8');
    const extra = (n === 2 ? 1 : 0) + CORES[n].length;
    console.log(`svg:author → ${file}  (${FLOORS[n].length + extra} spaces)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
