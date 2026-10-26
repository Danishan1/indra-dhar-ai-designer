import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests (docs/plan/02-conventions.md §8). Needs infrastructure (`pnpm infra:up`). By default
 * Playwright starts the API and web dev servers itself, or reuses ones already running (`pnpm dev`).
 *
 * Env: E2E_BASE_URL (default http://localhost:3000), E2E_API_URL (default http://localhost:4000),
 * E2E_MAILPIT_URL (default http://localhost:8025), E2E_REDIS_URL (default redis://localhost:6379; auth
 * rate-limit counters are cleared so reruns are not throttled),
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE (use a preinstalled Chromium instead of `playwright install`).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const apiURL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  ...(executablePath ? { launchOptions: { executablePath } } : {}),
};

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Creates a verified user via API + Mailpit and saves a signed-in session.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...browser } },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...browser, storageState: '.auth/user.json' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @ai-designer/api dev',
      url: `${apiURL}/v1/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: '../..',
    },
    {
      // Processes uploads (I09). Has no HTTP port, so it always starts; a second worker next to
      // `pnpm dev` is harmless (jobs are claimed once).
      command: 'pnpm --filter @ai-designer/worker dev',
      wait: { stdout: /worker ready/ },
      timeout: 120_000,
      cwd: '../..',
    },
    {
      command: 'pnpm --filter @ai-designer/web dev',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: '../..',
    },
  ],
});
