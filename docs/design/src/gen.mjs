// Assemble every CampusLive artboard + canvas.json + exports
import { writeFileSync, mkdirSync } from 'node:fs';
import { T, hexA, M1080, M720, stageSize, wrapDoc, header, ticker, legend, statsChip, timeBarCollapsed, timeBarExpanded, explodedScene, focusScene, boardSection, boardRow, flap, pill, STATUS, roomChip, tooltip, detailPanel, searchPalette, floorTabs, iconButton, langSwitch, ICON, esc, FONT_MONO, logoMark } from './ui.mjs';
import { floorSvg, exportFloorSvg } from './plan.mjs';
import { HERO, FOCUS2, SEARCH, TRAVEL, AFTER, RECONNECT, APIDOWN, KIOSK } from './states.mjs';

const OUT = '/home/claude/campuslive-design';

// ---------- one full screen ----------
function stage(state, m) {
  const { w, h } = stageSize(m);
  const focus = !!state.focusFloor;
  const scene = focus ? focusScene(state, m, w, h) : explodedScene(state, m, w, h, state.travelOpen ? { shiftY: -34, margin: { x: 110, y: 78 } } : {});
  const chipColor = state.connection === 'offline' ? T.cancelled : state.connection === 'reconnecting' ? T.soon : undefined;
  const lastKnown = state.mapDim ? `<div style="position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:8px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.45);color:${T.cancelled}">${ICON.warn(14)}<span class="mono" style="font-size:${m.legendFont}px;font-weight:700;letter-spacing:.1em">LAST KNOWN STATE · ${esc(state.lastUpdate)}</span></div>` : '';
  const caption = focus
    ? `<div style="position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;background:rgba(11,15,23,.72);border:1px solid ${T.line}"><span class="mono" style="font-size:${m.chipFont + 3}px;font-weight:800">Floor ${state.focusFloor}</span><span style="font-size:${m.chipFont}px;color:${T.dim}">${state.focusFloor === 2 ? 'Departments · labs · atrium gallery' : state.focusFloor === 3 ? 'Teaching floor · Cyber Range Lab' : 'Teaching floor'}</span>${state.kiosk ? '' : `<span class="mono" style="font-size:${m.legendFont - 1}px;color:${T.dim};padding:2px 6px;border-radius:5px;border:1px solid ${T.line}">ESC · all floors</span>`}</div>`
    : `<div style="position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;background:rgba(11,15,23,.72);border:1px solid ${T.line}"><span class="mono" style="font-size:${m.chipFont + 1}px;font-weight:800">All floors</span><span style="font-size:${m.chipFont}px;color:${T.dim}">exploded view · click a plate to focus</span></div>`;
  const bar = state.travelOpen ? timeBarExpanded(state, m) : timeBarCollapsed(state, m, w);
  return `<section style="position:relative;overflow:hidden;border-radius:${m.radius}px;background:${T.panel};border:1px solid ${T.line}">
    ${scene}${caption}${state.travelOpen ? '' : legend(m)}${statsChip(state.busy, state.total, m, { color: chipColor })}${lastKnown}${bar}
  </section>`;
}

