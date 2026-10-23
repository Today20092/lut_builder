import { defineConfig, devices } from '@playwright/test'

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
  projects: [devices['iPhone 13'].viewport, devices['iPhone 14 Pro Max'].viewport, { width: 1280, height: 900 }].flatMap(viewport => (['light', 'dark'] as const).map(colorScheme => ({
    name: `${viewport.width}-${colorScheme}`,
    // Pure recovery behavior needs each navigation layout, not every theme/phone width.
    grepInvert: colorScheme === 'light' && viewport.width !== 430 ? undefined : /@behavior/,
    use: { viewport, colorScheme, hasTouch: viewport.width < 960, isMobile: viewport.width < 960, deviceScaleFactor: 1 },
  }))),
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187/lut_builder/',
    env: { LUT_BUILDER_PAGES: 'true' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
