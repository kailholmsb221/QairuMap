import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

const VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '3840x2160', width: 3840, height: 2160 },
];

test.describe('one screen, no scrolling', () => {
  for (const vp of VIEWPORTS) {
    test(`the page never scrolls at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await waitForApp(page);
      // let the auto-fit settle after the metrics for this viewport are applied
      await page.waitForTimeout(1200);

      const box = await page.evaluate(() => {
        const el = document.documentElement;
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          bodyScrollHeight: document.body.scrollHeight,
        };
      });

      expect(box.scrollHeight).toBe(box.clientHeight);
      expect(box.scrollWidth).toBe(box.clientWidth);
      expect(box.bodyScrollHeight).toBeLessThanOrEqual(box.clientHeight);
    });
  }

  test('the admin route never scrolls sideways', async ({ page }) => {
    // The panel is a working tool, so a scroll *inside* the grid is expected and
    // correct; the page itself must still never scroll horizontally.
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin');
      await page.waitForSelector('[data-testid="grid"]');
      await page.waitForTimeout(800);
      const box = await page.evaluate(() => {
        const el = document.documentElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      expect(box.scrollWidth, vp.name).toBe(box.clientWidth);
    }
  });

  test('the kiosk route does not scroll either', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/kiosk?floorCycle=20s&page=8s');
    await page.waitForSelector('[data-testid="kiosk"]');
    await page.waitForTimeout(1500);

    const box = await page.evaluate(() => {
      const el = document.documentElement;
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(box.scrollHeight).toBe(box.clientHeight);
    expect(box.scrollWidth).toBe(box.clientWidth);
  });
});