function emptyCard(state, m) {
  const e = state.empty;
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px;text-align:center">
    <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:99px;background:rgba(255,255,255,.05);border:1px solid ${T.line};color:${T.dim}">${ICON.clock(28)}</div>
    <div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:${m.rowTitle + 6}px;font-weight:800">${esc(e.title)}</span><span style="font-size:${m.rowSub + 2}px;color:${T.dim}">The building is quiet. Classes resume tomorrow.</span></div>
    <div style="width:100%;display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:10px;background:rgba(94,234,212,.06);border:1px solid rgba(94,234,212,.25)">
      <span class="mono" style="font-size:${m.rowSub}px;font-weight:800;letter-spacing:.14em;color:${T.accent}">NEXT CLASS</span>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px">${flap(e.next.time, m)}${flap(e.next.room, m)}</div>
      <span style="font-size:${m.rowTitle}px;font-weight:700"><span class="mono" style="color:${T.dim};margin-right:8px">${esc(e.next.course)}</span>${esc(e.next.title)}</span>
      <span class="mono" style="font-size:${m.rowSub}px;color:${T.dim}">${esc(e.next.sub)}</span>
    </div>
  </div>`;
}

function errorCard(state, m) {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px;text-align:center">
    <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:99px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.4);color:${T.cancelled}">${ICON.warn(28)}</div>
    <div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:${m.rowTitle + 6}px;font-weight:800">Schedule service unavailable</span><span style="font-size:${m.rowSub + 2}px;color:${T.dim};max-width:380px;line-height:1.5">The board can't reach the schedule API. The map shows the last known state from <span class="mono" style="color:${T.text}">${esc(state.lastUpdate)}</span>.</span></div>
    <div class="mono" style="display:flex;align-items:center;gap:10px;font-size:${m.rowSub}px;color:${T.dim}"><span style="width:8px;height:8px;border-radius:99px;background:${T.cancelled}"></span>OFFLINE · RETRYING IN 12 S</div>
    <div style="display:flex;gap:10px">
      <div style="display:flex;align-items:center;gap:8px;height:${m.btnH}px;padding:0 18px;border-radius:9px;background:rgba(94,234,212,.14);border:1px solid rgba(94,234,212,.45);color:${T.accent}">${ICON.retry(16)}<span style="font-size:${m.rowSub + 1}px;font-weight:700">Retry now</span></div>
      <div style="display:flex;align-items:center;gap:8px;height:${m.btnH}px;padding:0 18px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid ${T.line};color:${T.text}"><span style="font-size:${m.rowSub + 1}px;font-weight:700">Show last board</span></div>
    </div>
  </div>`;
}

function board(state, m) {
  let inner;
  if (state.connection === 'offline') inner = errorCard(state, m);
  else if (!state.now.length && !state.next.length && state.empty) inner = emptyCard(state, m);
  else {
    const stale = state.connection === 'reconnecting' ? `<span class="pill" style="height:20px;padding:0 8px;font-size:${m.rowSub - 2}px;color:${T.soon};background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);margin-right:10px">stale · ${esc(state.staleFor)}</span>` : '';
    const filterChip = state.filter ? `<div style="display:flex;align-items:center;gap:10px;height:${m.tabH + 4}px;padding:0 6px 0 12px;border-radius:9px;background:rgba(94,234,212,.1);border:1px solid rgba(94,234,212,.4)"><span style="font-size:${m.rowSub}px;color:${T.dim}">Filtered by group</span><span class="mono" style="font-size:${m.rowSub + 1}px;font-weight:800;color:${T.accent}">${esc(state.filter)}</span><span style="flex:1"></span><span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;color:${T.dim}">${ICON.close(14)}</span></div>` : '';
    const nextNote = state.next.length ? 'within 90 min' : '';
    const nextFill = state.filter ? state.next : state.next;
    inner = `${filterChip}
      ${boardSection('NOW', String(state.nowTotal), state.filter ? 'in progress' : 'by end time', state.now, m, m.nowRows, 0, state.nowPages, { badge: stale, noFill: !!state.filter })}
      ${boardSection('NEXT', String(state.nextTotal), nextNote, nextFill, m, m.nextRows, 0, state.nextPages, { noFill: !!state.filter })}`;
  }
  return `<aside style="display:flex;flex-direction:column;gap:${m.gap}px;padding:${m.boardPad}px;border-radius:${m.radius}px;background:${T.panel};border:1px solid ${T.line};overflow:hidden">${inner}</aside>`;
}

