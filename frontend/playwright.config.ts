import { defineConfig, devices } from '@playwright/test'

// Set UI_PORT when 4187 is taken, for example by another checkout's dev server.
const port = Number(process.env.UI_PORT ?? 4187)

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${port}/lut_builder/`,
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
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/lut_builder/`,
    env: { LUT_BUILDER_PAGES: 'true' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
