import { test, expect } from '@playwright/test';
import { login, loginToWorkspace } from './helpers';

test.describe('authentication and workspace switching', () => {
  test('rejects a wrong password with an error message', async ({ page }) => {
    await login(page, 'kunal@example.com', 'wrongpassword');
    await expect(page.getByTestId('auth-error')).toBeVisible();
    await expect(page.getByTestId('auth-error')).toContainText('incorrect');
  });

  test('Kunal (two workspaces) lands on a workspace picker after login', async ({ page }) => {
    await login(page, 'kunal@example.com');
    await expect(page.getByTestId('workspace-w1')).toBeVisible();
    await expect(page.getByTestId('workspace-w2')).toBeVisible();
  });

  test('signing into the household workspace shows the household dashboard', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await expect(page.getByTestId('spend-so-far')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Our Home');
  });

  test('a single-workspace user (Priya) skips the picker entirely', async ({ page }) => {
    await login(page, 'priya@example.com');
    await expect(page.getByTestId('spend-so-far')).toBeVisible();
  });

  test('signing out returns to the login screen', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('settings-signout').click();
    await expect(page.getByTestId('login-email')).toBeVisible();
  });

  test('switch workspace returns to the picker without signing out', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="settings"]').click();
    await page.getByTestId('switch-workspace').click();
    await expect(page.getByTestId('workspace-w2')).toBeVisible();
  });
});
