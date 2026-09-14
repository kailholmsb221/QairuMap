import { expect, test } from '@playwright/test';
import { openSearch, waitForApp } from './helpers';

test('the header carries no controls at all; search and focus still have their ways in', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await expect(page.locator('header button, header a')).toHaveCount(0);
  for (const id of ['floor-tab-1', 'floor-tab-2', 'search-trigger', 'kiosk-link']) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await openSearch(page);
  await expect(page.getByTestId('search-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('floor-label-2').click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-mode', 'focus');
});