function screen(state, m, opts = {}) {
  const { h } = stageSize(m);
  const overlays = [];
  if (state.detail) overlays.push(detailPanel(m, state.detail, { h }));
  if (state.query) overlays.push(searchPalette(m, state.query, state.results, { top: m.pad + m.headerH + m.gap + 44, left: m.pad + stageSize(m).w - 12 - 620, w: 620 }));
  const root = `<div style="position:relative;width:${m.W}px;height:${m.H}px;overflow:hidden;background:${T.bg};color:${T.text};font-family:Manrope, 'Segoe UI', system-ui, sans-serif;display:grid;grid-template-rows:${m.headerH}px minmax(0,1fr) ${m.tickerH}px;grid-template-columns:minmax(0,1fr) ${m.boardW}px;gap:${m.gap}px;padding:${m.pad}px;${state.kiosk ? 'cursor:none;' : ''}">
    ${header(state, m)}
    ${stage(state, m)}
    ${board(state, m)}
    ${ticker(state, m)}
    ${state.query ? `<div style="position:absolute;inset:0;background:rgba(11,15,23,.3)"></div>` : ''}
    ${state.detail ? `<div style="position:absolute;right:${m.pad}px;top:${m.pad + m.headerH + m.gap}px;width:${m.boardW}px;height:${h}px;border-radius:${m.radius}px;background:rgba(11,15,23,.55)"></div>` : ''}
    ${overlays.join('')}
  </div>`;
  if (opts.zoom) {
    return wrapDoc(`<div style="width:${m.W * opts.zoom}px;height:${m.H * opts.zoom}px;overflow:hidden;background:${T.bg}"><div style="zoom:${opts.zoom}">${root}</div></div>`);
  }
  return wrapDoc(root);
}

