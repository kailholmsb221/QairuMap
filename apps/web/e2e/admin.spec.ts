import { expect, test } from '@playwright/test';
import { API_URL, FREE_CELL, deleteLesson, filterBoard, listLessons, waitForApp } from './helpers';

/**
 * The panel the user asked for: put a class on the grid and watch the board react.
 * `201` at slot 5 (12:00) is free on the seeded Tuesday for the room, for
 * `Преподаватель 6` and for `Группа 4` — the one combination that clears every
 * conflict check the server runs.
 */
const TEACHER = 'Преподаватель 6';
const GROUP = 'Группа 4';

test('the admin grid draws the real building', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForSelector('[data-testid="grid"]');

  await expect(page.getByTestId('admin-badge')).toBeVisible();
  await expect(page.getByTestId('connection')).toHaveAttribute('data-connection', 'online');

  // 13 schedulable rooms, floor 1 first
  const heads = page.locator('[data-testid^="grid-room-"]');
  await expect(heads).toHaveCount(13);
  await expect(page.getByTestId('grid-room-100')).toBeVisible();
  await expect(page.getByTestId('grid-room-AI-LAB')).toBeVisible();
  await expect(page.getByTestId('grid-room-213')).toHaveCount(0); // not schedulable

  // the count line names the day the grid opened on
  await expect(page.getByTestId('lesson-count')).toContainText('Tuesday');

  // a weekday the seed never fills is empty, and says so
  await page.getByTestId('weekday-7').click();
  await expect(page.getByTestId('grid-empty')).toBeVisible();
  await page.getByTestId('weekday-2').click();
  await expect(page.getByTestId('grid-empty')).toHaveCount(0);
});

test('a class created in the panel appears on the board with no reload', async ({
  page,
  context,
  request,
}) => {
  // the board first: it must pick the new class up over SSE, in this same document
  const board = page;
  await board.goto('/');
  await waitForApp(board);
  await filterBoard(board, '201');

  const admin = await context.newPage();
  await admin.goto('/admin');
  await admin.waitForSelector('[data-testid="grid"]');
  await expect(admin.getByTestId(`cell-${FREE_CELL.roomCode}-${FREE_CELL.slotIdx}`)).toBeVisible();

  let created: string | null = null;
  try {
    await admin.getByTestId(`cell-${FREE_CELL.roomCode}-${FREE_CELL.slotIdx}`).click();
    const dialog = admin.getByTestId('lesson-dialog');
    await expect(dialog).toBeVisible();

    // 201 is a seminar room, so only a practice class belongs in it
    await admin.getByTestId('lesson-type-practice').click();
    await admin.getByTestId('lesson-teacher').selectOption({ label: TEACHER });
    await admin.getByTestId(`group-${GROUP}`).click();
    await admin.getByTestId('lesson-save').click();

    await expect(dialog).toHaveCount(0);

    // …it is on the grid
    const cell = admin.locator(
      `[data-room="${FREE_CELL.roomCode}"][data-slot="${FREE_CELL.slotIdx}"]`,
    );
    await expect(cell).toHaveCount(1);
    await expect(cell).toContainText(TEACHER);

    created =
      (await listLessons(request, FREE_CELL.weekday)).find(
        (l) => l.roomCode === FREE_CELL.roomCode && l.slotIdx === FREE_CELL.slotIdx,
      )?.id ?? null;
    expect(created).toBeTruthy();

    // …and on the board of the other tab, without a navigation
    await expect
      .poll(() => board.locator('[data-testid="board"] [data-room="201"]').count(), {
        timeout: 5000,
      })
      .toBeGreaterThan(0);
    expect(
      await board.evaluate(() => performance.getEntriesByType('navigation').length),
    ).toBe(1);

    // delete it again — and it leaves both screens
    await cell.click();
    await expect(admin.getByTestId('lesson-dialog')).toBeVisible();
    await admin.getByTestId('lesson-delete').click();
    await admin.getByTestId('lesson-delete-confirm').click();
    await expect(admin.getByTestId('lesson-dialog')).toHaveCount(0);
    created = null;

    await expect(
      admin.getByTestId(`cell-${FREE_CELL.roomCode}-${FREE_CELL.slotIdx}`),
    ).toBeVisible();
    await expect
      .poll(() => board.locator('[data-testid="board"] [data-room="201"]').count(), {
        timeout: 5000,
      })
      .toBe(0);
  } finally {
    if (created) await deleteLesson(request, created);
    await admin.close();
  }
});

