#!/usr/bin/env node
// CampusLive 90-second demo script (ARCHITECTURE.md §13).
//
// Posts three admin calls over 90 seconds so a screen recording shows the board
// rebuilding live: a cancellation at t+10s, a move at t+45s, an announcement at
// t+80s. Targets are picked from the live board so the script works against any
// seed.
//
//   API_URL=http://localhost:8080 ADMIN_API_KEY=demo-admin-key pnpm demo:script

const API_URL = (process.env.API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'demo-admin-key';
const BUILDING = process.env.BUILDING ?? 'A';
const FAST = process.env.DEMO_FAST === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 500) : ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function api(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': ADMIN_API_KEY,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

function localDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

async function main() {
  log(`API ${API_URL} · building ${BUILDING}`);

  const board = await api(`/api/v1/buildings/${BUILDING}/board`);
  const date = board.date ?? localDate(board.at);
  const upcoming = [...(board.next ?? [])].filter((s) => s.status === 'scheduled');
  const running = [...(board.now ?? [])].filter((s) => s.status === 'scheduled');

  if (upcoming.length < 2) {
    console.error('Not enough upcoming sessions to run the demo — check the seed and the clock mode.');
    process.exit(1);
  }

  const toCancel = upcoming[0];
  const toMove = upcoming[1];

  // A free room on the same floor as the session we are moving.
  const busy = new Set((board.rooms ?? []).filter((r) => r.phase !== 'free').map((r) => r.roomCode));
  const target =
    (board.rooms ?? []).find((r) => r.floor === toMove.floor && !busy.has(r.roomCode)) ??
    (board.rooms ?? []).find((r) => !busy.has(r.roomCode));

  log(`plan: cancel ${toCancel.roomCode}/${toCancel.courseCode}, move ${toMove.roomCode} → ${target?.roomCode ?? '—'}`);

  // ---- t + 10s: cancel a session -------------------------------------------
  await sleep(10_000);
  const cancelled = await api('/api/v1/admin/overrides', {
    method: 'POST',
    body: JSON.stringify({
      date,
      kind: 'cancel',
      lessonId: toCancel.lessonId,
      sessionId: toCancel.sessionId,
      note: 'Demo: lecturer unavailable',
    }),
  });
  log(`cancelled ${toCancel.courseCode} in ${toCancel.roomCode} (override ${cancelled.id})`);

  // ---- t + 45s: move a session ---------------------------------------------
  await sleep(35_000);
  if (target) {
    const moved = await api('/api/v1/admin/overrides', {
      method: 'POST',
      body: JSON.stringify({
        date,
        kind: 'move',
        lessonId: toMove.lessonId,
        sessionId: toMove.sessionId,
        newRoomCode: target.roomCode,
        note: 'Demo: room reassigned',
      }),
    });
    log(`moved ${toMove.courseCode} ${toMove.roomCode} → ${target.roomCode} (override ${moved.id})`);
  } else {
    log('no free room found — skipping the move');
  }

  // ---- t + 80s: announcement ------------------------------------------------
  await sleep(35_000);
  const ann = await api('/api/v1/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({
      building: BUILDING,
      text: `Open lecture in the Assembly Hall at 18:00 — all welcome`,
      severity: 'info',
      ttlMinutes: 30,
    }),
  });
  log(`announcement posted (${ann.id})`);

  const after = await api(`/api/v1/buildings/${BUILDING}/board`);
  log(`done — ${(after.now ?? []).length} now / ${(after.next ?? []).length} next, ${running.length} running at start`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