// ---------- component sheet ----------
function componentSheet(m) {
  const font = m.legendFont;
  const sec = (title, note, body) => `<section style="display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;align-items:baseline;gap:12px;padding-bottom:8px;border-bottom:1px solid rgba(94,234,212,.4)"><span class="mono" style="font-size:13px;font-weight:800;letter-spacing:.14em;color:${T.accent}">${title}</span><span style="font-size:12px;color:${T.dim}">${note}</span></div>
    ${body}
  </section>`;
  const rows = [
    { time: '10:00', room: '213', course: 'CS201', title: 'Databases', teacher: 'Akhmetov D.', groups: 'ПО2308, ПО2309', status: 'live', until: '11:50' },
    { time: '10:00', room: '101', course: 'CS110', title: 'Programming I', teacher: 'Nurgaliyeva A.', groups: 'ПО2401, ПО2402', status: 'ending', until: '10:50' },
    { time: '11:00', room: '303', course: 'CS250', title: 'Algorithms', teacher: 'Orazbayev N.', groups: 'ИС2301', status: 'soon', statusLabel: 'IN 4 MIN' },
    { time: '12:00', room: '205', course: 'PM200', title: 'Project Management', teacher: 'Zhumabekov S.', groups: 'ПО2308', status: 'upcoming', statusLabel: 'STARTS 12:00' },
    { time: '11:00', room: '216', course: 'SE210', title: 'Software Design', teacher: 'Kairatova M.', groups: 'ПО2310', status: 'cancelled' },
    { time: '11:00', room: '412', course: 'DS215', title: 'Statistics', teacher: 'Petrova O.', groups: 'БДА2401', status: 'moved', statusLabel: 'MOVED → 414' },
    { time: '10:15', room: '313', course: 'CB240', title: 'Network Security', teacher: 'Bekzhanov T.', groups: 'КБ2401', status: 'delayed', until: '11:05' },
    { time: '10:00', room: '216', course: 'SE330', title: 'Web Development', teacher: 'Kim V.', groups: 'ПО2310', status: 'live', until: '10:50', conflict: true },
  ];
  const label = (t) => `<span class="mono" style="font-size:11px;color:${T.dim};letter-spacing:.08em">${t}</span>`;
  const cell = (body, t) => `<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">${body}${label(t)}</div>`;

  // split-flap anatomy
  const flapMid = `<span style="position:relative;display:inline-flex;width:15px;height:30px;border-radius:3px;overflow:hidden;background:${T.slabEdge}">
      <span class="mono" style="position:absolute;left:0;right:0;top:0;height:15px;overflow:hidden;display:flex;justify-content:center;align-items:flex-end;font-size:20px;font-weight:600;line-height:30px;color:${T.text}">3</span>
      <span class="mono" style="position:absolute;left:0;right:0;bottom:0;height:15px;overflow:hidden;display:flex;justify-content:center;align-items:flex-start;font-size:20px;font-weight:600;line-height:0;color:${T.text}">2</span>
      <span class="mono" style="position:absolute;left:0;right:0;top:0;height:15px;overflow:hidden;display:flex;justify-content:center;align-items:flex-end;font-size:20px;font-weight:600;line-height:30px;color:${T.text};background:#141a26;transform:rotateX(-62deg);transform-origin:bottom center">2</span>
      <span style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.8)"></span></span>`;

  const swatch = (name, val, note) => `<div style="display:flex;flex-direction:column;gap:6px;width:132px"><span style="height:44px;border-radius:8px;background:${val};border:1px solid ${T.line}"></span><span class="mono" style="font-size:11px;font-weight:700">${name}</span><span class="mono" style="font-size:10px;color:${T.dim}">${val}</span>${note ? `<span style="font-size:10px;color:${T.dim}">${note}</span>` : ''}</div>`;

  const body = `<div style="width:1920px;background:${T.bg};color:${T.text};padding:40px 48px 48px;display:flex;flex-direction:column;gap:40px;font-family:Manrope, 'Segoe UI', system-ui, sans-serif">
    <div style="display:flex;align-items:center;gap:16px">${logoMark(40)}<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:26px;font-weight:800;letter-spacing:-.01em">CampusLive · Component sheet</span><span style="font-size:13px;color:${T.dim}">Dark theme · 1920×1080 metrics · Manrope + JetBrains Mono</span></div></div>

    <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:40px">
      ${sec('BOARD ROWS', 'every status · 560 px column · 60 px row', `<div style="width:560px;padding:0 16px;border-radius:12px;background:${T.panel};border:1px solid ${T.line}">${rows.map((r, i, a) => boardRow(r, m, { last: i === a.length - 1 })).join('')}</div>`)}
      <div style="display:flex;flex-direction:column;gap:40px">
        ${sec('STATUS PILLS', 'text always accompanies colour', `<div style="display:flex;flex-wrap:wrap;gap:12px">${[['live', 'LIVE'], ['ending', 'ENDS 5 MIN'], ['soon', 'IN 4 MIN'], ['upcoming', 'STARTS 09:00'], ['cancelled', 'CANCELLED'], ['moved', 'MOVED → 214'], ['delayed', 'DELAYED +15']].map(([k, l]) => cell(pill(k, m, l), k)).join('')}</div>`)}
        ${sec('SPLIT-FLAP CELL', 'fixed-width mono tiles · seam at 50% · flips in two halves, 90 ms each', `<div style="display:flex;align-items:flex-end;gap:36px">
          ${cell(flap('10:00', m), 'time · 5 cells')}
          ${cell(flap('213', m), 'room · 3 cells')}
          ${cell(`<span style="display:inline-flex;gap:2px">${flap('2', m)}${flapMid}${flap('4', m)}</span>`, 'mid-flip · 25 ms stagger per cell')}
          ${cell(flap('SF-1', m, { color: T.dim }), 'dim variant')}
        </div>`)}
        ${sec('CONNECTION DOT', 'ticker · right end', `<div style="display:flex;gap:28px">${[['online', T.live, 'LIVE'], ['reconnecting', T.soon, 'RECONNECTING…'], ['offline', T.cancelled, 'OFFLINE']].map(([k, c, l]) => cell(`<div style="display:flex;align-items:center;gap:10px"><span style="width:8px;height:8px;border-radius:99px;background:${c};box-shadow:0 0 0 3px ${hexA(c, 0.18)}"></span><span class="mono" style="font-size:12px;font-weight:700;letter-spacing:.1em;color:${c}">${l}</span></div>`, k)).join('')}</div>`)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:40px">
      ${sec('ROOM CHIP', 'focus view · code · course · countdown with progress arc', `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
        ${cell(roomChip('213', { course: 'CS201', line: 'ends 42 min', phase: 'live', pct: 0.62 }, m), 'live')}
        ${cell(roomChip('305', { course: 'MA101', line: 'ends 3 min', phase: 'ending', pct: 0.94 }, m), 'ending')}
        ${cell(roomChip('303', { course: 'CS250', line: 'starts in 4 min', phase: 'soon', pct: 0 }, m), 'soon')}
        ${cell(roomChip('313', { course: 'CB240', line: 'ends 11:05 · +15', phase: 'delayed', pct: 0.64 }, m), 'delayed')}
        ${cell(roomChip('208', { course: '', line: 'free · next 12:00', phase: 'free' }, m), 'free')}
        ${cell(roomChip('213', { course: 'CS201', line: 'ends 42 min', phase: 'live', pct: 0.62 }, m, { selected: true }), 'selected')}
        ${cell(roomChip('218', { course: '', line: '', phase: 'live', pct: 0.4 }, m, { compact: true }), 'compact (narrow room)')}
      </div>`)}
      ${sec('TOOLTIP', 'hover on a room', tooltip(m))}
      ${sec('FLOOR TABS · LEGEND', 'header segmented control · stage legend', `<div style="display:flex;flex-direction:column;gap:16px;align-items:flex-start">${floorTabs({ floorBusy: [28, 3, 9, 8, 8], focusFloor: 0 }, m)}${floorTabs({ floorBusy: [28, 3, 9, 8, 8], focusFloor: 2 }, m)}<div style="position:relative;width:220px;height:150px">${legend(m)}</div></div>`)}
    </div>

    <div style="display:grid;grid-template-columns:480px minmax(0,1fr);gap:40px">
      ${sec('DETAIL PANEL', '420 px glass card · slides over the board column', `<div style="position:relative">${detailPanel(m, FOCUS2.detail, { floating: false })}</div>`)}
      <div style="display:flex;flex-direction:column;gap:40px">
        ${sec('BUTTONS · CONTROLS', 'height 40 · radius 9 · hairline borders', `<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center">
          ${cell(`<div style="display:flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:9px;background:rgba(94,234,212,.14);border:1px solid rgba(94,234,212,.45);color:${T.accent}">${ICON.live(16)}<span class="mono" style="font-size:13px;font-weight:800;letter-spacing:.1em">LIVE</span></div>`, 'primary · return to live')}
          ${cell(`<div style="display:flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid ${T.line};color:${T.text}"><span style="font-size:13px;font-weight:700">Show on map</span></div>`, 'secondary')}
          ${cell(`<div style="display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:9px;color:${T.dim}"><span style="font-size:13px;font-weight:700">Clear filter</span></div>`, 'ghost')}
          ${cell(`<div style="display:flex;gap:8px">${iconButton(ICON.theme(16), m)}${iconButton(ICON.kiosk(16), m)}${iconButton(ICON.search(16), m)}</div>`, 'icon buttons')}
          ${cell(langSwitch(m), 'locale switch')}
          ${cell(`<div style="display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:9px;border:1px solid ${T.line};background:rgba(255,255,255,.03);color:${T.dim}">${ICON.search(16)}<span style="font-size:13px;font-weight:600">Search</span><span class="mono" style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:5px;border:1px solid ${T.line}">⌘K</span></div>`, 'search trigger')}
          ${cell(`<span class="pill" style="height:26px;padding:0 10px;font-size:11px;color:${T.soon};background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.4)">Simulated</span>`, 'clock tag')}
        </div>`)}
        ${sec('COLOUR TOKENS', 'tokens.css · all text ≥ 4.5:1 on --bg', `<div style="display:flex;flex-wrap:wrap;gap:16px">
          ${swatch('--bg', '#0B0F17')}${swatch('--bg-elev', '#111826')}${swatch('--slab', '#161E2E')}${swatch('--text', '#E6EAF2')}${swatch('--text-dim', '#8B94A7')}${swatch('--accent', '#5EEAD4')}
          ${swatch('--status-live', '#2DD4BF')}${swatch('--status-soon', '#FBBF24')}${swatch('--status-ending', '#FB923C')}${swatch('--status-cancelled', '#F87171')}${swatch('--status-moved', '#A78BFA')}${swatch('--status-delayed', '#F59E0B')}
        </div>`)}
        ${sec('TYPE RAMP', 'UI Manrope · board / clock JetBrains Mono', `<div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:baseline;gap:16px"><span class="mono" style="font-size:44px;font-weight:600;line-height:1">10:47:32</span>${label('clock · mono 44 / 600')}</div>
          <div style="display:flex;align-items:baseline;gap:16px"><span style="font-size:18px;font-weight:700">CS201 Databases · Lecture Hall "Gamma"</span>${label('row title · 18 / 700')}</div>
          <div style="display:flex;align-items:baseline;gap:16px"><span class="mono" style="font-size:13px;color:${T.dim}">Akhmetov D. · ПО2308, ПО2309 · until 11:50</span>${label('row sub · mono 13')}</div>
          <div style="display:flex;align-items:baseline;gap:16px"><span class="mono" style="font-size:13px;font-weight:800;letter-spacing:.14em;color:${T.accent}">NOW · 28</span>${label('section header · mono 13 / 800 · +14%')}</div>
          <div style="display:flex;align-items:baseline;gap:16px"><span class="mono" style="font-size:12px;font-weight:800;letter-spacing:.04em">213</span><span class="mono" style="font-size:12px;color:${T.dim}">CS201</span>${label('room chip · mono 12–14')}</div>
        </div>`)}
      </div>
    </div>
  </div>`;
  return wrapDoc(body);
}

