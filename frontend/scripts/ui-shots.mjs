// Fast local UI review: screenshots of every screen plus axe and overflow checks. Needs a running dev server.
import { mkdir, rm } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

const url = process.env.UI_URL ?? 'http://localhost:5173/'
const out = new URL('../test-results/shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const widths = (process.env.UI_WIDTHS ?? '320,390,768,1280').split(',').map(Number)
const started = Date.now()
const problems = []
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
const browser = await chromium.launch()

async function capture(page, name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true })
  // Graph handles are excluded: the adjacent 44px number fields are their WCAG 2.5.8 equivalent control.
  const { violations } = await new AxeBuilder({ page }).exclude('.workspace-graph').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  for (const violation of violations) problems.push(`${name}: ${violation.id} ${violation.nodes[0].target.join(' ')}`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  if (overflow > 1) problems.push(`${name}: page overflows by ${overflow}px`)
}

async function run(width, colorScheme) {
  const tag = `${width}-${colorScheme}`
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', error => problems.push(`${tag}: page error ${error.message}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await capture(page, `${tag}-new-camera`)
  await page.getByRole('button', { name: /Choose exposure preset/ }).click()
  await capture(page, `${tag}-new-preset`)
  await page.getByRole('button', { name: 'Skip setup' }).click()
  const open = name => page.viewportSize().width < 960
    ? page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name, exact: true }).click()
    : page.getByRole('tab', { name, exact: true }).click()
  for (const name of ['Presets', 'Edit', 'Preview', 'Settings']) {
    await open(name)
    await capture(page, `${tag}-${name.toLowerCase()}`)
    if (name === 'Edit') {
      await page.getByRole('radio', { name: /^Fill/ }).check()
      if (!await page.getByRole('radio', { name: /^Fill/ }).isChecked()) problems.push(`${tag}: Fill radio did not select`)
    }
    if (name === 'Preview') {
      const enlarge = page.getByRole('button', { name: 'Enlarge photos' })
      await enlarge.click()
      const dialog = page.getByRole('dialog', { name: 'Enlarged photo preview' })
      await dialog.waitFor()
      await capture(page, `${tag}-preview-enlarged`)
      await dialog.getByRole('button', { name: 'Close enlarged photos' }).click()
      await dialog.waitFor({ state: 'hidden' })
      if (!await enlarge.evaluate(element => element === document.activeElement)) problems.push(`${tag}: focus did not return from enlarged preview`)
    }
  }
  await page.getByRole('button', { name: 'Export LUT' }).first().click()
  await capture(page, `${tag}-export`)
  await context.close()
}

await Promise.all(widths.flatMap(width => ['light', 'dark'].map(scheme => run(width, scheme).catch(error => problems.push(`${width}-${scheme}: ${error.message.split('\n')[0]}`)))))
await browser.close()
console.log(`${problems.length ? [...new Set(problems)].join('\n') : 'No problems found.'}\nScreenshots: ${out}\nTook ${Math.round((Date.now() - started) / 1000)}s`)
process.exitCode = problems.length ? 1 : 0
