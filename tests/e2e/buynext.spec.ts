import { test, expect } from '@playwright/test';
import { loginToWorkspace } from './helpers';

// Pantry is deprioritized this phase (household finance first) — nav entry point
// removed, so these are unreachable via the UI. Code and tests kept for when
// pantry work resumes; re-enable once pantry is back in the nav.
test.describe.skip("buy-next screen — Kunal's own example: check stock and last purchase before buying again", () => {
  test('typing a tracked item shows the current estimate and the last purchase record', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="pantry"]').click();
    await page.getByTestId('goto-buynext').click();

    await page.getByTestId('buynext-query').fill('onion');
    await expect(page.getByTestId('buynext-preview')).toBeVisible();
    await expect(page.getByTestId('buynext-estimate')).toContainText('left');
    await expect(page.getByTestId('buynext-last-purchase')).toContainText('Last bought');
    await expect(page.getByTestId('buynext-last-purchase')).toContainText('₹58'); // seeded onion price/kg
  });

  test('an item with no tracking history offers to add it as a new pantry item', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="pantry"]').click();
    await page.getByTestId('goto-buynext').click();

    await page.getByTestId('buynext-query').fill('saffron');
    await expect(page.getByTestId('buynext-preview-new')).toBeVisible();
    await expect(page.getByTestId('buynext-preview-new')).toContainText("isn't tracked yet");
  });

  test('adding an item lands it on the shopping list', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="pantry"]').click();
    await page.getByTestId('goto-buynext').click();

    await page.getByTestId('buynext-query').fill('Playwright Test Item');
    await page.getByTestId('buynext-add').click();

    await expect(page.locator('.listitem', { hasText: 'Playwright Test Item' })).toBeVisible();
  });

  test('a worker cannot see pantry stock at all', async ({ page }) => {
    await loginToWorkspace(page, 'ramesh@example.com', 'w2');
    await page.locator('button[data-nav="pantry"]').click();
    await expect(page.locator('.empty')).toContainText('not shown to workers');
  });
});
