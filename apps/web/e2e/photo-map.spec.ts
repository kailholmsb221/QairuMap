import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import photo from '@campuslive/map-data/photo-map.json' with { type: 'json' };
import { waitForApp } from './helpers';

const passiveRooms = ['102', '102A', 'CR', 'CINEMA', 'WC-1', 'WC-2'];

async function focusFloor(page: Page, floor: number) {
  await page.getByTestId(`floor-tab-${floor}`).click();
  await page.mouse.move(0, 0);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-mode', 'focus');
  await page.waitForTimeout(1800);
}

test('photographs stay on two animated slabs, with captions only in focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await waitForApp(page);
  await page.waitForTimeout(1800);
  await expect(page.locator('[data-floor-layer]')).toHaveCount(2);
  await expect(page.locator('.photo-room-hit')).toHaveCount(48);
  for (const floor of [1, 2]) {
    await expect(page.getByTestId(`floor-captions-${floor}`)).toHaveAttribute('opacity', '0');
    expect(await page.locator(`[data-floor-layer="${floor}"]`).evaluate((el) => getComputedStyle(el).transform))
      .not.toBe('none');
  }
  const camera = page.getByTestId('scene').locator(':scope > div');
  const initial = await camera.getAttribute('style');
  const box = await page.getByTestId('scene').boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.7);
  await expect.poll(() => camera.getAttribute('style')).not.toBe(initial);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '../../docs/screenshots/photo-map/exploded-desktop.png' });

  for (const floor of [1, 2]) {
    await focusFloor(page, floor);
    await expect(page.getByTestId(`floor-captions-${floor}`)).toHaveAttribute('opacity', '1');
    await expect(page.getByTestId(`floor-captions-${3 - floor}`)).toHaveAttribute('opacity', '0');
    await page.screenshot({ path: `../../docs/screenshots/photo-map/focus-floor-${floor}.png` });
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-mode', 'exploded');
  expect(errors).toEqual([]);
});

test('room hit targets follow photo contours, including duplicate captions', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  for (const floor of [1, 2] as const) {
    await focusFloor(page, floor);
    const mismatches = await page.evaluate(({ floor, rooms, passiveRooms }) => {
      return Object.entries(rooms).flatMap(([code, room]) => {
        if (passiveRooms.includes(code)) return [];
        const path = document.querySelector<SVGPathElement>(`#f${floor}-room-${code}`)!;
        if (path.dataset.type === 'void') return [];
        const point = new DOMPoint(room.label.x, room.label.y).matrixTransform(path.getScreenCTM()!);
        const hit = document.elementFromPoint(point.x, point.y);
        return hit === path ? [] : [{ code, hit: hit?.id }];
      });
    }, { floor, rooms: photo.floors[floor].rooms, passiveRooms });
    expect(mismatches).toEqual([]);
    for (const code of floor === 1 ? ['100', '101'] : ['226', '226A']) {
      await page.locator(`#f${floor}-room-${code}`).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('room-detail')).toBeVisible();
      await expect(page.locator(`#f${floor}-room-${code}`)).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Escape');
    }
  }
  const clippedCorner = await page.locator('#f2-room-219').evaluate((path: SVGPathElement) => {
    const box = path.getBBox();
    for (let x = box.x + 2; x < box.x + box.width; x += 3) {
      for (let y = box.y + 2; y < box.y + box.height; y += 3) {
        const point = new DOMPoint(x, y);
        if (path.isPointInFill(point)) continue;
        const screen = point.matrixTransform(path.getScreenCTM()!);
        return document.elementFromPoint(screen.x, screen.y) !== path;
      }
    }
    return false;
  });
  expect(clippedCorner).toBe(true);
});

test('first-floor public facilities are passive and cannot host new lessons', async ({ page, request }) => {
  await page.goto('/');
  await waitForApp(page);
  await focusFloor(page, 1);
  for (const code of passiveRooms) {
    await expect(page.locator(`#f1-room-${code}`)).toHaveCount(0);
    await expect(page.locator(`[data-room-tint="${code}"]`)).toHaveCount(0);
    const room = photo.floors[1].rooms[code as keyof typeof photo.floors[1]['rooms']];
    const point = await page.locator('svg.photo-floor-svg[data-floor="1"]').evaluate((svg: SVGSVGElement, label) => {
      const p = new DOMPoint(label.x, label.y).matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    }, room.label);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId('room-detail')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
  }
  await page.getByTestId('search-trigger').click();
  await page.getByTestId('search-input').fill('библиотека');
  await page.waitForTimeout(600);
  await expect(page.getByTestId('search-item-102')).toBeVisible();
  await expect(page.getByTestId('search-item-102A')).toBeVisible();
  await page.getByTestId('search-item-102').click();
  await expect(page.getByTestId('map-badge-102')).toBeVisible();
  await expect(page.getByTestId('map-badge-102')).toContainText('HERE');
  await expect(page.locator('[data-passive-highlight="102"]')).toBeVisible();
  await expect(page.locator('#f1-room-102')).toHaveCount(0);
  await expect(page.getByTestId('room-detail')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
  const rooms = (await (await request.get(`${api}/api/v1/buildings/A/rooms`)).json()).rooms;
  for (const code of passiveRooms) {
    expect(rooms.find((room: { code: string }) => room.code === code).schedulable).toBe(false);
  }
  const board = await (await request.get(`${api}/api/v1/buildings/A/board`)).json();
  expect([...board.now, ...board.next].some((s: { roomCode: string }) => passiveRooms.includes(s.roomCode))).toBe(false);
  const active = board.now.find((s: { roomCode: string }) => s.roomCode === '100');
  const move = await request.post(`${api}/api/v1/admin/overrides`, {
    headers: { 'X-Api-Key': 'dev-admin-key' },
    data: { date: board.date, kind: 'move', sessionId: active.sessionId, newRoomCode: 'CR' },
  });
  expect(move.status()).toBe(400);
  expect(await move.text()).toContain('not schedulable');
  const extra = await request.post(`${api}/api/v1/admin/overrides`, {
    headers: { 'X-Api-Key': 'dev-admin-key' },
    data: { date: board.date, kind: 'extra', courseCode: active.courseCode,
      teacherId: active.teacher.id, slotIdx: 3, roomCode: 'CR' },
  });
  if (extra.ok()) {
    const created = await extra.json();
    await request.delete(`${api}/api/v1/admin/overrides/${created.id}`, {
      headers: { 'X-Api-Key': 'dev-admin-key' },
    });
  }
  expect(extra.status()).toBe(400);
  expect(await extra.text()).toContain('not schedulable');
});

test('mobile keeps two slabs and a fitted floor without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('scene').waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '../../docs/screenshots/photo-map/exploded-mobile.png' });
  await focusFloor(page, 2);
  await page.screenshot({ path: '../../docs/screenshots/photo-map/focus-mobile.png' });
  expect(await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    vertical: document.documentElement.scrollHeight > innerHeight,
  }))).toEqual({ horizontal: false, vertical: false });
});

