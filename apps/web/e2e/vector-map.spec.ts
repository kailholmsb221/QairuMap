import { expect, test, type Page } from '@playwright/test';
import vector from '@campuslive/map-data/vector-map.json' with { type: 'json' };
import { waitForApp } from './helpers';

const passiveRooms = ['102', '102A', 'CR', 'CINEMA', 'WC-1', 'WC-2'];

async function focusFloor(page: Page, floor: number) {
  await page.getByTestId(`floor-tab-${floor}`).click();
  await page.mouse.move(0, 0);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-mode', 'focus');
  await page.waitForTimeout(1800);
}

test('the vector plans sit on two animated slabs; walls always, doors and captions only in focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await waitForApp(page);
  await page.waitForTimeout(1800);
  await expect(page.locator('[data-floor-layer]')).toHaveCount(2);
  for (const floor of [1, 2]) {
    const svg = page.locator(`svg.floor-svg[data-floor="${floor}"]`);
    await expect(svg.locator('.plan-wall')).toHaveCount(vector.floors[String(floor) as '1' | '2'].walls.length);
    await expect(svg.locator('.plan-space')).toHaveCount(vector.floors[String(floor) as '1' | '2'].spaces.length);
    await expect(svg.locator(`#f${floor}-doors`)).toHaveCount(0);
    await expect(svg.locator(`#f${floor}-plan-labels`)).toHaveCount(0);
    expect(await page.locator(`[data-floor-layer="${floor}"]`).evaluate((el) => getComputedStyle(el).transform))
      .not.toBe('none');
  }
  // the exploded stack answers to the pointer
  const camera = page.getByTestId('scene').locator(':scope > div');
  const initial = await camera.getAttribute('style');
  const box = await page.getByTestId('scene').boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.7);
  await expect.poll(() => camera.getAttribute('style')).not.toBe(initial);
  await page.mouse.move(0, 0);

  for (const floor of [1, 2]) {
    await focusFloor(page, floor);
    const svg = page.locator(`svg.floor-svg[data-floor="${floor}"]`);
    await expect(svg.locator(`#f${floor}-doors`)).toHaveCount(1);
    await expect(svg.locator('.plan-door-leaf').first()).toBeAttached();
    await expect(svg.locator('.plan-stairs')).toHaveCount(2);
    await expect(svg.locator(`#f${floor}-plan-labels`)).toHaveCount(1);
    await expect(svg.locator('.plan-label--space').first()).toBeAttached();
    await expect(page.locator(`svg.floor-svg[data-floor="${3 - floor}"] #f${3 - floor}-doors`)).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-mode', 'exploded');
  expect(errors).toEqual([]);
});

test('every room is hit where its contour is, and the plan-only spaces never take the pointer', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  for (const floor of [1, 2] as const) {
    await focusFloor(page, floor);
    const rooms = vector.floors[String(floor) as '1' | '2'].rooms;
    const mismatches = await page.evaluate(({ floor, rooms, passiveRooms }) => {
      return Object.entries(rooms).flatMap(([code, room]) => {
        if (passiveRooms.includes(code)) return [];
        const path = document.querySelector<SVGPathElement>(`#f${floor}-room-${code}`)!;
        if (path.dataset.type === 'void') return [];
        const point = new DOMPoint(room.label.x, room.label.y).matrixTransform(path.getScreenCTM()!);
        const hit = document.elementFromPoint(point.x, point.y);
        return hit === path ? [] : [{ code, hit: hit?.id }];
      });
    }, { floor, rooms, passiveRooms });
    expect(mismatches).toEqual([]);
    for (const code of passiveRooms) {
      if (floor !== 1) break;
      const path = page.locator(`#f1-room-${code}`);
      await expect(path).toHaveAttribute('data-passive', 'true');
      await expect(path).not.toHaveAttribute('role', 'button');
    }
    // a corridor is drawn but is not a target
    await expect(page.locator(`svg.floor-svg[data-floor="${floor}"] .plan-space[data-space-type="corridor"]`).first())
      .toHaveCount(1);
    await expect(page.locator(`svg.floor-svg[data-floor="${floor}"] .plan-space[role="button"]`)).toHaveCount(0);
  }
});

test('a place the plan alone draws can be searched and pointed at', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('search-trigger').click();
  await page.getByTestId('search-input').fill('ковор');
  const hit = page.getByTestId('search-item-f1-cowork');
  await expect(hit).toBeVisible();
  await expect(hit).toContainText('Коворкинг');
  await hit.click();
  await expect(page.getByTestId('map-badge-f1-cowork')).toBeVisible();
  await expect(page.getByTestId('map-badge-f1-cowork')).toContainText('Коворкинг');
  await expect(page.locator('[data-space="f1-cowork"][data-highlighted]')).toHaveCount(1);
  // a place is not a room: nothing to select, no detail panel
  await focusFloor(page, 1);
  await expect(page.getByTestId('room-detail')).toHaveCount(0);
});

test('a room the plan has no space for still exists for the API but is not drawn', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await focusFloor(page, 2);
  for (const code of vector.floors['2'].unmapped) {
    await expect(page.locator(`#f2-room-${code}`)).toHaveCount(0);
  }
  await expect(page.locator('#f2-room-226')).toHaveCount(1);
});
