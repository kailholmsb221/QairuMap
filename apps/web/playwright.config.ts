import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
// `localhost`, not `127.0.0.1`: the API's CORS allow-list is an exact origin
// match, and `infra/.env.example` ships `CORS_ORIGINS=http://localhost:3000`.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/**
 * The suite runs against the real Go API with `CLOCK_MODE=fixed`
 * (Tuesday 2026-09-08 10:47:00 +05:00), so every assertion is deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Almaty',
    locale: 'en-GB',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/screenshots.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      // not assertions — writes docs/screenshots/*.png
      name: 'screenshots',
      testMatch: '**/screenshots.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    // `pnpm run start -- --port` forwards the `--` to `next start`, which then reads
    // it as a project directory; go through `pnpm exec` so the flag lands cleanly.
    command: `pnpm run build && pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      API_URL,
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_ADMIN_API_KEY: process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? 'dev-admin-key',
      PORT: String(PORT),
    },
  },
});
