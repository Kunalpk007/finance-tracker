import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// This repo was originally built inside a sandbox with a preinstalled, pinned
// Chromium binary (used here if present so local `npm run e2e` works without
// a download). CI and any normal dev machine won't have this path — Playwright
// falls back to its own managed browser there (see .github/workflows/ci.yml,
// which runs `npx playwright install --with-deps chromium` before the tests).
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 8_000
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    // e2e rehearses the offline LocalAdapter; blank vars override any .env.local Supabase config.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} } }
  ]
});