// ---------- motion sheet ----------
function motionSheet(m) {
  const rows = [
    ['Floor focus / unfocus', 'plate rotates flat and scales; others fade and drift on Z', 'spring · stiffness 120 · damping 18 · ~600 ms settle'],
    ['Row appears / leaves', 'fade + 8 px vertical slide; moving rows use shared layout (NEXT → NOW)', '300 ms · cubic-bezier(.16, 1, .3, 1)'],
    ['Split-flap change', 'each character tile flips in two halves, staggered 25 ms per cell', '90 ms per half · max 40 cells at once, then fade'],
    ['Live room', '6 px dot pulses (scale 1 → 1.6, opacity 1 → 0)', '2 s loop · ease-out'],
    ['Soon room', 'fill opacity 0.6 ↔ 1', '1 Hz · steps(2)'],
    ['Page flip on the board', 'whole section flips down like a departure board', '400 ms · ease-in-out'],
    ['Ticker', 'continuous horizontal marquee, pauses on hover', '90 px / s · linear'],
    ['Parallax', 'scene tilts ±2.5° with the pointer', 'spring · stiffness 60 · damping 20'],
    ['Reduced motion', 'no parallax, no pulse, no flips — fades only', '—'],
  ];
  const curve = (name, d, note) => `<div style="display:flex;flex-direction:column;gap:8px"><svg width="160" height="120" viewBox="0 0 160 120" style="display:block"><rect x="20" y="10" width="120" height="100" fill="none" stroke="rgba(255,255,255,.1)"/><path d="${d}" fill="none" stroke="${T.accent}" stroke-width="2"/></svg><span class="mono" style="font-size:12px;font-weight:700">${name}</span><span class="mono" style="font-size:11px;color:${T.dim}">${note}</span></div>`;
  const body = `<div style="width:1200px;background:${T.bg};color:${T.text};padding:40px 48px 48px;display:flex;flex-direction:column;gap:32px;font-family:Manrope, 'Segoe UI', system-ui, sans-serif">
    <div style="display:flex;align-items:center;gap:16px">${logoMark(40)}<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:26px;font-weight:800;letter-spacing:-.01em">CampusLive · Motion sheet</span><span style="font-size:13px;color:${T.dim}">Only transform and opacity are animated · glow is a second stroked path, never filter</span></div></div>
    <div style="display:flex;flex-direction:column;border-radius:12px;border:1px solid ${T.line};overflow:hidden">
      <div style="display:grid;grid-template-columns:260px minmax(0,1fr) 340px;gap:16px;padding:12px 18px;background:rgba(255,255,255,.04)">${['MOMENT', 'MOTION', 'TIMING'].map((h) => `<span class="mono" style="font-size:11px;font-weight:800;letter-spacing:.14em;color:${T.accent}">${h}</span>`).join('')}</div>
      ${rows.map(([a, b, c], i) => `<div style="display:grid;grid-template-columns:260px minmax(0,1fr) 340px;gap:16px;padding:14px 18px;border-top:1px solid ${T.line}"><span style="font-size:14px;font-weight:700">${a}</span><span style="font-size:13px;color:${T.text}">${b}</span><span class="mono" style="font-size:12px;color:${T.dim}">${c}</span></div>`).join('')}
    </div>
    <div style="display:flex;gap:48px">
      ${curve('--ease-out', 'M 20 110 C 39 10, 56 10, 140 10', 'cubic-bezier(.16, 1, .3, 1) · rows, panels, fades')}
      ${curve('spring · floor focus', 'M 20 110 C 40 0, 50 -6, 70 14 S 100 22, 140 10', 'stiffness 120 · damping 18')}
      ${curve('flip · split-flap', 'M 20 110 L 60 110 L 60 60 L 100 60 L 100 10 L 140 10', '2 halves · 90 ms each · steps')}
      ${curve('--dur tokens', 'M 20 110 L 40 110 L 40 80 L 70 80 L 70 40 L 140 40', 'fast 150 · base 300 · slow 600')}
    </div>
  </div>`;
  return wrapDoc(body);
}

