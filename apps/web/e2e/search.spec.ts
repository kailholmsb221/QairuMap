import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

test('searching a group highlights its room and filters the board', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const rowsBefore = await page.locator('[data-testid="board"] [data-session]').count();
  expect(rowsBefore).toBeGreaterThan(2);

  await page.getByTestId('search-trigger').click();
  await expect(page.getByTestId('search-palette')).toBeVisible();
  await page.getByTestId('search-input').fill('ПО2308');

  const hit = page.getByTestId('search-item-ПО2308');
  await expect(hit).toBeVisible();
  await hit.click();

  // the map badge over room 213
  const badge = page.getByTestId('map-badge-213');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('213');
  await expect(badge).toContainText('NOW');

  // 213 keeps its accent stroke, every other room drops to .35
  await expect(page.locator('#f2-room-213')).toBeVisible();
  const dimmed = await page.evaluate(() => {
    const other = document.querySelector('#f2-room-214');
    const group = other?.closest('g');
    return group?.getAttribute('opacity');
  });
  expect(dimmed).toBe('0.35');

  // the board is filtered to the group
  await expect(page.getByTestId('board-filter')).toContainText('ПО2308');
  // rows leave with a 300 ms exit animation, so poll rather than counting once
  await expect
    .poll(() => page.locator('[data-testid="board"] [data-session]').count(), { timeout: 5000 })
    .toBeLessThan(rowsBefore);
  await expect(page.locator('[data-testid="board"] [data-room="213"]').first()).toBeVisible();

  // Escape restores everything
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-filter')).toHaveCount(0);
  await expect(page.getByTestId('map-badge-213')).toHaveCount(0);
});

test('⌘K opens the palette', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('search-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-palette')).toHaveCount(0);
});
