import { expect, test } from '@playwright/test';
import { waitForApp, focusFloor } from './helpers';

// Reduced motion keeps the springs, marquee and split-flap still, so the only
// moving pixels left are the clock and the countdowns — which are masked.
test.use({ reducedMotion: 'reduce', viewport: { width: 1920, height: 1080 } });

test('main screen', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  // pause the pager so the board always shows page 1
  await page.getByTestId('board').hover();
  await page.waitForTimeout(1200);

  await expect(page).toHaveScreenshot('main.png', {
    mask: [page.getByTestId('clock'), page.locator('[data-pill="ending"]')],
    maxDiffPixelRatio: 0.02,
  });
});

test('floor 2 focus', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await focusFloor(page, 2);
  await page.getByTestId('board').hover();
  await page.waitForTimeout(1500);

  await expect(page).toHaveScreenshot('focus-floor-2.png', {
    mask: [
      page.getByTestId('clock'),
      page.locator('[data-pill="ending"]'),
    ],
    maxDiffPixelRatio: 0.02,
  });
});
