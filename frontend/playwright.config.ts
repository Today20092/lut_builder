import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/screenshots/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4187/lut_builder/',
    locale: 'en-US',
    timezoneId: 'UTC',
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [320, 390, 1280].flatMap(width => (['light', 'dark'] as const).map(colorScheme => ({
    name: `${width}-${colorScheme}`,
    use: { viewport: { width, height: 900 }, colorScheme, hasTouch: width < 640, isMobile: width < 640, deviceScaleFactor: 1 },
  }))),
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187/lut_builder/',
    env: { LUT_BUILDER_PAGES: 'true' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
