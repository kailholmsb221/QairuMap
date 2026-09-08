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

  // the Assembly Hall runs HK1105 10:00–11:50 at the demo instant
  const history = await findSession(request, '100', 'HK1105');

  // pin the board to room 100 so the row cannot be paged away mid-assertion
  await filterBoard(page, '100');

  const row = page.locator('[data-testid="board"] [data-room="100"]').first();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-status', 'live');

  const room = page.locator('#f1-room-100');
  await expect(room).toHaveAttribute('data-phase', 'live');

  let overrideId: string | null = null;
  try {
    overrideId = await createOverride(request, {
      date: DEMO_DATE,
      kind: 'cancel',
      sessionId: history.sessionId,
      note: 'e2e',
    });

    // the row must leave NOW (or be struck through) and the room must go free,
    // within the one-second budget plus a little slack for the assertion loop
    await expect
      .poll(
        async () =>
          page
            .locator(`[data-testid="board"] [data-session="${history.sessionId}"]`)
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
