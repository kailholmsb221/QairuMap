import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

test('floor tab 2 enters focus view and room 213 opens the detail panel', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const scene = page.getByTestId('scene');
  await expect(scene).toHaveAttribute('data-mode', 'exploded');

  await page.getByTestId('floor-tab-2').click();
  await expect(scene).toHaveAttribute('data-mode', 'focus');

  // chips appear over the focused plate
  const chip = page.locator('[data-room-chip="213"]');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('213');
  await expect(chip).toContainText('CS201');

  await chip.click();

  const panel = page.getByTestId('room-detail');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('213');
  await expect(panel).toContainText('Lecture Hall "Gamma"');
  await expect(panel).toContainText('CS201');
  await expect(panel).toContainText('Databases');
  await expect(panel).toContainText('Akhmetov');
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

  const room = page.locator('#f2-room-213');
  await expect(room).toHaveAttribute('role', 'button');
  await expect(room).toHaveAttribute('tabindex', '0');
  const label = await room.getAttribute('aria-label');
  expect(label).toContain('213');
  expect(label).toContain('Gamma');
  expect(label).toContain('CS201 Databases');

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
