import { expect, test } from '@playwright/test';

test('the kiosk rotates the floor focus and pages the board on its own', async ({ page }) => {
  await page.goto('/kiosk?building=A&floorCycle=3s&page=2s');
  await page.waitForSelector('[data-testid="kiosk"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-session]').length > 0, undefined, {
    timeout: 15_000,
  });

  const indicator = page.getByTestId('kiosk-floor-indicator');
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText('NEXT FLOOR IN');

  const firstFloor = await indicator.getAttribute('data-floor');
  expect(firstFloor).toBeTruthy();

  // the floor indicator moves on within one cycle
  await expect
    .poll(async () => indicator.getAttribute('data-floor'), { timeout: 10_000 })
    .not.toBe(firstFloor);

  // and the board pages through its rows
  const firstRow = async () =>
    page.locator('[data-testid="board"] [data-session]').first().getAttribute('data-session');
  const before = await firstRow();
  await expect.poll(firstRow, { timeout: 10_000 }).not.toBe(before);

  // no interactive chrome in kiosk mode
  await expect(page.getByTestId('search-trigger')).toHaveCount(0);
  await expect(page.getByTestId('admin-trigger')).toHaveCount(0);
  await expect(page.getByTestId('time-travel-collapsed')).toHaveCount(0);
});
