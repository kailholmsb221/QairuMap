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
  OUTLINE_DS,
  OUTLINE_POLYS,
  bbox,
  polyArea,
  polyFor,
  polyToPath,
  rectPath,
  TRACED,
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
function insideOutline(p, n, tol = 1.5) {
  const poly = OUTLINE_POLYS[n];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  if (inside) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
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

/**
 * Traced rooms come from the plan itself, so they are only checked for a usable
 * footprint. The fallback rectangles are additionally held to the old rule that
 * they must not overlap a neighbour — the plan cannot arbitrate for them.
 */
function check(n) {
  const problems = [];
  const cores = CORES[n].map((c) => ({
    code: `CORE-${c.id === 'core-n' ? 'N' : 'S'}${n}`,
    rect: c.rect,
  }));
  const all = [...FLOORS[n].map((r) => ({ code: r.code, rect: r.rect })), ...cores];
  if (n === 2) all.push({ code: 'VOID-2', rect: ATRIUM_RECT });

  const fallbacks = [];
  for (const r of all) {
    const traced = !!TRACED[n]?.rooms?.[r.code];
    const poly = polyFor(r.code, r.rect, n);
    if (!traced) fallbacks.push({ ...r, poly });
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
    const out = poly.filter((p) => !insideOutline(p, n));
    if (out.length) problems.push(`${r.code}: ${out.length} vertices fall outside the outline`);
  }

  for (let i = 0; i < fallbacks.length; i++) {
    for (let j = i + 1; j < fallbacks.length; j++) {
      const a = fallbacks[i];
      const b = fallbacks[j];
      if (CONTAINERS.has(a.code) || CONTAINERS.has(b.code)) continue;
      const ox = Math.min(a.rect[0] + a.rect[2], b.rect[0] + b.rect[2]) - Math.max(a.rect[0], b.rect[0]);
      const oy = Math.min(a.rect[1] + a.rect[3], b.rect[1] + b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
      if (ox > 0.5 && oy > 0.5) problems.push(`${a.code} overlaps ${b.code}`);
    }
  }
  return problems;
}

function roomPath(r, n) {
  const d = polyToPath(polyFor(r.code, r.rect, n));
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
  const z = zonePaths(n);
  const rooms = FLOORS[n].map((r) => roomPath(r, n)).join('\n');
  const cores = CORES[n]
    .map((c) => `    <path id="${c.id}" data-name="${esc(c.nameEn)}" d="${rectPath(c.rect, n)}"/>`)
    .join('\n');
  const landmarks = LANDMARKS[n]
    .map((l) => `    <use id="${l.id}" href="#icon-stairs" x="${l.x}" y="${l.y}"/>`)
    .join('\n');
  const entrances = ENTRANCES.map(
    (e) =>
      `    <path id="${e.id}"${e.main ? ' data-main="true"' : ''} d="${rectPath(e.rect, n)}"/>`,
  ).join('\n');
  const atrium =
    n === 2 ? `\n  <path id="atrium" d="${polyToPath(polyFor('VOID-2', ATRIUM_RECT, 2))}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" data-floor="${n}" data-building="${BUILDING}">
  <path id="outline" d="${OUTLINE_DS[n]}"/>
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
