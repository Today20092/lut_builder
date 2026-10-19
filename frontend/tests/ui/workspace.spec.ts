import { test, expect, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByAltText('Illustrative LUT result')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
})

async function accessible(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  // WCAG 2.5.8 Equivalent: spatial controls have full-size fields or Add color.
  for (const violation of result.violations.filter(item => item.id === 'target-size')) {
    const unresolved = []
    for (const node of violation.nodes) {
      const selector = node.target.length === 1 && typeof node.target[0] === 'string' ? node.target[0] : null
      const equivalent = selector && await page.locator(selector).evaluate(element => {
        if (element.matches('button.gradient-bar[aria-label="Add color on gradient"]')) return 'Add color'
        if (!element.closest('[aria-label^="Editable exposure graph"]')) return null
        const label = element.getAttribute('aria-label') ?? ''
        const edge = label.match(/^Resize (?:left|right) edge of band (\d+)$/)
        const center = label.match(/^Band (\d+), .* stops$/)
        return edge ? `Band ${edge[1]} total width` : center ? `Band ${center[1]} stops` : null
      })
      if (!equivalent) { unresolved.push(node); continue }
      const field = page.getByRole(equivalent === 'Add color' ? 'button' : 'textbox', { name: equivalent, exact: true })
      await expect(field).toBeVisible()
      await expect(field).toBeEnabled()
      const bounds = (await field.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(24)
      expect(bounds.height).toBeGreaterThanOrEqual(24)
    }
    violation.nodes = unresolved
  }
  result.violations = result.violations.filter(item => item.nodes.length > 0)
  expect(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([])
}

test('disclosures, palette layout and keyboard controls @checks', async ({ page }) => {
  for (const title of ['Output settings', 'Save and reuse palettes']) {
    const summary = page.locator('summary').filter({ hasText: title })
    const metrics = await summary.evaluate(node => {
      const box = node.parentElement!
      const bounds = box.getBoundingClientRect()
      const heading = node.getBoundingClientRect()
      const css = getComputedStyle(box)
      const headingCss = getComputedStyle(node)
      return { extra: bounds.height - heading.height - parseFloat(css.borderTopWidth) - parseFloat(css.borderBottomWidth), height: heading.height, top: headingCss.paddingTop, bottom: headingCss.paddingBottom }
    })
    expect(Math.abs(metrics.extra), title).toBeLessThanOrEqual(1)
    expect(metrics.height, title).toBeGreaterThanOrEqual(44)
    expect(metrics.top, title).toBe(metrics.bottom)
    await summary.focus()
    await summary.press('Enter')
    await expect(summary.locator('..')).toHaveAttribute('open', '')
    await summary.press('Enter')
    await expect(summary.locator('..')).not.toHaveAttribute('open')
  }
  const items = await page.getByRole('list', { name: 'Exposure palette legend' }).locator('li').evaluateAll(nodes => nodes.map(node => {
    const { x, y } = node.getBoundingClientRect()
    return { x, y }
  }))
  expect(items).toHaveLength(7)
  const axis = page.viewportSize()!.width < 640 ? 'x' : 'y'
  expect(new Set(items.map(item => Math.round(item[axis]))).size).toBe(1)
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  const blend = await page.getByLabel('Gradient blend', { exact: true }).boundingBox()
  const hue = await page.getByLabel('Hue path', { exact: true }).boundingBox()
  expect(Math.abs(blend!.y - hue!.y)).toBeLessThanOrEqual(1)
  for (const channel of ['lightness', 'chroma', 'hue']) {
    const slider = page.getByRole('slider', { name: `Color ${channel}`, exact: true })
    await expect(slider).toBeVisible()
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  const value = page.getByLabel('Color hue value', { exact: true })
  await value.fill('240')
  await value.press('Enter')
  await expect(page.getByRole('slider', { name: 'Color hue', exact: true })).toHaveValue('240')
  await expect(value).toBeFocused()
  expect(await value.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('accessibility in default, expanded and invalid states @checks', async ({ page }) => {
  await accessible(page)
  await page.locator('summary').filter({ hasText: 'Output settings' }).click()
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await page.locator('summary').filter({ hasText: 'Save and reuse palettes' }).click()
  await accessible(page)
  const value = page.getByLabel('Color hue value', { exact: true })
  await value.fill('400')
  await expect(value).toHaveAttribute('aria-invalid', 'true')
  await accessible(page)
})

test('band editor stays a compact table with inline removal @checks', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Band colors and positions' })
  await expect(table.getByRole('columnheader', { name: 'Color', exact: true })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Band', exact: true })).toHaveCount(0)
  const row = table.locator('tbody tr').first()
  const metrics = await row.evaluate(node => {
    const cells = Array.from(node.children).map(cell => cell.getBoundingClientRect())
    return { height: node.getBoundingClientRect().height, tops: cells.map(cell => cell.top) }
  })
  expect(metrics.height).toBeLessThanOrEqual(88)
  expect(Math.max(...metrics.tops) - Math.min(...metrics.tops)).toBeLessThanOrEqual(1)
  await table.locator('..').screenshot({ path: `../.scratch/band-table-${test.info().project.name}.png` })
  const position = page.getByRole('textbox', { name: 'Band 1 stops', exact: true })
  await position.fill('-3.5')
  await position.press('Enter')
  await expect(position).toHaveValue('-3.5')
  const count = await table.locator('tbody tr').count()
  await page.getByRole('button', { name: 'Remove band 1', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm remove band 1', exact: true }).click()
  await expect(table.locator('tbody tr')).toHaveCount(count - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('sticky preview reflects recorded-signal warning toggles @checks', async ({ page }) => {
  const preview = page.getByRole('group', { name: 'Persistent exposure preview', exact: true })
  for (const limit of ['Low', 'High']) {
    const toggle = page.getByRole('checkbox', { name: `${limit} recorded-signal warning`, exact: true })
    const indicator = preview.getByRole('img', { name: `${limit} signal enabled`, exact: true })
    await expect(indicator).toHaveCount(0)
    await toggle.check()
    await expect(indicator).toBeVisible()
  }
  const low = await preview.getByRole('img', { name: 'Low signal enabled', exact: true }).boundingBox()
  const high = await preview.getByRole('img', { name: 'High signal enabled', exact: true }).boundingBox()
  expect(low!.y).toBe(high!.y)
  expect(low!.x).toBeLessThan(high!.x)
  await preview.screenshot({ path: `../.scratch/signal-preview-${test.info().project.name}.png` })
  await page.getByRole('checkbox', { name: 'Low recorded-signal warning', exact: true }).uncheck()
  await expect(preview.getByRole('img', { name: 'Low signal enabled', exact: true })).toHaveCount(0)
  await expect(preview.getByRole('img', { name: 'High signal enabled', exact: true })).toBeVisible()
  await accessible(page)
})

test('standard false color is a starting palette and saved library stays concise @checks', async ({ page }) => {
  const colors = page.getByRole('region', { name: 'Band colors', exact: true })
  await expect(page.getByText('Use standard exposure colors instead', { exact: true })).toHaveCount(0)
  const hex = page.getByRole('textbox', { name: 'Band 1 color hex value', exact: true })
  await hex.fill('#123456')
  await hex.press('Tab')
  await colors.getByRole('button', { name: /^Apply Standard false color/ }).click()
  await expect(hex).not.toHaveValue('#123456')
  await page.getByRole('button', { name: 'Undo last band edit', exact: true }).click()
  await expect(hex).toHaveValue('#123456')
  await colors.locator('summary').filter({ hasText: 'Save and reuse palettes' }).click()
  await expect(colors.getByText('Stored in this browser only.', { exact: true })).toBeVisible()
  await expect(colors.getByText('Saved palettes · this browser only', { exact: true })).toHaveCount(0)
  await expect(colors.getByRole('combobox', { name: 'Reuse saved palette', exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `../.scratch/palette-simplified-${test.info().project.name}.png`, fullPage: true, clip: (await colors.boundingBox())! })
  await accessible(page)
})

test('fill gradient stays inside the graph border @checks', async ({ page }) => {
  await page.getByRole('radio', { name: 'Fill Color every zone', exact: true }).check()
  const graph = page.getByRole('group', { name: /^Editable exposure graph/ })
  const paint = await graph.evaluate(node => {
    const css = getComputedStyle(node)
    return { repeat: css.backgroundRepeat, clip: css.backgroundClip }
  })
  expect(paint).toEqual({ repeat: 'no-repeat', clip: 'padding-box' })
  await graph.screenshot({ path: `../.scratch/graph-edge-${test.info().project.name}.png` })
})

test('output summary shares the committed preview and shows ranges without hex codes @checks', async ({ page }) => {
  const output = page.locator('#export')
  const strip = output.getByRole('img', { name: 'Exposure band coverage', exact: true })
  await expect(strip).toBeVisible()
  const colors = (selector: Locator) => selector.locator('[data-preview-band]').evaluateAll(nodes => nodes.map(node => node.getAttribute('fill')))
  expect(await colors(output)).toEqual(await colors(page.getByRole('group', { name: 'Persistent exposure preview', exact: true }).locator('button').first()))
  const ranges = output.getByRole('list', { name: 'Output band colors and boundaries', exact: true })
  await expect(ranges).toContainText('to')
  await expect(ranges).not.toContainText('#')
  for (const limit of ['Low', 'High']) await page.getByRole('checkbox', { name: `${limit} recorded-signal warning`, exact: true }).check()
  await expect(output.getByText('Low recorded signal', { exact: true })).toBeVisible()
  await expect(output.getByText('High recorded signal', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `../.scratch/output-summary-${test.info().project.name}.png`, fullPage: true, clip: (await output.boundingBox())! })
})

async function snapshot(page: Page, region: Locator, name: string) {
  // Capture offscreen regions without moving the sticky preview over their titles.
  await page.evaluate(() => window.scrollTo(0, 0))
  const clip = await region.boundingBox()
  expect(clip).not.toBeNull()
  await expect(page).toHaveScreenshot(name, { fullPage: true, clip: clip! })
}

test('reviewed UI screenshots @visual', async ({ page }) => {
  test.skip(process.platform !== 'linux', 'Use pnpm test:ui:container for the canonical Linux screenshots; native checks still run.')
  await expect(page).toHaveScreenshot('workspace.png', { fullPage: true })
  await snapshot(page, page.locator('#configuration'), 'configuration.png')
  const output = page.locator('summary').filter({ hasText: 'Output settings' })
  await output.click()
  await snapshot(page, page.locator('#configuration'), 'configuration-expanded.png')
  await output.click()
  const palette = page.getByRole('region', { name: 'Band colors', exact: true })
  await snapshot(page, palette, 'palette.png')
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await snapshot(page, palette, 'gradient.png')
  await page.getByLabel('Color hue value', { exact: true }).fill('400')
  await snapshot(page, palette, 'gradient-invalid-focus.png')
})