// ---------- flat floor plans ----------
function floorPlanBoard(n) {
  const body = `<div style="width:600px;height:1000px;background:${T.bg};position:relative;overflow:hidden;font-family:Manrope, system-ui, sans-serif">
    ${floorSvg(n, { mode: 'flat', labels: 'full', width: 600, height: 1000, phases: {} })}
    <div class="mono" style="position:absolute;left:14px;top:12px;display:flex;flex-direction:column;gap:3px"><span style="font-size:13px;font-weight:800;letter-spacing:.14em;color:${T.accent}">FLOOR ${n}</span><span style="font-size:10px;color:${T.dim};letter-spacing:.06em">viewBox 0 0 600 1000 · north up · east façade right</span></div>
    <div class="mono" style="position:absolute;right:14px;bottom:12px;font-size:10px;color:${T.dim};letter-spacing:.06em">ids: outline · zone-* · room-* · core-n · core-s · entrance-w · entrance-e${n === 2 ? ' · atrium' : ''}</div>
  </div>`;
  return wrapDoc(body);
}

// ---------- tokens.css ----------
const TOKENS_CSS = `/* CampusLive design tokens — dark theme (primary) */
:root {
  --bg: #0B0F17;
  --bg-elev: #111826;
  --panel: rgba(255,255,255,.04);
  --line: rgba(255,255,255,.08);
  --text: #E6EAF2;
  --text-dim: #8B94A7;
  --accent: #5EEAD4;

  --status-live: #2DD4BF;
  --status-soon: #FBBF24;
  --status-ending: #FB923C;
  --status-cancelled: #F87171;
  --status-moved: #A78BFA;
  --status-delayed: #F59E0B;

  --room-free: rgba(255,255,255,.10);
  --room-live: rgba(45,212,191,.45);
  --room-ending: rgba(251,146,60,.45);
  --room-soon: rgba(251,191,36,.35);
  --room-service: rgba(255,255,255,.025);

  --wing-north: rgba(96,165,250,.06);
  --wing-south: rgba(244,114,182,.06);
  --wing-core: rgba(134,239,172,.05);

  --slab: #161E2E;
  --slab-edge: #0A0E16;
  --slab-top: rgba(255,255,255,.12);

  --font-ui: "Manrope", "Inter", system-ui, sans-serif;
  --font-board: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;

  --radius: 12px;
  --radius-sm: 8px;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --dur-fast: 150ms;
  --dur-base: 300ms;
  --dur-slow: 600ms;

  /* layout at 1920×1080 */
  --header-h: 64px;
  --ticker-h: 40px;
  --board-w: 560px;
  --gutter: 16px;
  --row-h: 60px;
  --clock-size: 44px;
  --row-title: 18px;
  --row-sub: 13px;
  --chip-font: 12px;
}
`;

