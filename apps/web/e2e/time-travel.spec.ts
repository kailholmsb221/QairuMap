import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

test('scrubbing the day bar puts the board in simulated mode, LIVE returns', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const stage = page.getByTestId('map-stage');
  const box = (await stage.boundingBox())!;

  // hover the 4 px line at the bottom of the stage to expand the day timeline
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
  const bar = page.getByTestId('time-travel');
  await expect(bar).toBeVisible();

  const track = (await bar.boundingBox())!;
  // 14:05 sits at 50.7 % of the 08:00–20:00 span
  await page.mouse.move(track.x + track.width * 0.507, track.y + 46);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByTestId('simulated')).toBeVisible();
  await expect(page.getByTestId('clock')).toHaveText(/^14:0/);
  await expect(page.getByTestId('board')).toContainText('14:00');

  await page.getByTestId('go-live').click();
  await expect(page.getByTestId('simulated')).toHaveCount(0);
  await expect(page.getByTestId('clock')).toHaveText(/^10:4/);
});
