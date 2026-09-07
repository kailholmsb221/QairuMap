// SVG renderers for one floor plate — used by the 2.5D scene, the focus view and the flat plans.
import { OUTLINE_D, BANDS, resolveFloor, zonePaths, entrancePaths, polyToPath, clipPolygon, rectPoly } from './geometry.mjs';

export const T = {
  bg: '#0B0F17', bgElev: '#111826', panel: 'rgba(255,255,255,.04)', line: 'rgba(255,255,255,.08)',
  text: '#E6EAF2', dim: '#8B94A7', accent: '#5EEAD4',
  live: '#2DD4BF', soon: '#FBBF24', ending: '#FB923C', cancelled: '#F87171', moved: '#A78BFA', delayed: '#F59E0B',
  roomFree: 'rgba(255,255,255,.10)',
  wingN: 'rgba(96,165,250,.06)', wingS: 'rgba(244,114,182,.06)', wingC: 'rgba(134,239,172,.05)',
  slab: '#161E2E', slabEdge: '#0A0E16', slabTop: 'rgba(255,255,255,.12)',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function coreGlyph(r, idPrefix, flat) {
  const [x, y, w, h] = r.rect;
  const isN = r.code.startsWith('CORE-N');
  const label = isN ? 'SF-1' : 'SF-2';
  const lines = [];
  // stairs box
  const sx = x + 10, sy = y + 14, sw = 56, sh = 92;
  lines.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/>`);
  for (let i = 1; i < 8; i++) lines.push(`<line x1="${sx}" y1="${sy + (sh / 8) * i}" x2="${sx + sw}" y2="${sy + (sh / 8) * i}" stroke="rgba(255,255,255,.22)" stroke-width="1"/>`);
  lines.push(`<line x1="${sx + sw / 2}" y1="${sy}" x2="${sx + sw / 2}" y2="${sy + sh}" stroke="rgba(255,255,255,.22)" stroke-width="1"/>`);
  // elevators
  const ex = x + 76, ew = 24;
  const lifts = isN ? [sy, sy + 34] : [sy];
  for (const ey of lifts) {
    lines.push(`<rect x="${ex}" y="${ey}" width="${ew}" height="${ew}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/>`);
    lines.push(`<path d="M ${ex} ${ey} L ${ex + ew} ${ey + ew} M ${ex + ew} ${ey} L ${ex} ${ey + ew}" stroke="rgba(255,255,255,.18)" stroke-width="1"/>`);
  }
  const text = flat ? `<text x="${x + w / 2}" y="${y + h - 14}" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" font-weight="600" fill="rgba(255,255,255,.55)" letter-spacing=".08em">${label}</text>` : '';
  return `<g id="${idPrefix}${isN ? 'core-n' : 'core-s'}"${flat ? ` data-name="${esc(r.name)}"` : ''}>` +
    `<path d="${r.path}" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.14)" stroke-width="1"/>${lines.join('')}${text}</g>`;
}

function roomFill(room, phase, opts) {
  if (room.type === 'void') return { fill: T.bg, stroke: 'rgba(255,255,255,.30)', dash: '4 3' };
  if (!room.sched) return { fill: 'rgba(255,255,255,.025)', stroke: 'rgba(255,255,255,.09)' };
  switch (phase) {
    case 'live': case 'delayed': return { fill: opts.mode === 'exploded' ? 'rgba(45,212,191,.38)' : 'rgba(45,212,191,.45)', stroke: 'rgba(45,212,191,.7)' };
    case 'ending': return { fill: 'rgba(251,146,60,.45)', stroke: 'rgba(251,146,60,.75)' };
    case 'soon': return { fill: 'rgba(251,191,36,.35)', stroke: 'rgba(251,191,36,.7)', blink: true };
    case 'conflict': return { fill: 'url(#hatch)', stroke: 'rgba(251,146,60,.75)' };
    default: return { fill: T.roomFree, stroke: 'rgba(255,255,255,.12)' };
  }
}

/**
 * Render one floor as SVG markup.
 * opts: { mode: 'exploded'|'focus'|'flat', phases: {code: phase}, selected, highlight: Set, dimOthers,
 *         width, height, labels: 'none'|'codes'|'full', dots: bool, lit: bool (entrances lit), idPrefix }
 */
