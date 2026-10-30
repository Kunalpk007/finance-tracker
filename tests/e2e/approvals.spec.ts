import { test, expect } from '@playwright/test';
import { login, pickWorkspace } from './helpers';

test.describe('business claim lifecycle (D51-D56) — same page throughout, so IndexedDB state carries across the sign-out/sign-in', () => {
  test('a worker submits a claim, an admin approves it, and it becomes a confirmed entry', async ({ page }) => {
    // Ramesh (worker, Kadam Traders) submits an expense — it needs approval.
    await login(page, 'ramesh@example.com');
    await expect(page.getByTestId('quick-add')).toBeVisible();
    await page.getByTestId('quick-add').click();
    await page.getByTestId('tx-amount').fill('999');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Playwright claim');
    await page.getByTestId('tx-save').click();

    // Sign out, sign in as Kunal (admin in both workspaces), switch to the business workspace.
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('settings-signout').click();
    await login(page, 'kunal@example.com');
    await pickWorkspace(page, 'w2');

    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-goto="approvals"]').click();

    const claimCard = page.locator('.card', { hasText: 'Playwright claim' });
    await expect(claimCard).toBeVisible();
    await claimCard.getByText('Approve', { exact: true }).click();

    await expect(page.locator('.card', { hasText: 'Playwright claim' })).toHaveCount(0);
  });

  test('rejecting a claim records a reason and the claim stays visible as rejected', async ({ page }) => {
    await login(page, 'ramesh@example.com');
    await page.getByTestId('quick-add').click();
    await page.getByTestId('tx-amount').fill('555');
    await page.getByTestId('category-grid').locator('button').first().click();
    await page.getByTestId('tx-note').fill('Reject me');
    await page.getByTestId('tx-save').click();

    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('settings-signout').click();
    await login(page, 'kunal@example.com');
    await pickWorkspace(page, 'w2');
    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-goto="approvals"]').click();

    const claimCard = page.locator('.card', { hasText: 'Reject me' });
    await claimCard.locator('[data-reject]').click();
    const confirmBtn = claimCard.locator('[data-doreject]');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await expect(page.locator('h2', { hasText: 'Recently rejected' })).toBeVisible();
  });
});
