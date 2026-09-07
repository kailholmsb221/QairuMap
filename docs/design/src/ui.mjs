// Shared UI pieces for every CampusLive artboard (static .dc.html markup)
import { T, floorSvg, slabUnderSvg } from './plan.mjs';
import { OUTLINE_POLY, resolveFloor } from './geometry.mjs';

export const FONT_UI = "Manrope, 'Segoe UI', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

export const M1080 = {
  W: 1920, H: 1080, pad: 16, gap: 16, headerH: 64, tickerH: 40, boardW: 560, radius: 12,
  clock: 44, clockSub: 12, brand: 17, brandSub: 12,
  tabH: 32, tabFont: 13, btnH: 40,
  rowH: 60, rowTitle: 18, rowSub: 13, flap: 20, flapCell: 13, flapH: 30, pillFont: 12, pillW: 96,
  sectionHead: 40, dots: 22, nowRows: 7, nextRows: 5, boardPad: 16,
  tickerFont: 15, legendFont: 12, chipFont: 13,
};
export const M720 = {
  W: 1280, H: 720, pad: 12, gap: 12, headerH: 52, tickerH: 34, boardW: 430, radius: 10,
  clock: 30, clockSub: 10, brand: 14, brandSub: 10,
  tabH: 26, tabFont: 11, btnH: 32,
  rowH: 46, rowTitle: 14, rowSub: 11, flap: 15, flapCell: 10, flapH: 23, pillFont: 10, pillW: 80,
  sectionHead: 32, dots: 18, nowRows: 5, nextRows: 4, boardPad: 12,
  tickerFont: 12, legendFont: 10, chipFont: 11,
};

export const stageSize = (m) => ({
  w: m.W - 2 * m.pad - m.gap - m.boardW,
  h: m.H - 2 * m.pad - m.headerH - m.tickerH - 2 * m.gap,
});

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- helmet ----------
export function helmet(extra = '') {
  return `<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600;700&amp;display=swap">
  <style>
    body { margin: 0; background: ${T.bg}; color: ${T.text}; font-family: ${FONT_UI}; -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
    a { color: ${T.accent}; } a:hover { color: #99F6E4; }
    .mono { font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; }
    .flap { position: relative; display: inline-flex; align-items: center; justify-content: center; background: ${T.slabEdge}; border-radius: 3px; font-family: ${FONT_MONO}; font-weight: 600; box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
    .flap::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(0,0,0,.75); }
    .pill { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: ${FONT_MONO}; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-radius: 6px; white-space: nowrap; }
    @keyframes pulse { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(2.2); opacity: 0; } }
    .pulse { transform-box: fill-box; transform-origin: center; animation: pulse 2s ease-out infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }
    .blink { animation: blink 1s steps(2, end) infinite; }
    @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    .marquee { display: flex; gap: 0; width: max-content; animation: marquee 48s linear infinite; }
    .marquee:hover { animation-play-state: paused; }
    @keyframes ringspin { to { stroke-dashoffset: 0; } }
    @media (prefers-reduced-motion: reduce) { .pulse, .blink, .marquee { animation: none; } }
    ${extra}
  </style>
</helmet>`;
}

