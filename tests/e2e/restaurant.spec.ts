import { test, expect } from '@playwright/test';
import { loginToWorkspace } from './helpers';

test.describe('restaurant recipe/BOM — orders deduct ingredient stock automatically', () => {
  test('the menu screen shows seeded dishes with their recipe ingredients', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w2');
    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-goto="menu"]').click();
    await expect(page.getByTestId('menu-list')).toContainText('Butter Chicken');
    await expect(page.getByTestId('menu-list')).toContainText('Chicken'); // ingredient list
  });

  test('logging a sale shows up in the day-close summary', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w2');
    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-goto="orders"]').click();

    const naanRow = page.locator('.list-row', { hasText: 'Naan' });
    await naanRow.locator('input[type="number"]').fill('3');
    await naanRow.locator('button', { hasText: 'Sold' }).click();

    await page.getByText('Day close summary').click();
    await expect(page.getByTestId('dayclose-list')).toContainText('Naan');
  });

  test('an admin can add a new menu item', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w2');
    await page.locator('button[data-nav="settings"]').click();
    await page.locator('[data-goto="menu"]').click();

    await page.getByTestId('menu-name').fill('Playwright Special');
    await page.getByTestId('menu-price').fill('199');
    await page.getByTestId('menu-add').click();

    await expect(page.getByTestId('menu-list')).toContainText('Playwright Special');
  });
});