// ---------- write everything ----------
function write(name, html) { writeFileSync(`${OUT}/${name}`, html); console.log('wrote', name, (html.length / 1024).toFixed(0) + 'K'); }

write('Main.dc.html', screen(HERO, M1080));
write('Floor2Focus.dc.html', screen(FOCUS2, M1080));
write('Search.dc.html', screen(SEARCH, M1080));
write('TimeTravel.dc.html', screen({ ...TRAVEL, travelOpen: true }, M1080));
write('Kiosk4K.dc.html', screen(KIOSK, M1080, { zoom: 2 }));
write('AfterHours.dc.html', screen(AFTER, M1080));
write('Reconnecting.dc.html', screen(RECONNECT, M1080));
write('ApiDown.dc.html', screen(APIDOWN, M1080));
write('Compact720.dc.html', screen(HERO, M720));
write('Components.dc.html', componentSheet(M1080));
write('Motion.dc.html', motionSheet(M1080));
write('FloorPlan1.dc.html', floorPlanBoard(1));
write('FloorPlan2.dc.html', floorPlanBoard(2));

mkdirSync(`${OUT}/export`, { recursive: true });
writeFileSync(`${OUT}/export/tokens.css`, TOKENS_CSS);
writeFileSync(`${OUT}/export/floor-1.svg`, exportFloorSvg(1));
writeFileSync(`${OUT}/export/floor-2.svg`, exportFloorSvg(2));
writeFileSync(`${OUT}/export/floor-3.svg`, exportFloorSvg(3));
writeFileSync(`${OUT}/export/floor-4.svg`, exportFloorSvg(4));

