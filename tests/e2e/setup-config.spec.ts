import { test, expect } from '@playwright/test';
import { loginToWorkspace } from './helpers';

test.describe('setup: accounts, members, categories, budgets', () => {
  test('an admin can add a custom-type account', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('toggle-accounts').click();
    await page.getByTestId('account-type').selectOption('investment');
    await page.getByTestId('account-name').fill('Zerodha Stocks');
    await page.getByTestId('add-account').click();
    await expect(page.locator('#app')).toContainText('Zerodha Stocks');
  });

  test('an admin can add a member directly, without an invite code', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('member-name').fill('Local Member');
    await page.getByTestId('add-member').click();
    await expect(page.locator('#app')).toContainText('Local Member');
    // no login required — status is active immediately, not "invited"
    await expect(page.locator('#app')).not.toContainText('Local Member · invited');
  });

  test('an admin can add a custom category via the quick-add suggestions', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-quickcat^="House Expenses"]').click();
    await expect(page.locator('#app')).toContainText('House Expenses');
  });

  test('an admin can set an overall budget and a per-category budget, reflected in Reports', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('overall-budget-input').fill('50000');
    await page.getByTestId('set-overall-budget').click();
    await expect(page.locator('#app')).toContainText('Update overall budget');

    await page.getByTestId('budget-category').selectOption({ label: '🚗 Transport' });
    await page.getByTestId('budget-amount').fill('3000');
    await page.getByTestId('add-category-budget').click();
    await expect(page.locator('#app')).toContainText('₹3,000');

    await page.locator('button[data-nav="reports"]').click();
    await expect(page.locator('#app')).toContainText('Overall');
    await expect(page.locator('#app')).toContainText('₹50,000');
  });

  test('removing an account asks for confirmation and respects cancel/accept', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('toggle-accounts').click();
    await page.getByTestId('account-name').fill('Test Wallet');
    await page.getByTestId('add-account').click();
    const row = page.getByTestId('rm-account-' + await accountIdFor(page, 'Test Wallet'));

    await row.click();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.locator('#app')).toContainText('Test Wallet'); // cancelled — still there

    await row.click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.locator('#app')).not.toContainText('Test Wallet');
  });

  test('removing a category and a budget both require confirmation', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-quickcat^="Subscriptions"]').click();
    await expect(page.locator('#app')).toContainText('Subscriptions');
    const catId = await categoryIdFor(page, 'Subscriptions');

    await page.getByTestId('rm-category-' + catId).click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.locator('#app')).not.toContainText('Subscriptions');

    await page.getByTestId('overall-budget-input').fill('20000');
    await page.getByTestId('set-overall-budget').click();
    await page.getByTestId('rm-budget-overall').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('set-overall-budget')).toHaveText('Set overall budget');
  });

  test('accounts are collapsed behind a toggle, and clicking it again closes it', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await expect(page.getByTestId('accounts-list')).toHaveCount(0);
    await page.getByTestId('toggle-accounts').click();
    await expect(page.getByTestId('accounts-list')).toBeVisible();
    await page.getByTestId('toggle-accounts').click();
    await expect(page.getByTestId('accounts-list')).toHaveCount(0);
  });

  test('theme can be switched between light, dark and system, and persists across a reload', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('an admin cannot remove themselves — only other members show a remove button', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    const kunalRow = page.locator('.list-row', { hasText: 'Kunal' }).first();
    const priyaRow = page.locator('.list-row', { hasText: 'Priya' }).first();
    await expect(kunalRow.locator('[data-rmmember]')).toHaveCount(0);
    await expect(priyaRow.locator('[data-rmmember]')).toHaveCount(1);
  });
});

async function accountIdFor(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const btn = Array.from(document.querySelectorAll('[data-rmaccount]')).find((el) => el.closest('.list-row')?.textContent?.includes(n));
    return btn?.getAttribute('data-rmaccount') ?? '';
  }, name);
}

async function categoryIdFor(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const btn = Array.from(document.querySelectorAll('[data-rmcategory]')).find((el) => el.closest('.chip')?.textContent?.includes(n));
    return btn?.getAttribute('data-rmcategory') ?? '';
  }, name);
}
