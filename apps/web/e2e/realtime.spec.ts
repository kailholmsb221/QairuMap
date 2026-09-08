import { expect, test } from '@playwright/test';
import {
  DEMO_DATE,
  createOverride,
  deleteOverride,
  filterBoard,
  findSession,
  waitForApp,
} from './helpers';

test('an admin cancel reaches the open board over SSE, without a reload', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await waitForApp(page);

  const databases = await findSession(request, '213', 'CS201');

  // pin the board to room 213 so the row cannot be paged away mid-assertion
  await filterBoard(page, '213');

  const row = page.locator('[data-testid="board"] [data-room="213"]').first();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-status', 'live');

  const room = page.locator('#f2-room-213');
  await expect(room).toHaveAttribute('data-phase', 'live');

  let overrideId: string | null = null;
  try {
    overrideId = await createOverride(request, {
      date: DEMO_DATE,
      kind: 'cancel',
      sessionId: databases.sessionId,
      note: 'e2e',
    });

    // the row must leave NOW (or be struck through) and the room must go free,
    // within the one-second budget plus a little slack for the assertion loop
    await expect
      .poll(
        async () =>
          page
            .locator(`[data-testid="board"] [data-session="${databases.sessionId}"]`)
            .count(),
        { timeout: 2000, intervals: [100, 100, 100] },
      )
      .toBe(0);

    await expect
      .poll(async () => room.getAttribute('data-phase'), {
        timeout: 2000,
        intervals: [100, 100, 100],
      })
      .not.toBe('live');

    // and it is still the same document — no navigation happened
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
  } finally {
    if (overrideId) await deleteOverride(request, overrideId);
  }

  // the board recovers when the override is withdrawn
  await expect
    .poll(async () => room.getAttribute('data-phase'), { timeout: 5000 })
    .toBe('live');
});

test('the connection dot reports the live stream', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  const dot = page.getByTestId('connection');
  await expect(dot).toHaveAttribute('data-connection', 'online');
  await expect(dot).toContainText('LIVE');
});
