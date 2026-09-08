import type { APIRequestContext, Page } from '@playwright/test';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
export const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? 'dev-admin-key';
export const BUILDING = 'A';
/** The fixed demo clock: Tuesday 2026-09-08 10:47:00 +05:00. */
export const DEMO_DATE = '2026-09-08';

export type Snapshot = {
  now: Session[];
  next: Session[];
  rooms: { roomCode: string; phase: string }[];
};

export type Session = {
  sessionId: string;
  lessonId?: string;
  courseCode: string;
  courseTitle: string;
  roomCode: string;
  groups: string[];
  status: string;
  phase: string;
};

export async function board(request: APIRequestContext): Promise<Snapshot> {
  const res = await request.get(`${API_URL}/api/v1/buildings/${BUILDING}/board`);
  return (await res.json()) as Snapshot;
}

/**
 * A seeded session of the demo day, e.g. the Assembly Hall's
 * `100 · HK1105 История Казахстана` that the SSE scenario cancels.
 */
export async function findSession(
  request: APIRequestContext,
  roomCode: string,
  courseCode: string,
): Promise<Session> {
  const snapshot = await board(request);
  const hit = [...snapshot.now, ...snapshot.next].find(
    (s) => s.roomCode === roomCode && s.courseCode === courseCode,
  );
  if (!hit) throw new Error(`no ${courseCode} in room ${roomCode} on the board`);
  return hit;
}

export async function createOverride(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/admin/overrides`, {
    headers: { 'X-Api-Key': ADMIN_KEY, 'Content-Type': 'application/json' },
    data: body,
  });
  if (!res.ok()) throw new Error(`override failed: ${res.status()} ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  return created.id;
}

export async function deleteOverride(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`${API_URL}/api/v1/admin/overrides/${id}`, {
    headers: { 'X-Api-Key': ADMIN_KEY },
  });
}

/**
 * Pin the board to one subject through the ⌘K palette.
 *
 * The board paginates (8 s a page), so a row for a specific room is not reliably
 * on screen. Filtering is the user-facing way to make it so, and it is what the
 * design intends: picking a search hit highlights the rooms and filters the board.
 */
export async function filterBoard(page: Page, code: string): Promise<void> {
  await page.getByTestId('search-trigger').click();
  await page.getByTestId('search-input').fill(code);
  const hit = page.getByTestId(`search-item-${code}`);
  await hit.waitFor({ state: 'visible' });
  await hit.click();
  await page.getByTestId('board-filter').waitFor({ state: 'visible' });
  // let the exiting rows finish their 300 ms leave animation
  await page.waitForTimeout(500);
}

/** The app is ready once the board has painted its first row. */
export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="board"]');
  await page.waitForSelector('[data-testid="scene"]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-session]').length > 0,
    undefined,
    { timeout: 15_000 },
  );
}

/* --------------------------------------------------------------- admin API */

/** A free cell of the seeded Tuesday grid: room `201`, slot 5 (12:00–12:50). */
export const FREE_CELL = { roomCode: '201', slotIdx: 5, weekday: 2 } as const;

export async function listLessons(
  request: APIRequestContext,
  weekday: number,
): Promise<{ id: string; roomCode: string; slotIdx: number; courseCode: string }[]> {
  const res = await request.get(`${API_URL}/api/v1/admin/lessons?weekday=${weekday}`, {
    headers: { 'X-Api-Key': ADMIN_KEY },
  });
  const body = (await res.json()) as {
    lessons: { id: string; roomCode: string; slotIdx: number; courseCode: string }[];
  };
  return body.lessons;
}

export async function deleteLesson(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`${API_URL}/api/v1/admin/lessons/${id}`, {
    headers: { 'X-Api-Key': ADMIN_KEY },
  });
}
