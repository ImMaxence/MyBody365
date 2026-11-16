import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the full local stack (nginx + Spring Boot + PostgreSQL):
 *
 *   docker compose -f docker-compose.local.yml up --build -d --wait
 *   npm run e2e
 *
 * The stack runs with DEV_LOGIN=true, so the tests sign in without Google. E2E_BASE_URL points
 * elsewhere if needed (never at production: the local sign-in does not exist there).
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4300';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /landing\.spec\.ts/ },
  ],
});
