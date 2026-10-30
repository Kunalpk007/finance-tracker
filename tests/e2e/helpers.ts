import type { Page } from '@playwright/test';

export async function login(page: Page, email: string, password = 'demo1234') {
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

export async function pickWorkspace(page: Page, workspaceId: 'w1' | 'w2') {
  await page.getByTestId(`workspace-${workspaceId}`).click();
}

export async function loginToWorkspace(page: Page, email: string, workspaceId: 'w1' | 'w2') {
  await login(page, email);
  // Kunal has two workspaces and lands on the picker; single-workspace users land on home directly.
  // Login is async (IndexedDB write + re-render), so wait for whichever screen actually
  // settles rather than taking an immediate (racy) isVisible() snapshot.
  const picker = page.getByTestId(`workspace-${workspaceId}`);
  const nav = page.locator('nav'); // becomes visible once authed AND a workspace is active, any role
  await Promise.race([
    picker.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {})
  ]);
  if (await picker.isVisible().catch(() => false)) {
    await picker.click();
    await nav.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  }
}