test('native-scale floor layers preserve photograph pixels outside tint masks', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  for (const floor of [1, 2] as const) {
    await focusFloor(page, floor);
    const result = await page.evaluate(async ({ floor, source }) => {
      const svg = document.querySelector<SVGSVGElement>(`svg.photo-floor-svg[data-floor="${floor}"]`)!;
      const copy = svg.cloneNode(true) as SVGSVGElement;
      const ns = 'http://www.w3.org/2000/svg';
      const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      const toData = (blob: Blob) => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      for (const image of copy.querySelectorAll('image')) {
        image.setAttribute('href', await toData(await (await fetch(image.getAttribute('href')!)).blob()));
        image.style.transition = 'none';
      }
      const originalPaths = svg.querySelectorAll('path');
      for (const [i, path] of copy.querySelectorAll('path').entries()) {
        const style = getComputedStyle(originalPaths[i]!);
        path.setAttribute('fill', style.fill);
        path.setAttribute('stroke', style.stroke);
      }
      // Focus glows are intentionally retained in the app, but not in this
      // source-pixel comparison of the base texture and its protected tint.
      copy.querySelectorAll('#f' + floor + '-rooms path[fill="none"]').forEach((p) => p.remove());
      const inverse = svg.querySelector<SVGImageElement>('[data-testid^="floor-texture"]')!
        .transform.baseVal.consolidate()!.matrix.inverse();
      const content = document.createElementNS(ns, 'g');
      content.setAttribute('transform', `matrix(${inverse.a} ${inverse.b} ${inverse.c} ${inverse.d} ${inverse.e} ${inverse.f})`);
      while (copy.firstChild) content.append(copy.firstChild);
      copy.append(content);
      copy.setAttribute('viewBox', `0 0 ${source.width} ${source.height}`);
      copy.setAttribute('width', String(source.width));
      copy.setAttribute('height', String(source.height));
      const makeCanvas = () => {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        return canvas;
      };
      const actual = makeCanvas();
      const a = actual.getContext('2d')!;
      const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      a.drawImage(await load(url), 0, 0);
      URL.revokeObjectURL(url);
      const reference = makeCanvas();
      const r = reference.getContext('2d')!;
      r.save();
      r.clip(new Path2D(source.sourceOutline));
      r.drawImage(await load(source.image), 0, 0);
      r.restore();
      const safeMask = makeCanvas();
      safeMask.getContext('2d')!.drawImage(await load(source.mask), 0, 0);
      const mask = safeMask.getContext('2d')!.getImageData(0, 0, source.width, source.height).data;
      const actualPixels = a.getImageData(0, 0, source.width, source.height).data;
      const referencePixels = r.getImageData(0, 0, source.width, source.height).data;
      let compared = 0;
      let mismatched = 0;
      let nonblank = 0;
      for (let y = 1; y < source.height - 1; y++) {
        for (let x = 1; x < source.width - 1; x++) {
          const i = (y * source.width + x) * 4;
          if (actualPixels[i + 3]! > 0) nonblank++;
          // One-pixel AA tolerance around the mask edge, never across a wall.
          let tint = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              tint ||= mask[((y + dy) * source.width + x + dx) * 4]! > 0;
            }
          }
          if (tint || referencePixels[i + 3]! < 255) continue;
          compared++;
          if ([0, 1, 2, 3].some((c) => Math.abs(actualPixels[i + c]! - referencePixels[i + c]!) > 4)) mismatched++;
        }
      }
      const overlay = makeCanvas();
      const o = overlay.getContext('2d')!;
      o.drawImage(reference, 0, 0);
      o.globalAlpha = 0.5;
      o.drawImage(actual, 0, 0);
      return {
        compared, mismatched, nonblank,
        actual: actual.toDataURL(), overlay: overlay.toDataURL(),
      };
    }, { floor, source: photo.floors[floor] });
    for (const key of ['actual', 'overlay'] as const) {
      writeFileSync(`../../docs/screenshots/photo-map/${key}-native-floor-${floor}.png`,
        Buffer.from(result[key].split(',')[1]!, 'base64'));
    }
    console.log(`Floor ${floor}: ${result.mismatched}/${result.compared} protected pixels differ; ${result.nonblank} painted pixels`);
    expect(result.nonblank).toBeGreaterThan(photo.floors[floor].width * photo.floors[floor].height * 0.4);
    expect(result.compared).toBeGreaterThan(10000);
    expect(result.mismatched / result.compared).toBeLessThan(0.005);
  }
});
