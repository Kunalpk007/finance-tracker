import { test, expect } from '@playwright/test';
import { loginToWorkspace } from './helpers';

test.describe('dashboard, reports, and backup', () => {
  test('dashboard shows a pace projection against the rolling average', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await expect(page.getByTestId('spend-so-far')).toBeVisible();
    await expect(page.locator('#app')).toContainText('On pace for');
  });

  test('reports screen shows category totals and can navigate months', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="reports"]').click();
    await expect(page.getByTestId('report-table')).toBeVisible();
    await page.getByTestId('report-prev').click();
    await expect(page.getByTestId('report-table')).toBeVisible();
  });

  test('downloading a backup triggers a file download', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-backup').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('an admin can invite a new member and see the pending invite', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('member-name').fill('Playwright Invitee');
    await page.getByTestId('invite-create').click();
    await expect(page.locator('#app')).toContainText('Playwright Invitee');
  });

  test('an over-limit budget surfaces as a nudge on Home, not just in Reports', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    // ₹1 overall budget guarantees this month's already-seeded spend blows past it
    await page.getByTestId('overall-budget-input').fill('1');
    await page.getByTestId('set-overall-budget').click();

    await page.locator('button[data-nav="home"]').click();
    await expect(page.getByTestId('insights')).toContainText('Over budget');
    await expect(page.locator('#app')).toContainText('Your overall budget is over budget by');
  });
});
