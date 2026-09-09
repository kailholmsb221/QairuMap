import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

/**
 * Not assertions — this project writes the documentation screenshots into
 * `docs/screenshots/`. Run with `pnpm --filter web run shots`.
 */
const OUT = path.resolve(process.cwd(), '../../docs/screenshots');

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test.use({ reducedMotion: 'reduce' });

test('01 main — exploded view', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('board').hover();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '01-main-exploded.png') });
});

test('02 floor 2 focus with room 226 selected', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('floor-tab-2').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-room="226"]').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '02-focus-floor-2-room-226.png') });
});

test('03 search highlight', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('search-trigger').click();
  await page.getByTestId('search-input').fill('Группа 13');
  await page.getByTestId('search-item-Группа 13').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '03-search.png') });
  await page.getByTestId('search-item-Группа 13').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '04-search-highlight.png') });
});

test('05 time travel', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await waitForApp(page);
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 2);
  const bar = (await page.getByTestId('time-travel').boundingBox())!;
  await page.mouse.move(bar.x + bar.width * 0.507, bar.y + 46);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1600);
  await page.mouse.move(bar.x + bar.width * 0.507, bar.y + 46);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '05-time-travel.png') });
});

test('06 kiosk', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/kiosk?building=A&floorCycle=20s&page=8s');
  await page.waitForSelector('[data-testid="kiosk"]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '06-kiosk.png') });
});

test('07 compact 1280x720', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('board').hover();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '07-1280x720.png') });
});

test('08 after hours', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await waitForApp(page);
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 2);
  await page.getByTestId('time-travel').waitFor({ state: 'visible' });
  // scrub the day slider to its 20:00 end — the building is empty after the
  // last slot (17:00–17:50), which is the after-hours state
  const slider = page.getByRole('slider');
  await slider.focus();
  for (let i = 0; i < 40; i += 1) await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '20:00');
  await page.waitForTimeout(1500);
  await page.mouse.move(stage.x + stage.width / 2, stage.y + 40);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '08-after-hours.png') });
});

test('09 api down', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await waitForApp(page);
  // block every client call: the SSR frame still paints, then the stream and the
  // REST probe both fail, which is exactly the API-down state
  await page.route('**/api/v1/**', (route) => route.abort());
  await page.reload();
  await page.waitForSelector('[data-state="api-down"]', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '09-api-down.png') });
});

test('10 admin — the weekly grid', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/admin');
  await page.waitForSelector('[data-testid="grid"]');
  await page.waitForSelector('[data-testid="grid-skeleton"]', { state: 'detached' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '10-admin.png') });
});
