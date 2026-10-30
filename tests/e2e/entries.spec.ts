import { test, expect } from '@playwright/test';
import { loginToWorkspace } from './helpers';

test.describe('logging an entry (household, direct — no approval needed)', () => {
  test('Priya can add an expense and see it in the entries list', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();

    await page.getByTestId('tx-amount').fill('450');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Playwright test entry');
    await page.getByTestId('tx-save').click();

    await expect(page.getByTestId('tx-list')).toContainText('₹450');
  });

  test('a duplicate-looking entry (same amount/day/vendor) is warned but not blocked', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');

    for (let i = 0; i < 2; i++) {
      await page.locator('#fab').click();
      await page.getByTestId('tx-amount').fill('777');
      await page.getByTestId('category-grid').locator('button').first().click();
      await page.getByTestId('tx-vendor').fill('Test Vendor');
      if (i === 1) {
        await expect(page.getByTestId('dupe-warning')).toBeVisible();
        await page.locator('[data-ackdupe]').click();
      }
      await page.getByTestId('tx-save').click();
    }
    const rows = page.getByTestId('tx-list').locator('.tx');
    await expect(rows.filter({ hasText: '₹777' })).toHaveCount(2);
  });

  test('opening an entry shows its detail screen, and its own owner can edit it', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    // Log a fresh entry so we know for certain Priya owns it — seed data's
    // random account assignment doesn't guarantee any given seeded row is hers.
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('321');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Detail screen test');
    await page.getByTestId('tx-save').click();

    // The list row shows amount/category/date, not the note — open by amount and
    // confirm we landed on the right entry via its note on the detail screen.
    await page.locator('.tx', { hasText: '₹321' }).click();
    await expect(page.getByTestId('detail-card')).toBeVisible();
    await expect(page.getByTestId('detail-card')).toContainText('Detail screen test');
    await expect(page.getByTestId('detail-edit')).toBeVisible();
  });

  test('switching category keeps the amount and note already typed in', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('555');
    await page.getByTestId('tx-note').fill('Keep me');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('category-grid').locator('button').nth(1).click();

    await expect(page.getByTestId('tx-amount')).toHaveValue('555');
    await expect(page.getByTestId('tx-note')).toHaveValue('Keep me');
  });

  test('editing an entry opens a modal pre-filled with its values, with category as a dropdown, and updating it does not create a duplicate', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('222');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Original note');
    await page.getByTestId('tx-save').click();

    await page.locator('.tx', { hasText: '₹222' }).click();
    await page.getByTestId('detail-edit').click();

    const modal = page.locator('#txEditModal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('edit-tx-amount')).toHaveValue('222');
    await expect(page.getByTestId('edit-tx-category')).toBeVisible(); // a <select>, not the tap-grid
    await expect(page.locator('#txEditModal [data-testid="category-grid"]')).toHaveCount(0);

    await page.getByTestId('edit-tx-amount').fill('299');
    await page.getByTestId('edit-tx-category').selectOption({ index: 1 });
    await page.getByTestId('edit-tx-save').click();
    await expect(modal).toBeHidden();
    // saving the edit closes the modal but doesn't navigate away — still on the detail screen
    await expect(page.getByTestId('detail-card')).toContainText('₹299');

    await page.locator('button[data-nav="tx"]').click();
    const rows = page.getByTestId('tx-list').locator('.tx');
    await expect(rows.filter({ hasText: '₹299' })).toHaveCount(1);
    await expect(rows.filter({ hasText: '₹222' })).toHaveCount(0);
  });

  test('cancelling the edit modal discards changes', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('411');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-save').click();

    await page.locator('.tx', { hasText: '₹411' }).click();
    await page.getByTestId('detail-edit').click();
    await page.getByTestId('edit-tx-amount').fill('999');
    await page.getByTestId('edit-tx-cancel').click();

    await expect(page.locator('#txEditModal')).toHaveCount(0);
    await expect(page.getByTestId('detail-card')).toContainText('₹411');
  });

  test('searching the entries list filters by note/vendor/category/amount', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('633');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Searchable Note Xyz');
    await page.getByTestId('tx-save').click();

    await page.getByTestId('tx-search').fill('Searchable Note Xyz');
    const rows = page.getByTestId('tx-list').locator('.tx');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('₹633');

    await page.getByTestId('tx-search').fill('no such entry exists');
    await expect(page.getByTestId('tx-list')).toContainText('Nothing matches');
  });

  test('repeating a past entry from the list creates a new one dated today, without opening a form', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('188');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Repeat me');
    await page.getByTestId('tx-save').click();

    await page.getByTestId('tx-search').fill('Repeat me');
    const before = await page.getByTestId('tx-list').locator('.tx').count();
    await page.locator('.tx', { hasText: '₹188' }).locator('[data-repeat]').click();
    await page.getByTestId('confirm-ok').click();

    await expect(page.getByTestId('tx-list').locator('.tx')).toHaveCount(before + 1);
    await expect(page.getByTestId('tx-list').locator('.tx').filter({ hasText: '₹188' })).toHaveCount(2);
  });

  test('repeating from the detail screen also works', async ({ page }) => {
    await loginToWorkspace(page, 'priya@example.com', 'w1');
    await page.locator('#fab').click();
    await page.getByTestId('tx-amount').fill('274');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-save').click();

    await page.locator('.tx', { hasText: '₹274' }).click();
    await page.getByTestId('detail-repeat').click();
    await page.getByTestId('confirm-ok').click();

    await page.locator('button[data-nav="tx"]').click();
    await expect(page.getByTestId('tx-list').locator('.tx').filter({ hasText: '₹274' })).toHaveCount(2);
  });
});
