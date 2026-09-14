import { expect, test } from '@playwright/test';
import { waitForApp, focusFloor } from './helpers';

test('floor tab 2 enters focus view and room 226 opens the detail panel', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const scene = page.getByTestId('scene');
  await expect(scene).toHaveAttribute('data-mode', 'exploded');

  await focusFloor(page, 2);
  await expect(scene).toHaveAttribute('data-mode', 'focus');

  // the room itself is the target — the plate prints the number, not a chip
  const room = page.locator('[data-room="226"]');
  await expect(room).toBeVisible();

  await room.click();

  const panel = page.getByTestId('room-detail');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('226');
  // the building's own bilingual list: Kazakh first, English under it
  await expect(panel).toContainText('Оқу зертханасы');
  await expect(panel).toContainText('Teaching Laboratory');
  await expect(panel).toContainText('IP1302');
  await expect(panel).toContainText('Введение в программирование');
  await expect(panel).toContainText('Преподаватель 12');
  await expect(panel).toContainText('NEXT IN THIS ROOM');

  // Escape closes the panel, a second Escape leaves focus
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-detail')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(scene).toHaveAttribute('data-mode', 'exploded');
});

test('rooms are keyboard reachable and labelled', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const room = page.locator('#f2-room-226');
  await expect(room).toHaveAttribute('role', 'button');
  await expect(room).toHaveAttribute('tabindex', '0');
  const label = await room.getAttribute('aria-label');
  expect(label).toContain('226');
  expect(label).toContain('Teaching Laboratory');
  expect(label).toContain('IP1302 Введение в программирование');

  await room.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-detail')).toBeVisible();
});

test('the board is a semantic table', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await expect(page.getByRole('table', { name: 'Departures board' })).toBeVisible();
  expect(await page.getByRole('row').count()).toBeGreaterThan(2);
});