// canvas layout
const G = 120; // gap
const canvas = {
  pages: [
    { id: 'screens', name: 'Screens' },
    { id: 'components', name: 'Components' },
    { id: 'plans', name: 'Floor plans' },
  ],
  artboards: [
    { file: 'Main.dc.html', title: '1 · Main — live, Tue 10:47', x: 0, y: 0, w: 1920, h: 1080, page: 'screens' },
    { file: 'Floor2Focus.dc.html', title: '2 · Floor 2 focused · room 213', x: 1920 + G, y: 0, w: 1920, h: 1080, page: 'screens' },
    { file: 'Search.dc.html', title: '3 · Search ⌘K · ПО2308', x: 0, y: 1080 + 160, w: 1920, h: 1080, page: 'screens' },
    { file: 'TimeTravel.dc.html', title: '4 · Time travel · 14:05 simulated', x: 1920 + G, y: 1080 + 160, w: 1920, h: 1080, page: 'screens' },
    { file: 'AfterHours.dc.html', title: '6 · After hours · 21:30', x: 0, y: 2 * (1080 + 160), w: 1920, h: 1080, page: 'screens' },
    { file: 'Reconnecting.dc.html', title: '7a · Reconnecting', x: 1920 + G, y: 2 * (1080 + 160), w: 1920, h: 1080, page: 'screens' },
    { file: 'ApiDown.dc.html', title: '7b · API down', x: 0, y: 3 * (1080 + 160), w: 1920, h: 1080, page: 'screens' },
    { file: 'Compact720.dc.html', title: '8 · 1280×720 — nothing scrolls', x: 1920 + G, y: 3 * (1080 + 160), w: 1280, h: 720, page: 'screens' },
    { file: 'Kiosk4K.dc.html', title: '5 · Kiosk 3840×2160 · floor auto-rotate', x: 0, y: 4 * (1080 + 160), w: 3840, h: 2160, page: 'screens' },
    { file: 'Components.dc.html', title: '9 · Component sheet', x: 0, y: 0, w: 1920, h: 1740, page: 'components' },
    { file: 'Motion.dc.html', title: 'Motion sheet', x: 1920 + G, y: 0, w: 1200, h: 860, page: 'components' },
    { file: 'FloorPlan1.dc.html', title: '10a · Floor 1 — flat plan (SVG source)', x: 0, y: 0, w: 600, h: 1000, page: 'plans' },
    { file: 'FloorPlan2.dc.html', title: '10b · Floor 2 — flat plan (SVG source)', x: 600 + G, y: 0, w: 600, h: 1000, page: 'plans' },
  ],
  annotations: [
    { id: 'brief', x: 0, y: -170, w: 720, page: 'screens', text: 'CampusLive — airport-board + 2.5D map, one screen, no scrolling.\nHero is artboard 1: iterate here first, every other screen inherits from it.\nBuilding silhouette traced from the floor-plan photos; rooms are invented (Appendix A).' },
    { id: 'plans-note', x: 0, y: -150, w: 560, page: 'plans', text: 'Flat plans at 600×1000 units — the SVG source for the map.\nLayer names: outline · zone-hall · zone-north · zone-south · room-<code> · core-n · core-s · entrance-w · entrance-e · atrium.\nClean SVG files exported alongside (floor-1.svg … floor-4.svg).' },
  ],
  launch: { view: 'canvas', page: 'screens' },
};
writeFileSync(`${OUT}/canvas.json`, JSON.stringify(canvas, null, 2));
console.log('canvas.json ok');