test('the server refuses an impossible class against the offending field', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForSelector('[data-testid="grid"]');

  await page.getByTestId('cell-201-5').click();
  await expect(page.getByTestId('lesson-dialog')).toBeVisible();

  // a lecture does not belong in a seminar room — `400`, shown inline
  await page.getByTestId('lesson-type-lecture').click();
  await page.getByTestId(`group-${GROUP}`).click();
  await page.getByTestId('lesson-save').click();
  await expect(page.getByTestId('field-error').first()).toContainText('does not belong');
  await expect(page.getByTestId('lesson-dialog')).toBeVisible();

  // an empty attendance list never reaches the server at all
  await page.getByTestId('lesson-type-practice').click();
  await page.getByTestId(`group-${GROUP}`).click();
  await page.getByTestId('lesson-save').click();
  await expect(page.getByTestId('field-error').first()).toContainText('at least one group');
  await expect(page.getByTestId('lesson-dialog')).toBeVisible();

  await page.getByTestId('lesson-dialog-close').click();
  await expect(page.getByTestId('lesson-dialog')).toHaveCount(0);
});

test('a rejected key is reported instead of failing silently', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForSelector('[data-testid="grid"]');

  await page.getByTestId('api-key-edit').click();
  await page.getByTestId('api-key-input').fill('not-the-key');
  await page.getByTestId('api-key-save').click();

  await expect(page.getByTestId('api-key-note')).toBeVisible();
  await expect(page.getByTestId('grid-error')).toContainText('X-Api-Key');
  await expect(page.getByTestId('api-key-bar')).toHaveAttribute('data-key-state', 'rejected');

  // and the good key brings the grid back
  await page.getByTestId('api-key-clear').click();
  await expect(page.getByTestId('grid-error')).toHaveCount(0);
  await expect(page.locator('[data-course="HK1105"]').first()).toBeVisible();
});

test('the board offers a way into the panel', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.getByTestId('admin-trigger').click();
  const link = page.getByTestId('open-admin');
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForSelector('[data-testid="admin-app"]');
  await page.getByTestId('back-to-board').click();
  await page.waitForSelector('[data-testid="app"]');
});

test('the reference tables rename a placeholder in place', async ({ page, request }) => {
  await page.goto('/admin');
  await page.getByTestId('nav-reference').click();
  await expect(page.getByTestId('ref-teachers')).toBeVisible();

  const teachers = await request.get(`${API_URL}/api/v1/teachers`);
  const body = (await teachers.json()) as { teachers: { id: string; shortName: string }[] };
  const target = body.teachers.find((x) => x.shortName === 'Преподаватель 12');
  expect(target).toBeTruthy();
  const id = target!.id;

  await page.getByTestId(`ref-name-${id}`).click();
  await page.getByTestId(`ref-input-${id}`).fill('Ахметов Д. Б.');
  await page.getByTestId(`ref-input-${id}`).press('Enter');
  await expect(page.getByTestId(`ref-name-${id}`)).toContainText('Ахметов Д. Б.');

  // a name is on every board row, so the change is on the board too
  await page.getByTestId('nav-schedule').click();
  await expect(page.locator('[data-room="226"][data-slot="3"]')).toContainText('Ахметов Д. Б.');

  // put the placeholder back so the rest of the suite sees the seeded world
  await page.getByTestId('nav-reference').click();
  await page.getByTestId(`ref-name-${id}`).click();
  await page.getByTestId(`ref-input-${id}`).fill('Преподаватель 12');
  await page.getByTestId(`ref-input-${id}`).press('Enter');
  await expect(page.getByTestId(`ref-name-${id}`)).toContainText('Преподаватель 12');
});

test('a placeholder that still teaches cannot be deleted, and the panel says why', async ({
  page,
  request,
}) => {
  await page.goto('/admin');
  await page.getByTestId('nav-reference').click();

  const res = await request.get(`${API_URL}/api/v1/groups`);
  const body = (await res.json()) as { groups: { id: string; code: string }[] };
  const id = body.groups.find((g) => g.code === 'Группа 1')!.id;

  await page.getByTestId(`ref-delete-${id}`).click();
  await page.getByTestId(`ref-delete-confirm-${id}`).click();
  await expect(page.getByTestId(`ref-error-${id}`)).toContainText('still enrolled');
});
