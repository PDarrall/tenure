import { defineConfig, devices } from '@playwright/test'

/**
 * The season smoke: iPad Safari's viewport in Chromium, against the built
 * app served by Vite's preview server. Locally PW_CHROMIUM can point at an
 * installed Chromium; CI installs its own.
 */
const executablePath = process.env['PW_CHROMIUM']

export default defineConfig({
  testDir: './e2e',
  timeout: 15 * 60 * 1000,
  expect: { timeout: 20 * 1000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/tenure/',
    actionTimeout: 20 * 1000,
    navigationTimeout: 30 * 1000,
    ...devices['iPad (gen 7)'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    // The iPad device profile asks for WebKit; the smoke runs in Chromium, which is what the CI runner has.
    defaultBrowserType: 'chromium',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/tenure/',
    reuseExistingServer: !process.env['CI'],
    timeout: 60 * 1000,
  },
})