export function wrapDoc(body, extraCss = '') {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
${helmet(extraCss)}
${body}
</x-dc>
</body>
</html>
`;
}

// ---------- icons (stroke, 20px grid) ----------
const ico = (d, size = 18, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none"${extra}>${d}</svg>`;
export const ICON = {
  search: (s) => ico('<circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5 17 17"/>', s),
  theme: (s) => ico('<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" stroke="none"/>', s),
  kiosk: (s) => ico('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>', s),
  close: (s) => ico('<path d="M5 5l10 10M15 5 5 15"/>', s),
  map: (s) => ico('<path d="M3 5l5-2 4 2 5-2v12l-5 2-4-2-5 2z"/><path d="M8 3v12M12 5v12"/>', s),
  live: (s) => ico('<circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none"/><path d="M5.5 5.5a6.5 6.5 0 0 0 0 9M14.5 5.5a6.5 6.5 0 0 1 0 9"/>', s),
  warn: (s) => ico('<path d="M10 3 18 17H2z"/><path d="M10 8v4M10 14.5v.5"/>', s),
  feed: (s) => ico('<path d="M3 6h14M3 10h10M3 14h7"/>', s),
  retry: (s) => ico('<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3v4h-4"/>', s),
  grid: (s) => ico('<circle cx="5" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="15" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="15" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/>', s),
  arrow: (s) => ico('<path d="M4 10h12M11 5l5 5-5 5"/>', s),
  clock: (s) => ico('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 1.5"/>', s),
  users: (s) => ico('<circle cx="8" cy="7" r="3"/><path d="M2.5 16a5.5 5.5 0 0 1 11 0"/><path d="M13 4.5a3 3 0 0 1 0 5.5M14.5 11a5 5 0 0 1 3 4.5"/>', s),
  chevron: (s) => ico('<path d="M7 4l6 6-6 6"/>', s),
};

// Logo mark: the building silhouette in a rounded tile
export function logoMark(size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 30 30" style="display:block;flex:none"><rect width="30" height="30" rx="8" fill="rgba(94,234,212,.14)"/><g transform="translate(9 5) scale(0.02)">
    <path d="M 320 40 L 545 40 Q 580 40 580 75 L 580 925 Q 580 960 545 960 L 260 984 C 140 986 44 900 34 770 Q 10 585 24 400 C 16 240 140 80 320 40 Z" fill="${T.accent}"/>
    <rect x="0" y="430" width="600" height="140" fill="rgba(11,15,23,.85)"/></g></svg>`;
}

// ---------- split flap ----------
export function flap(text, m, opts = {}) {
  const cellW = opts.cellW ?? Math.round(m.flap * 0.6) + 2;
  const h = opts.h ?? m.flapH;
  const font = opts.font ?? m.flap;
  const color = opts.color ?? T.text;
  const cells = [...text].map((ch) => {
    const narrow = ch === ':' || ch === '.';
    return `<span class="flap" style="width:${narrow ? Math.round(cellW * 0.5) : cellW}px;height:${h}px;font-size:${font}px;color:${color}">${esc(ch)}</span>`;
  });
  return `<span style="display:inline-flex;gap:2px;flex:none">${cells.join('')}</span>`;
}

// ---------- status pills ----------
export const STATUS = {
  live: { label: 'LIVE', c: T.live },
  ending: { label: 'ENDS 3 MIN', c: T.ending },
  soon: { label: 'IN 4 MIN', c: T.soon, blink: true },
  upcoming: { label: 'STARTS 11:00', c: T.soon, outline: true },
  cancelled: { label: 'CANCELLED', c: T.cancelled },
  moved: { label: 'MOVED → 214', c: T.moved },
  delayed: { label: 'DELAYED +15', c: T.delayed },
};
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
export function pill(kind, m, label, opts = {}) {
  const s = STATUS[kind];
  const c = s.c;
  const bg = s.outline ? 'transparent' : hexA(c, 0.16);
  const border = s.outline ? hexA(c, 0.55) : hexA(c, 0.35);
  const font = opts.font ?? m.pillFont;
  const h = opts.h ?? Math.round(m.flapH * 0.93);
  const minW = opts.minW ?? m.pillW;
  return `<span class="pill${s.blink ? ' blink' : ''}" style="min-width:${minW}px;height:${h}px;padding:0 10px;font-size:${font}px;color:${c};background:${bg};border:1px solid ${border}">${esc(label ?? s.label)}</span>`;
}

// ---------- board row ----------
export function boardRow(row, m, opts = {}) {
  const last = opts.last;
  const cancelled = row.status === 'cancelled';
  const titleStyle = `font-size:${m.rowTitle}px;font-weight:700;color:${cancelled ? T.dim : T.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${cancelled ? 'text-decoration:line-through;' : ''}`;
  const code = `<span class="mono" style="color:${T.dim};font-weight:600;margin-right:8px">${esc(row.course)}</span>`;
  const sub = [row.teacher, row.groups, row.until && row.status !== 'ending' ? `→ ${row.until}` : null].filter(Boolean).join(' · ');
  const warn = row.conflict ? `<span title="Schedule conflict" style="display:inline-flex;color:${T.ending};margin-left:6px;vertical-align:-3px">${ICON.warn(14)}</span>` : '';
  const room = row.movedTo ? `${flap(row.room, m)}` : flap(row.room, m);
  return `<div style="display:flex;align-items:center;gap:${Math.round(m.rowH * 0.2)}px;height:${m.rowH}px;padding:0 4px;border-bottom:1px solid ${last ? 'transparent' : T.line}">
    ${flap(row.time, m)}
    ${room}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px">
      <div style="${titleStyle}">${code}${esc(row.title)}${warn}</div>
      <div class="mono" style="font-size:${m.rowSub}px;color:${T.dim};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sub)}</div>
    </div>
    ${pill(row.status, m, row.statusLabel)}
  </div>`;
}

export function sectionHeader(title, count, note, m, opts = {}) {
  return `<div style="display:flex;align-items:baseline;gap:10px;height:${m.sectionHead}px;padding:0 4px;border-bottom:1px solid rgba(94,234,212,.45)">
    <span class="mono" style="font-size:${Math.round(m.rowTitle * 0.78)}px;font-weight:800;letter-spacing:.14em;color:${T.accent}">${esc(title)}</span>
    <span class="mono" style="font-size:${Math.round(m.rowTitle * 0.78)}px;font-weight:600;color:${T.dim}">· ${esc(count)}</span>
    <span style="flex:1"></span>
    ${opts.badge ?? ''}
    <span class="mono" style="font-size:${m.rowSub}px;color:${T.dim};letter-spacing:.04em">${esc(note)}</span>
  </div>`;
}

export function pageDots(total, current, m) {
  const d = [];
  for (let i = 0; i < total; i++) d.push(`<span style="width:6px;height:6px;border-radius:99px;background:${i === current ? T.accent : 'rgba(255,255,255,.18)'}"></span>`);
  return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;height:${m.dots}px">${d.join('')}</div>`;
}

export function boardSection(title, count, note, rows, m, nRows, page, pages, opts = {}) {
  const items = rows.slice(0, nRows).map((r, i, a) => boardRow(r, m, { last: i === a.length - 1 })).join('');
  const emptyRows = opts.noFill ? 0 : Math.max(0, nRows - rows.length);
  const filler = emptyRows ? `<div style="height:${emptyRows * m.rowH}px"></div>` : '';
  return `<section style="display:flex;flex-direction:column">
    ${sectionHeader(title, count, note, m, opts)}
    <div style="display:flex;flex-direction:column">${items}${filler}</div>
    ${pages > 1 ? pageDots(pages, page, m) : `<div style="height:${m.dots}px"></div>`}
  </section>`;
}

// ---------- header ----------
export function floorTabs(state, m, opts = {}) {
  const counts = state.floorBusy; // [all,1,2,3,4]
  const labels = ['All', '1', '2', '3', '4'];
  const tabs = labels.map((l, i) => {
    const active = (state.focusFloor ?? 0) === i;
    return `<div style="display:flex;align-items:center;gap:7px;height:${m.tabH}px;padding:0 ${Math.round(m.tabH * 0.38)}px;border-radius:7px;background:${active ? 'rgba(94,234,212,.14)' : 'transparent'};color:${active ? T.accent : T.dim}">
      <span class="mono" style="font-size:${m.tabFont}px;font-weight:700;letter-spacing:.04em">${l}</span>
      <span class="mono" style="font-size:${m.tabFont - 2}px;font-weight:600;padding:1px 6px;border-radius:99px;background:${active ? 'rgba(94,234,212,.18)' : 'rgba(255,255,255,.07)'};color:${active ? T.accent : T.text}">${counts[i]}</span>
    </div>`;
  });
  return `<div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid ${T.line}">${tabs.join('')}</div>`;
}

export function iconButton(icon, m, opts = {}) {
  const h = opts.h ?? m.btnH;
  return `<div style="display:flex;align-items:center;justify-content:center;width:${h}px;height:${h}px;border-radius:9px;border:1px solid ${T.line};background:rgba(255,255,255,.03);color:${opts.color ?? T.dim}">${icon}</div>`;
}

export function langSwitch(m, active = 'EN') {
  return `<div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:9px;border:1px solid ${T.line};background:rgba(255,255,255,.03)">${['RU', 'KZ', 'EN'].map((l) => `<span class="mono" style="display:flex;align-items:center;height:${m.btnH - 8}px;padding:0 9px;border-radius:6px;font-size:${m.tabFont - 1}px;font-weight:700;letter-spacing:.06em;color:${l === active ? T.text : T.dim};background:${l === active ? 'rgba(255,255,255,.08)' : 'transparent'}">${l}</span>`).join('')}</div>`;
}

export function header(state, m) {
  const sim = state.simulated;
  const clockColor = sim ? T.soon : T.text;
  const clockBlock = `<div style="display:flex;align-items:center;gap:14px">
      <span class="mono" style="font-size:${m.clock}px;font-weight:600;line-height:1;letter-spacing:-.01em;color:${clockColor}">${esc(state.clock)}</span>
      <div style="display:flex;flex-direction:column;gap:3px">
        <span class="mono" style="font-size:${m.clockSub}px;font-weight:600;letter-spacing:.12em;color:${T.dim}">${esc(state.date)}</span>
        <span class="mono" style="font-size:${m.clockSub}px;font-weight:600;letter-spacing:.12em;color:${T.dim}">${esc(state.week)}</span>
      </div>
      ${sim ? `<span class="pill" style="height:${m.tabH - 6}px;padding:0 10px;font-size:${m.tabFont - 2}px;color:${T.soon};background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.4)">Simulated</span>
      <div style="display:flex;align-items:center;gap:8px;height:${m.tabH}px;padding:0 12px;border-radius:8px;background:rgba(94,234,212,.14);border:1px solid rgba(94,234,212,.45);color:${T.accent}">${ICON.live(16)}<span class="mono" style="font-size:${m.tabFont}px;font-weight:800;letter-spacing:.1em">LIVE</span></div>` : ''}
    </div>`;
  const brand = `<div style="display:flex;align-items:center;gap:12px">
      ${logoMark(Math.round(m.headerH * 0.47))}
      <div style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:${m.brand}px;font-weight:800;letter-spacing:-.01em;line-height:1.1">CampusLive</span>
        <span style="font-size:${m.brandSub}px;color:${T.dim};font-weight:500;line-height:1.1">Main Academic Building · Block A</span>
      </div>
    </div>`;
  const sep = `<div style="width:1px;height:${Math.round(m.headerH * 0.5)}px;background:${T.line}"></div>`;
  const right = state.kiosk ? '' : `
    <div style="display:flex;align-items:center;gap:10px;height:${m.btnH}px;padding:0 12px 0 12px;border-radius:9px;border:1px solid ${T.line};background:rgba(255,255,255,.03);color:${T.dim}">
      ${ICON.search(16)}<span style="font-size:${m.tabFont}px;font-weight:600">Search</span>
      <span class="mono" style="font-size:${m.tabFont - 2}px;font-weight:600;padding:2px 6px;border-radius:5px;border:1px solid ${T.line};color:${T.dim}">⌘K</span>
    </div>
    ${langSwitch(m)}
    ${iconButton(ICON.theme(16), m)}
    ${iconButton(ICON.kiosk(16), m)}`;
  const tabs = state.kiosk ? kioskFloorIndicator(state, m) : floorTabs(state, m);
  return `<header style="grid-column:1 / -1;display:flex;align-items:center;gap:20px;height:${m.headerH}px;padding:0 6px">
    ${brand}${sep}${clockBlock}
    <div style="flex:1"></div>
    ${tabs}
    <div style="flex:1"></div>
    ${right}
  </header>`;
}

function kioskFloorIndicator(state, m) {
  const f = state.focusFloor;
  const pct = state.kioskProgress ?? 0.4;
  const r = 9, c = 2 * Math.PI * r;
  return `<div style="display:flex;align-items:center;gap:14px;height:${m.tabH + 6}px;padding:0 16px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid ${T.line}">
    ${[1, 2, 3, 4].map((n) => `<span class="mono" style="font-size:${m.tabFont + 1}px;font-weight:800;letter-spacing:.06em;color:${n === f ? T.accent : T.dim}">F${n}</span>`).join('')}
    <svg width="24" height="24" viewBox="0 0 24 24" style="display:block"><circle cx="12" cy="12" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/><circle cx="12" cy="12" r="${r}" fill="none" stroke="${T.accent}" stroke-width="2" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" transform="rotate(-90 12 12)" stroke-linecap="round"/></svg>
    <span class="mono" style="font-size:${m.tabFont - 1}px;color:${T.dim};letter-spacing:.06em">NEXT FLOOR IN 12 S</span>
  </div>`;
}

// ---------- ticker ----------
export function ticker(state, m) {
  const items = state.ticker || [];
  const item = (t) => `<span style="display:inline-flex;align-items:center;gap:18px;padding-right:18px;white-space:nowrap"><span class="mono" style="font-size:${m.tickerFont}px;font-weight:500;color:${t.warn ? T.soon : T.text}">${esc(t.text)}</span><span style="width:5px;height:5px;border-radius:99px;background:rgba(94,234,212,.6)"></span></span>`;
  const conn = state.connection || 'online';
  const connMap = { online: { c: T.live, l: 'LIVE' }, reconnecting: { c: T.soon, l: 'RECONNECTING…' }, offline: { c: T.cancelled, l: 'OFFLINE' } };
  const cc = connMap[conn];
  const dot = `<span style="position:relative;width:8px;height:8px;border-radius:99px;background:${cc.c};box-shadow:0 0 0 3px ${hexA(cc.c, 0.18)}"></span>`;
  return `<footer style="grid-column:1 / -1;display:flex;align-items:center;height:${m.tickerH}px;border-radius:${m.radius - 2}px;background:${T.panel};border:1px solid ${T.line};overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:center;width:${m.tickerH + 8}px;height:100%;border-right:1px solid ${T.line};color:${T.accent}">${ICON.feed(16)}</div>
    <div style="flex:1;min-width:0;overflow:hidden;display:flex;align-items:center;padding-left:18px;mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 40px),transparent)">
      <div class="marquee">${items.map(item).join('')}${items.map(item).join('')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;height:100%;padding:0 16px;border-left:1px solid ${T.line}">${dot}<span class="mono" style="font-size:${m.tickerFont - 3}px;font-weight:700;letter-spacing:.1em;color:${cc.c}">${cc.l}</span></div>
    <div style="display:flex;align-items:center;height:100%;padding:0 14px;border-left:1px solid ${T.line}"><span class="mono" style="font-size:${m.tickerFont - 3}px;color:${T.dim};letter-spacing:.06em">v1.0.0</span></div>
    ${state.kiosk ? '' : `<div style="display:flex;align-items:center;justify-content:center;width:${m.tickerH}px;height:100%;color:rgba(139,148,167,.35)">${ICON.grid(14)}</div>`}
  </footer>`;
}

// ---------- legend & chips ----------
export function legend(m, opts = {}) {
  const row = (swatch, label) => `<div style="display:flex;align-items:center;gap:8px">${swatch}<span style="font-size:${m.legendFont}px;color:${T.text};font-weight:500">${label}</span></div>`;
  const sw = (bg, extra = '') => `<span style="width:14px;height:10px;border-radius:2px;background:${bg};${extra}"></span>`;
  return `<div style="position:absolute;left:14px;bottom:18px;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:9px;background:rgba(11,15,23,.72);border:1px solid ${T.line}">
    ${row(sw('rgba(45,212,191,.55)', `box-shadow:0 0 0 1px rgba(45,212,191,.7)`), 'Class in progress')}
    ${row(sw('rgba(251,146,60,.55)'), 'Ending (last 5 min)')}
    ${row(sw('rgba(251,191,36,.45)'), 'Starts within 10 min')}
    ${row(sw('rgba(255,255,255,.12)'), 'Free')}
    ${row(sw('rgba(255,255,255,.04)', `border:1px solid rgba(255,255,255,.14)`), 'Not schedulable')}
  </div>`;
}

export function statsChip(busy, total, m, opts = {}) {
  const pct = total ? busy / total : 0;
  return `<div style="position:absolute;right:14px;top:14px;display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:9px;background:rgba(11,15,23,.72);border:1px solid ${T.line}">
    <span class="mono" style="font-size:${m.chipFont + 3}px;font-weight:700;color:${opts.color ?? T.text}">${busy}<span style="color:${T.dim};font-weight:500"> / ${total}</span></span>
    <span style="font-size:${m.chipFont}px;color:${T.dim};font-weight:500">rooms busy</span>
    <span style="width:64px;height:4px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;display:block"><span style="display:block;width:${Math.round(pct * 100)}%;height:100%;background:${opts.color ?? T.live}"></span></span>
  </div>`;
}

// collapsed time-travel bar: 4px line + playhead
export function timeBarCollapsed(state, m, stageW) {
  const pct = state.timePct ?? 0.23;
  return `<div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.06)">
    <div style="position:absolute;left:0;top:0;height:100%;width:${(pct * 100).toFixed(1)}%;background:rgba(94,234,212,.35)"></div>
    <div style="position:absolute;left:${(pct * 100).toFixed(1)}%;top:-4px;width:2px;height:12px;margin-left:-1px;background:${T.accent};box-shadow:0 0 8px rgba(94,234,212,.7)"></div>
  </div>`;
}

// expanded day timeline
export function timeBarExpanded(state, m) {
  const heat = state.heat || [22, 27, 28, 25, 19, 24, 31, 29, 21, 12, 4, 0];
  const pct = state.timePct ?? 0.507;
  const hours = [];
  for (let h = 8; h <= 20; h++) hours.push(h);
  const barH = 96;
  return `<div style="position:absolute;left:0;right:0;bottom:0;height:${barH}px;padding:12px 18px 10px;background:linear-gradient(180deg,rgba(11,15,23,0) 0%,rgba(11,15,23,.92) 28%);display:flex;flex-direction:column;gap:6px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span class="mono" style="font-size:${m.legendFont}px;letter-spacing:.12em;color:${T.dim};font-weight:600">TIME TRAVEL · TUESDAY 8 SEP</span>
      <span class="mono" style="font-size:${m.legendFont}px;letter-spacing:.06em;color:${T.dim}">drag to scrub · occupancy per slot</span>
    </div>
    <div style="position:relative;height:36px">
      <div style="position:absolute;left:0;right:0;top:8px;height:14px;display:flex;gap:2px">
        ${heat.map((v) => `<span style="flex:1;border-radius:2px;background:rgba(45,212,191,${(0.08 + (v / 41) * 0.6).toFixed(2)})"></span>`).join('')}
      </div>
      ${hours.map((h, i) => `<span style="position:absolute;left:${((i / 12) * 100).toFixed(2)}%;top:0;width:1px;height:30px;background:rgba(255,255,255,.14)"></span>`).join('')}
      <div style="position:absolute;left:${(pct * 100).toFixed(2)}%;top:-6px;bottom:-4px;width:2px;margin-left:-1px;background:${T.soon};box-shadow:0 0 10px rgba(251,191,36,.7)"></div>
      <div class="mono" style="position:absolute;left:${(pct * 100).toFixed(2)}%;top:-30px;transform:translateX(-50%);padding:3px 8px;border-radius:5px;background:${T.soon};color:#0B0F17;font-size:${m.legendFont + 1}px;font-weight:800;letter-spacing:.06em">${esc(state.clock.slice(0, 5))}</div>
    </div>
    <div style="position:relative;height:14px">
      ${hours.map((h, i) => `<span class="mono" style="position:absolute;left:${((i / 12) * 100).toFixed(2)}%;transform:translateX(${i === 0 ? '0' : i === 12 ? '-100%' : '-50%'});font-size:${m.legendFont - 1}px;color:${T.dim}">${String(h).padStart(2, '0')}:00</span>`).join('')}
    </div>
  </div>`;
}

// ---------- 2.5D exploded scene ----------
const deg = (a) => (a * Math.PI) / 180;
export function projector(k, tx, ty, opts = {}) {
  const rx = deg(opts.rx ?? 58), rz = deg(opts.rz ?? -38), D = opts.d ?? 2200, dz = opts.dz ?? 118;
  return (x, y, floorIdx) => {
    const lx = (x - 300) * k, ly = (y - 500) * k, z = (floorIdx - 1.5) * dz;
    const x1 = lx * Math.cos(rz) - ly * Math.sin(rz);
    const y1 = lx * Math.sin(rz) + ly * Math.cos(rz);
    const y2 = y1 * Math.cos(rx) - z * Math.sin(rx);
    const z2 = y1 * Math.sin(rx) + z * Math.cos(rx);
    const X = x1 + tx, Y = y2 + ty;
    const s = D / (D - z2);
    return [X * s, Y * s, s];
  };
}

export function explodedScene(state, m, stageW, stageH, opts = {}) {
  const floors = [1, 2, 3, 4];
  const margin = opts.margin ?? { x: Math.round(stageW * 0.084), y: Math.round(stageH * 0.07) };
  const shiftY = opts.shiftY ?? 0;
  let k = 0.9, tx = 0, ty = 0;
  let bb;
  for (let it = 0; it < 4; it++) {
    const P = projector(k, tx, ty, opts);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of floors) for (const [x, y] of OUTLINE_POLY) { const [X, Y] = P(x, y, f - 1); x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
    bb = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    const fit = Math.min((stageW - 2 * margin.x) / bb.w, (stageH - 2 * margin.y) / bb.h);
    k *= fit;
    tx -= (x0 + x1) / 2; ty -= (y0 + y1) / 2 - shiftY;
  }
  const P = projector(k, tx, ty, opts);
  const W = 600 * k, H = 1000 * k;
  const cx = stageW / 2, cy = stageH / 2;
  const dz = opts.dz ?? 118;
  const layers = floors.map((f) => {
    const i = f - 1;
    const z = (i - 1.5) * dz;
    const phases = (state.phases && state.phases[f]) || {};
    const hl = new Set(Object.keys(state.highlight || {}).filter((c) => resolveFloor(f).some((r) => r.code === c)));
    const dimAll = state.highlight && Object.keys(state.highlight).length > 0;
    const svg = floorSvg(f, { mode: 'exploded', phases, width: W, height: H, dots: true, lit: state.lit, highlight: hl, dimOthers: dimAll, idPrefix: `f${f}-` });
    return `<div style="position:absolute;inset:0;transform:translateZ(${(z - 6).toFixed(1)}px)">${slabUnderSvg(W, H)}</div>
      <div style="position:absolute;inset:0;transform:translateZ(${z.toFixed(1)}px)${state.mapDim ? ';opacity:.45' : ''}">${svg}</div>`;
  });
  // floor labels at the east-most projected point of each plate
  const labels = floors.map((f) => {
    let best = null;
    for (const [x, y] of OUTLINE_POLY) { const p = P(x, y, f - 1); if (!best || p[0] > best[0]) best = p; }
    const busy = state.floorBusy ? state.floorBusy[f] : 0;
    const dim = state.highlight && Object.keys(state.highlight).length;
    return `<div class="mono" style="position:absolute;left:${(cx + best[0] + 18).toFixed(0)}px;top:${(cy + best[1] - 11).toFixed(0)}px;display:flex;align-items:center;gap:8px;font-size:${m.legendFont + 1}px;color:${T.dim};white-space:nowrap;opacity:${dim ? 0.5 : 1}"><span style="width:14px;height:1px;background:rgba(255,255,255,.25)"></span><span style="font-weight:800;color:${T.text}">F${f}</span><span>· ${busy} busy</span></div>`;
  });
  // highlight badges
  const badges = Object.entries(state.highlight || {}).map(([code, info]) => {
    for (const f of floors) {
      const r = resolveFloor(f).find((x) => x.code === code);
      if (!r) continue;
      const p = P(r.cx, r.cy, f - 1);
      return `<div style="position:absolute;left:${(cx + p[0]).toFixed(0)}px;top:${(cy + p[1]).toFixed(0)}px;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:0;pointer-events:none">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:7px;background:rgba(11,15,23,.92);border:1px solid rgba(94,234,212,.55);box-shadow:0 8px 24px rgba(0,0,0,.45)">
          <span class="mono" style="font-size:${m.legendFont + 2}px;font-weight:800;color:${T.text}">${esc(code)}</span>
          <span class="mono" style="font-size:${m.legendFont}px;font-weight:700;letter-spacing:.1em;color:${info.kind === 'now' ? T.live : T.soon}">${esc(info.label)}</span>
          <span style="font-size:${m.legendFont}px;color:${T.dim}">${esc(info.sub)}</span>
        </div>
        <span style="width:1px;height:26px;background:rgba(94,234,212,.6)"></span>
      </div>`;
    }
    return '';
  });
  return `<div style="position:absolute;inset:0;perspective:2200px;perspective-origin:50% 50%${state.mapDim ? ';filter:saturate(.35)' : ''}${state.lit ? ';opacity:.75' : ''}">
    <div style="position:absolute;left:50%;top:50%;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px;margin-left:${(-W / 2).toFixed(1)}px;margin-top:${(-H / 2).toFixed(1)}px;transform-style:preserve-3d;transform:translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) rotateX(58deg) rotateZ(-38deg)">
      ${layers.join('')}
    </div>
  </div>
  ${labels.join('')}
  ${badges.join('')}`;
}

// ---------- focused floor (top-down) ----------
export function focusScene(state, m, stageW, stageH) {
  const f = state.focusFloor;
  const margin = 34;
  // the focused plate lies flat, turned -90°: north to the left, the curved west façade at the bottom (as in the 3D view)
  const s = Math.min((stageW - 2 * margin) / 1000, (stageH - 2 * margin - 24) / 600);
  const W = 600 * s, H = 1000 * s;
  const cx = stageW / 2, cy = stageH / 2 - 4;
  const toScreen = (x, y) => [cx + (y - 500) * s, cy - (x - 300) * s];
  const phases = (state.phases && state.phases[f]) || {};
  const svg = floorSvg(f, { mode: 'focus', phases, width: W, height: H, dots: false, selected: state.selectedRoom, dimOthers: !!state.selectedRoom, idPrefix: `f${f}-` });
  const plate = (inner, dx, dy, extra = '') => `<div style="position:absolute;left:${(cx - W / 2 + dx).toFixed(1)}px;top:${(cy - H / 2 + dy).toFixed(1)}px;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px;transform:rotate(-90deg);${extra}">${inner}</div>`;
  const ghost = f > 1 ? plate(floorSvg(f - 1, { mode: 'exploded', width: W, height: H, idPrefix: `g${f}-` }), -22, 18, 'opacity:.07') : '';
  const rooms = resolveFloor(f).filter((r) => r.sched);
  const chips = rooms.map((r) => {
    const c = (state.chips && state.chips[r.code]) || { course: '', line: 'free', phase: 'free' };
    const selected = state.selectedRoom === r.code;
    const dim = state.selectedRoom && !selected;
    const compact = r.bbox.h * s < 118; // after the turn the room's screen width is its plan height
    const [x, y] = toScreen(r.cx, r.cy);
    return roomChip(r.code, c, m, { x, y, selected, dim, compact });
  });
  return `<div style="position:absolute;inset:0">${ghost}${plate(svg, 0, 0, 'filter:drop-shadow(0 30px 40px rgba(0,0,0,.45))')}${chips.join('')}</div>`;
}

export function roomChip(code, c, m, o = {}) {
  const phaseColor = { live: T.live, ending: T.ending, soon: T.soon, delayed: T.delayed, free: T.dim }[c.phase || 'free'];
  const pct = c.pct ?? 0;
  const r = 7, circ = 2 * Math.PI * r;
  const arc = c.phase && c.phase !== 'free'
    ? `<svg width="18" height="18" viewBox="0 0 18 18" style="display:block;flex:none"><circle cx="9" cy="9" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="2"/><circle cx="9" cy="9" r="${r}" fill="none" stroke="${phaseColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct)).toFixed(1)}" transform="rotate(-90 9 9)"/></svg>`
    : `<span style="width:8px;height:8px;border-radius:99px;border:1.5px solid rgba(255,255,255,.3);display:block;flex:none"></span>`;
  const pos = o.x != null ? `position:absolute;left:${o.x.toFixed(0)}px;top:${o.y.toFixed(0)}px;transform:translate(-50%,-50%);` : '';
  const border = o.selected ? `1.5px solid ${T.accent}` : `1px solid ${c.phase && c.phase !== 'free' ? hexA(phaseColor, 0.45) : T.line}`;
  const glow = o.selected ? `box-shadow:0 0 0 4px rgba(94,234,212,.18),0 10px 30px rgba(0,0,0,.5);` : `box-shadow:0 6px 18px rgba(0,0,0,.4);`;
  const font = m.legendFont;
  if (o.compact) {
    return `<div style="${pos}display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:7px;background:rgba(11,15,23,.9);border:${border};${glow}opacity:${o.dim ? 0.5 : 1}">${arc}<span class="mono" style="font-size:${font + 1}px;font-weight:800;color:${T.text}">${esc(code)}</span></div>`;
  }
  return `<div style="${pos}display:flex;align-items:center;gap:8px;padding:5px 9px 5px 7px;border-radius:8px;background:rgba(11,15,23,.9);border:${border};${glow}opacity:${o.dim ? 0.5 : 1}">
    ${arc}
    <div style="display:flex;flex-direction:column;gap:1px">
      <div style="display:flex;align-items:baseline;gap:7px"><span class="mono" style="font-size:${font + 2}px;font-weight:800;color:${T.text}">${esc(code)}</span><span class="mono" style="font-size:${font}px;font-weight:600;color:${T.dim}">${esc(c.course || '')}</span></div>
      <span class="mono" style="font-size:${font}px;color:${c.phase && c.phase !== 'free' ? phaseColor : T.dim};letter-spacing:.02em;white-space:nowrap">${esc(c.line)}</span>
    </div>
  </div>`;
}

export function tooltip(m, o = {}) {
  return `<div style="display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:8px;background:rgba(11,15,23,.94);border:1px solid ${T.line};box-shadow:0 10px 30px rgba(0,0,0,.5);width:${o.w ?? 260}px">
    <div style="display:flex;align-items:center;gap:8px"><span class="mono" style="font-size:${m.legendFont + 3}px;font-weight:800">${esc(o.code ?? '213')}</span><span style="font-size:${m.legendFont + 1}px;color:${T.dim}">${esc(o.name ?? 'Lecture Hall "Gamma" · 100 seats')}</span></div>
    <div style="display:flex;align-items:center;gap:8px"><span style="width:6px;height:6px;border-radius:99px;background:${T.live}"></span><span style="font-size:${m.legendFont + 1}px;font-weight:700">${esc(o.course ?? 'CS201 Databases')}</span><span class="mono" style="font-size:${m.legendFont}px;color:${T.live}">${esc(o.until ?? 'until 11:50')}</span></div>
    <div style="font-size:${m.legendFont}px;color:${T.dim}">${esc(o.sub ?? 'Akhmetov D. · ПО2308, ПО2309')}</div>
    <div class="mono" style="font-size:${m.legendFont - 1}px;color:${T.dim};letter-spacing:.06em;padding-top:4px;border-top:1px solid ${T.line}">CLICK FOR DETAILS · ↵</div>
  </div>`;
}

// ---------- room detail panel ----------
export function detailPanel(m, d, o = {}) {
  const W = o.w ?? 420;
  const font = m.legendFont;
  const sessionRow = (s, i, a) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid ${i === a.length - 1 ? 'transparent' : T.line}">
      ${flap(s.time, m, { font: 13, cellW: 11, h: 22 })}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
        <span style="font-size:${font + 2}px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="mono" style="color:${T.dim};margin-right:6px">${esc(s.course)}</span>${esc(s.title)}</span>
        <span class="mono" style="font-size:${font}px;color:${T.dim}">${esc(s.sub)}</span>
      </div>
    </div>`;
  const pos = o.floating === false ? '' : `position:absolute;right:${m.pad}px;top:${m.pad + m.headerH + m.gap}px;height:${o.h}px;`;
  return `<aside style="${pos}width:${W}px;display:flex;flex-direction:column;gap:18px;padding:22px 22px 18px;border-radius:${m.radius}px;background:rgba(17,24,38,.94);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);box-shadow:-24px 0 60px rgba(0,0,0,.5)">
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="display:flex;flex-direction:column;gap:4px;flex:1">
        <div style="display:flex;align-items:baseline;gap:10px"><span class="mono" style="font-size:30px;font-weight:800;letter-spacing:-.01em">${esc(d.code)}</span><span style="font-size:${font + 4}px;font-weight:700">${esc(d.name)}</span></div>
        <span style="font-size:${font + 1}px;color:${T.dim}">${esc(d.meta)}</span>
      </div>
      ${iconButton(ICON.close(16), m, { h: 34 })}
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:10px;background:rgba(45,212,191,.07);border:1px solid rgba(45,212,191,.28)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="mono" style="font-size:${font}px;font-weight:800;letter-spacing:.14em;color:${T.live}">NOW · ${esc(d.now.type)}</span>
        ${pill('live', m, 'LIVE', { minW: 64, h: 24, font: 11 })}
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <span style="font-size:${font + 8}px;font-weight:800;letter-spacing:-.01em"><span class="mono" style="color:${T.dim};font-weight:600;margin-right:8px;font-size:${font + 4}px">${esc(d.now.course)}</span>${esc(d.now.title)}</span>
        <span class="mono" style="font-size:${font + 1}px;color:${T.dim}">${esc(d.now.time)} · ${esc(d.now.groups)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between"><span class="mono" style="font-size:${font}px;color:${T.dim}">${esc(d.now.elapsed)}</span><span class="mono" style="font-size:${font}px;font-weight:700;color:${T.live}">${esc(d.now.left)}</span></div>
        <div style="height:6px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden"><div style="width:${Math.round(d.now.pct * 100)}%;height:100%;border-radius:99px;background:${T.live}"></div></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding-top:10px;border-top:1px solid rgba(45,212,191,.2)">
        <span class="mono" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:99px;background:rgba(255,255,255,.08);font-size:${font}px;font-weight:800;color:${T.text}">${esc(d.now.initials)}</span>
        <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:${font + 2}px;font-weight:700">${esc(d.now.teacher)}</span><span style="font-size:${font}px;color:${T.dim}">${esc(d.now.dept)}</span></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;align-items:baseline;gap:10px;padding-bottom:6px;border-bottom:1px solid rgba(94,234,212,.4)"><span class="mono" style="font-size:${font}px;font-weight:800;letter-spacing:.14em;color:${T.accent}">NEXT IN THIS ROOM</span><span class="mono" style="font-size:${font}px;color:${T.dim}">· today</span></div>
      ${d.next.map(sessionRow).join('')}
    </div>
    <div style="flex:1"></div>
    <div style="display:flex;gap:10px">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:${m.btnH}px;border-radius:9px;background:rgba(94,234,212,.14);border:1px solid rgba(94,234,212,.45);color:${T.accent}">${ICON.map(16)}<span style="font-size:${font + 1}px;font-weight:700">Show on map</span></div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:${m.btnH}px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid ${T.line};color:${T.text}">${ICON.clock(16)}<span style="font-size:${font + 1}px;font-weight:700">Full day</span></div>
    </div>
  </aside>`;
}

// ---------- search palette ----------
export function searchPalette(m, q, results, o = {}) {
  const W = o.w ?? 680;
  const font = m.legendFont;
  const group = (title, items) => `<div style="display:flex;flex-direction:column">
    <span class="mono" style="font-size:${font - 1}px;font-weight:800;letter-spacing:.14em;color:${T.dim};padding:10px 16px 6px">${title}</span>
    ${items.map((it) => `<div style="display:flex;align-items:center;gap:14px;padding:10px 16px;background:${it.active ? 'rgba(94,234,212,.1)' : 'transparent'};border-left:2px solid ${it.active ? T.accent : 'transparent'}">
        <span class="mono" style="min-width:76px;font-size:${font + 3}px;font-weight:800;color:${it.active ? T.accent : T.text}">${esc(it.code)}</span>
        <div style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:${font + 2}px;font-weight:600">${esc(it.title)}</span><span class="mono" style="font-size:${font}px;color:${T.dim}">${esc(it.sub)}</span></div>
        ${it.tag ? `<span class="mono" style="font-size:${font - 1}px;font-weight:700;letter-spacing:.1em;color:${T.live}">${esc(it.tag)}</span>` : ''}
        ${it.active ? `<span style="color:${T.dim}">${ICON.arrow(16)}</span>` : ''}
      </div>`).join('')}
  </div>`;
  return `<div style="${o.floating === false ? '' : (o.left != null ? `position:absolute;left:${o.left}px;top:${o.top ?? 150}px;` : `position:absolute;left:50%;top:${o.top ?? 150}px;transform:translateX(-50%);`)}width:${W}px;display:flex;flex-direction:column;border-radius:14px;background:rgba(17,24,38,.96);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid ${T.line};color:${T.dim}">
      ${ICON.search(20)}
      <span class="mono" style="flex:1;font-size:${font + 8}px;font-weight:600;color:${T.text}">${esc(q)}<span style="display:inline-block;width:2px;height:22px;background:${T.accent};vertical-align:-4px;margin-left:2px"></span></span>
      <span class="mono" style="font-size:${font - 1}px;padding:3px 7px;border-radius:5px;border:1px solid ${T.line}">ESC</span>
    </div>
    ${results.map((g) => group(g.title, g.items)).join('')}
    <div style="display:flex;align-items:center;gap:16px;padding:10px 16px;border-top:1px solid ${T.line}">
      ${['↑↓ navigate', '↵ highlight on map', 'tab filter board'].map((h) => `<span class="mono" style="font-size:${font - 1}px;color:${T.dim};letter-spacing:.04em">${h}</span>`).join('')}
    </div>
  </div>`;
}

export { T, hexA };