export function floorSvg(n, opts = {}) {
  const rooms = resolveFloor(n);
  const phases = opts.phases || {};
  const flat = opts.mode === 'flat';
  const idp = flat ? '' : (opts.idPrefix ?? `f${n}-`);
  const zones = zonePaths();
  const ent = entrancePaths();
  const W = opts.width ?? 600, H = opts.height ?? 1000;
  const hl = opts.highlight || new Set();
  const sel = opts.selected;
  const dimOthers = opts.dimOthers ?? (hl.size > 0 || !!sel);
  const dimTo = hl.size ? 0.35 : 0.5;
  const parts = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" width="${W}" height="${H}" data-floor="${n}" data-building="A" overflow="visible" style="display:block">`);
  parts.push(`<defs><pattern id="${idp}hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="rgba(251,146,60,.18)"/><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(251,146,60,.7)" stroke-width="2"/></pattern></defs>`);
  // slab
  parts.push(`<path id="${idp}outline" d="${OUTLINE_D}" fill="${T.slab}"/>`);
  // zones
  parts.push(`<g id="${idp}zones">` +
    `<path id="${idp}zone-north" d="${zones.north}" fill="${T.wingN}"/>` +
    `<path id="${idp}zone-hall" d="${zones.hall}" fill="${T.wingC}"/>` +
    `<path id="${idp}zone-south" d="${zones.south}" fill="${T.wingS}"/>` +
    `</g>`);
  // corridors
  parts.push(`<g id="${idp}corridors"><path d="${zones.corridorN}" fill="rgba(255,255,255,.035)"/><path d="${zones.corridorS}" fill="rgba(255,255,255,.035)"/></g>`);

  // rooms
  const roomParts = [];
  const hallCodes = new Set(['LOBBY', '200']);
  for (const r of rooms) {
    if (r.code.startsWith('CORE')) continue;
    if (!flat && hallCodes.has(r.code)) continue;
    const phase = phases[r.code] || 'free';
    const f = roomFill(r, phase, opts);
    const isSel = sel === r.code, isHl = hl.has(r.code);
    const dimmed = dimOthers && !isSel && !isHl;
    const attrs = flat
      ? ` data-name="${esc(r.name)}" data-type="${r.type}" data-wing="${r.wing}"${r.cap ? ` data-capacity="${r.cap}"` : ''} data-schedulable="${r.sched}"`
      : ` data-phase="${phase}" data-type="${r.type}"`;
    const fill = hallCodes.has(r.code) ? 'transparent' : (f.fill === 'url(#hatch)' ? `url(#${idp}hatch)` : f.fill);
    let s = `<g${dimmed ? ` opacity="${dimTo}"` : ''}>`;
    s += `<path id="${idp}room-${r.code}"${attrs} d="${r.path}" fill="${fill}" stroke="${f.stroke}" stroke-width="${flat ? 1 : 1}"${f.dash ? ` stroke-dasharray="${f.dash}"` : ''}${f.blink && !flat ? ' class="blink"' : ''}/>`;
    if (r.type === 'void' && r.code === 'ATRIUM') {
      // bridge across the atrium
      const [x, y, w, h] = r.rect;
      s += `<rect x="${x + w / 2 - 12}" y="${y}" width="24" height="${h}" fill="${T.slab}" stroke="rgba(255,255,255,.30)" stroke-width="1" stroke-dasharray="4 3"/>`;
    }
    if (isSel || isHl) {
      s += `<path d="${r.path}" fill="none" stroke="${T.accent}" stroke-width="10" opacity=".22"/>`;
      s += `<path d="${r.path}" fill="none" stroke="${T.accent}" stroke-width="2.5"/>`;
    }
    s += `</g>`;
    roomParts.push(s);
  }
  parts.push(`<g id="${idp}rooms">${roomParts.join('')}</g>`);

  // cores
  const cores = rooms.filter((r) => r.code.startsWith('CORE'));
  parts.push(`<g id="${idp}cores">${cores.map((c) => coreGlyph(c, idp, flat)).join('')}</g>`);

  // entrances (floor 1 only carries doors; other floors keep ids for the schema)
  if (n === 1) {
    const litFill = opts.lit ? 'rgba(251,191,36,.95)' : 'rgba(94,234,212,.55)';
    parts.push(`<g id="${idp}entrances">` +
      `<path id="${idp}entrance-w" data-main="true" d="${ent.w}" fill="${litFill}"/>` +
      `<path id="${idp}entrance-e" d="${ent.e}" fill="${litFill}"/>` +
      (opts.lit ? `<path d="${ent.w}" fill="none" stroke="rgba(251,191,36,.6)" stroke-width="14" opacity=".5"/><path d="${ent.e}" fill="none" stroke="rgba(251,191,36,.6)" stroke-width="14" opacity=".5"/>` : '') +
      `</g>`);
  }
  // atrium id alias (floor 2)
  // lit top edge
  parts.push(`<path d="${OUTLINE_D}" fill="none" stroke="${T.slabTop}" stroke-width="${flat ? 2 : 1.5}"/>`);

  // labels
  if (opts.labels && opts.labels !== 'none') {
    const lab = [];
    for (const r of rooms) {
      if (r.code.startsWith('CORE')) continue;
      const big = r.bbox.w >= 58 && r.bbox.h >= 40;
      if (!big && opts.labels === 'full' && r.bbox.w < 40) continue;
      const isHall = hallCodes.has(r.code);
      const cx = isHall ? 110 : r.cx, cy = r.cy;
      const y0 = cy;
      lab.push(`<text x="${cx.toFixed(1)}" y="${(y0 + (opts.labels === 'full' && big ? -2 : 4)).toFixed(1)}" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-size="${big ? 11 : 9}" font-weight="700" fill="${r.sched ? 'rgba(230,234,242,.92)' : 'rgba(230,234,242,.6)'}" letter-spacing=".06em">${esc(r.code)}</text>`);
      if (opts.labels === 'full' && big) {
        const name = r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name;
        lab.push(`<text x="${cx.toFixed(1)}" y="${(y0 + 11).toFixed(1)}" text-anchor="middle" font-family="Manrope, system-ui, sans-serif" font-size="7.5" fill="rgba(139,148,167,.95)">${esc(name)}</text>`);
      }
    }
    parts.push(`<g id="${idp}labels">${lab.join('')}</g>`);
  }

  // live dots
  if (opts.dots) {
    const d = [];
    for (const r of rooms) {
      const p = phases[r.code];
      if (!r.sched || !p || p === 'free') continue;
      const col = p === 'ending' ? T.ending : p === 'soon' ? T.soon : T.live;
      const dimmed = dimOthers && sel !== r.code && !hl.has(r.code);
      d.push(`<g${dimmed ? ` opacity="${dimTo}"` : ''}><circle cx="${r.cx.toFixed(1)}" cy="${r.cy.toFixed(1)}" r="6" fill="${col}" class="pulse" opacity=".9"/><circle cx="${r.cx.toFixed(1)}" cy="${r.cy.toFixed(1)}" r="4" fill="${col}"/></g>`);
    }
    parts.push(`<g id="${idp}dots">${d.join('')}</g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

// Under-slab (thickness) — same outline, darker
export function slabUnderSvg(W = 600, H = 1000) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" width="${W}" height="${H}" overflow="visible" style="display:block"><path d="${OUTLINE_D}" fill="${T.slabEdge}" stroke="rgba(0,0,0,.6)" stroke-width="2"/></svg>`;
}

// Clean export SVG (flat plan, exact ids, no effects)
export function exportFloorSvg(n) {
  const rooms = resolveFloor(n);
  const zones = zonePaths();
  const ent = entrancePaths();
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" data-floor="${n}" data-building="A">`);
  out.push(`  <path id="outline" d="${OUTLINE_D}"/>`);
  out.push(`  <g id="zones">`);
  out.push(`    <path id="zone-hall" d="${zones.hall}"/>`);
  out.push(`    <path id="zone-north" d="${zones.north}"/>`);
  out.push(`    <path id="zone-south" d="${zones.south}"/>`);
  out.push(`  </g>`);
  out.push(`  <g id="rooms">`);
  for (const r of rooms) {
    if (r.code.startsWith('CORE') || r.code === 'ATRIUM') continue;
    out.push(`    <path id="room-${r.code}" data-name="${esc(r.name)}" data-type="${r.type}" data-wing="${r.wing}"${r.cap ? ` data-capacity="${r.cap}"` : ''} data-schedulable="${r.sched}" d="${r.path}"/>`);
  }
  out.push(`  </g>`);
  out.push(`  <g id="cores">`);
  for (const c of rooms.filter((r) => r.code.startsWith('CORE'))) {
    out.push(`    <path id="${c.code.startsWith('CORE-N') ? 'core-n' : 'core-s'}" data-name="${esc(c.name)}" d="${c.path}"/>`);
  }
  out.push(`  </g>`);
  out.push(`  <g id="landmarks">`);
  out.push(`    <use id="stairs-sf1" href="#icon-stairs" x="480" y="${n === 1 ? 219 : 219}"/>`);
  out.push(`    <use id="stairs-sf2" href="#icon-stairs" x="480" y="584"/>`);
  out.push(`  </g>`);
  out.push(`  <g id="entrances">`);
  out.push(`    <path id="entrance-w" data-main="true" d="${ent.w}"/>`);
  out.push(`    <path id="entrance-e" d="${ent.e}"/>`);
  out.push(`  </g>`);
  const atrium = rooms.find((r) => r.code === 'ATRIUM');
  if (atrium) out.push(`  <path id="atrium" d="${atrium.path}"/>`);
  out.push(`</svg>`);
  return out.join('\n');
}
