import { test, expect, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('tab', { name: 'Bands', exact: true })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
})

async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}

async function accessible(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const startingPanel = await page.getByRole('tab', { selected: true }).innerText()
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
        const boundary = label.match(/^Boundary between colors (\d+) and /)
        const fillColor = label.match(/^Edit fill color (\d+)$/)
        return edge ? `Band ${edge[1]} total width` : center ? `Band ${center[1]} stops` : boundary ? `Boundary after color ${boundary[1]}` : fillColor ? `Open Band ${fillColor[1]} color picker` : null
      })
      if (!equivalent) { unresolved.push(node); continue }
      const field = page.getByRole(equivalent === 'Add color' || equivalent.startsWith('Open Band ') ? 'button' : 'textbox', { name: equivalent, exact: true })
      // The numbered 44px selector reveals the same single set of numeric fields
      // on phones. Exercise that path for each graph operation, rather than
      // exempting inaccessible handles or duplicating mobile inputs.
      const band = equivalent.match(/(?:Band |color )(\d+)/)?.[1]
      if (band && !await field.isVisible()) {
        const selector = page.getByRole('button', { name: `Select band ${band}`, exact: true })
        const bounds = (await selector.boundingBox())!
        expect(bounds.width).toBeGreaterThanOrEqual(44)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        await selector.click()
      }
      if (equivalent === 'Add color' && !await field.isVisible()) await panel(page, 'Palette')
      await expect(field).toBeVisible()
      await expect(field).toBeEnabled()
      const bounds = (await field.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(24)
      expect(bounds.height).toBeGreaterThanOrEqual(24)
      await panel(page, startingPanel)
    }
    violation.nodes = unresolved
  }
  result.violations = result.violations.filter(item => item.nodes.length > 0)
  expect(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([])
}

test('disclosures, palette layout and keyboard controls @checks', async ({ page }) => {
  for (const title of ['Output settings', 'Save and reuse palettes']) {
    await panel(page, title === 'Output settings' ? 'Configure' : 'Palette')
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
  for (const name of ['Bands', 'Palette', 'Presets', 'Media', 'Configure', 'Setups', 'Export']) {
    await panel(page, name)
    await accessible(page)
  }
  await panel(page, 'Configure')
  await page.locator('summary').filter({ hasText: 'Output settings' }).click()
  await accessible(page)
  await panel(page, 'Palette')
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await page.locator('summary').filter({ hasText: 'Save and reuse palettes' }).click()
  await accessible(page)
  const value = page.getByLabel('Color hue value', { exact: true })
  await value.fill('400')
  await expect(value).toHaveAttribute('aria-invalid', 'true')
  await accessible(page)
})

test('band editor uses selected phone fields and a desktop table with inline removal @checks', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Band colors and positions' })
  if (page.viewportSize()!.width >= 960) await expect(table.getByRole('columnheader', { name: 'Color', exact: true })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Band', exact: true })).toHaveCount(0)
  const row = table.locator('tbody tr').first()
  const metrics = await row.evaluate(node => {
    const cells = Array.from(node.children).map(cell => cell.getBoundingClientRect())
    return { height: node.getBoundingClientRect().height, tops: cells.map(cell => cell.top) }
  })
  if (page.viewportSize()!.width >= 960) {
    expect(metrics.height).toBeLessThanOrEqual(160)
    expect(Math.max(...metrics.tops) - Math.min(...metrics.tops)).toBeLessThanOrEqual(1)
  } else {
    expect(metrics.height).toBeGreaterThan(88)
    await expect(page.getByRole('button', { name: 'Select band 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
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
  await panel(page, 'Configure')
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
  const hex = page.getByLabel('Band 1 color hex value', { exact: true })
  await hex.fill('#123456')
  await hex.press('Tab')
  await panel(page, 'Palette')
  await colors.getByRole('button', { name: /^Apply Standard false color/ }).click()
  await expect(hex).not.toHaveValue('#123456')
  await panel(page, 'Bands')
  await page.getByRole('button', { name: 'Undo last band edit', exact: true }).click()
  await panel(page, 'Palette')
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
  await panel(page, 'Export')
  const output = page.locator('#export')
  const strip = output.getByRole('img', { name: 'Exposure band coverage', exact: true })
  await expect(strip).toBeVisible()
  const colors = (selector: Locator) => selector.locator('[data-preview-band]').evaluateAll(nodes => nodes.map(node => node.getAttribute('fill')))
  expect(await colors(output)).toEqual(await colors(page.getByRole('group', { name: 'Persistent exposure preview', exact: true }).locator('button').first()))
  const ranges = output.getByRole('list', { name: 'Output band colors and boundaries', exact: true })
  await expect(ranges).toContainText('to')
  await expect(ranges).not.toContainText('#')
  await panel(page, 'Configure')
  for (const limit of ['Low', 'High']) await page.getByRole('checkbox', { name: `${limit} recorded-signal warning`, exact: true }).check()
  await panel(page, 'Export')
  await expect(output.getByText('Low recorded signal', { exact: true })).toBeVisible()
  await expect(output.getByText('High recorded signal', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `../.scratch/output-summary-${test.info().project.name}.png`, fullPage: true, clip: (await output.boundingBox())! })
})

test('complete presets lead into editable bands and undo without changing configuration @checks', async ({ page }) => {
  await panel(page, 'Configure')
  const camera = page.getByLabel('Camera recording', { exact: false })
  await camera.selectOption('Panasonic V-Log')
  const cameraBefore = await camera.inputValue()
  const initial = await page.locator('table[aria-label="Band colors and positions"] tbody tr').count()
  await panel(page, 'Palette')
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await page.getByLabel('Color hue value', { exact: true }).fill('240')
  await panel(page, 'Presets')
  const preset = page.getByLabel('Start with a preset', { exact: false })
  await preset.selectOption('contrast-checker')
  await page.getByRole('button', { name: 'Use preset', exact: true }).click()
  const details = page.getByRole('region', { name: 'Exposure presets' }).locator('details')
  await expect(details).not.toHaveAttribute('open')
  await expect(details.getByText(/Dark green → light green/)).not.toBeVisible()
  await details.locator('summary').click()
  await expect(details.getByText(/Dark green → light green/)).toBeVisible()
  await details.locator('summary').click()
  await panel(page, 'Bands')
  await expect(page.getByRole('radio', { name: 'Fill Color every zone', exact: true })).toBeChecked()
  const table = page.getByRole('table', { name: 'Band colors and positions' })
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(page.getByRole('textbox', { name: 'Boundary after color 1', exact: true })).toHaveValue('-1.5')
  await expect(page.getByRole('button', { name: 'Cancel preview', exact: true })).toHaveCount(0)
  await expect(camera).toHaveValue(cameraBefore)
  await page.evaluate(() => window.scrollTo(0, 0))
  const region = page.locator('#exposure-bands')
  await page.screenshot({ path: `../.scratch/exposure-presets-${test.info().project.name}.png`, fullPage: true, clip: (await region.boundingBox())! })
  await accessible(page)
  await page.getByRole('button', { name: 'Undo last band edit', exact: true }).click()
  await expect(table.locator('tbody tr')).toHaveCount(initial)
  await panel(page, 'Presets')
  await preset.selectOption('three-band')
  await page.getByRole('button', { name: 'Use preset', exact: true }).click()
  await panel(page, 'Bands')
  await expect(table.locator('tbody tr')).toHaveCount(3)
  await expect(page.getByRole('textbox', { name: 'Band 1 stops', exact: true })).toHaveValue('-2')
  await panel(page, 'Presets')
  await preset.selectOption('camera-ire')
  await page.getByRole('button', { name: 'Use preset', exact: true }).click()
  await panel(page, 'Bands')
  await expect(page.getByRole('radio', { name: 'IRE Camera log level', exact: true })).toBeChecked()
  await expect(table.locator('tbody tr')).toHaveCount(7)
  await expect(camera).toHaveValue(cameraBefore)
})

async function snapshot(page: Page, region: Locator, name: string) {
  // Capture offscreen regions without moving the sticky preview over their titles.
  await page.evaluate(() => window.scrollTo(0, 0))
  const clip = await region.boundingBox()
  expect(clip).not.toBeNull()
  await expect(page).toHaveScreenshot(name, { fullPage: true, clip: clip! })
}

test('selected band, panels, session restore and keyboard remain usable @checks', async ({ page }) => {
  await panel(page, 'Presets')
  await page.getByLabel('Start with a preset', { exact: false }).selectOption('three-band')
  await page.getByRole('button', { name: 'Use preset', exact: true }).click()
  await page.getByRole('button', { name: 'Select band 2', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Bands', exact: true })).toHaveAttribute('aria-selected', 'true')
  const position = page.getByRole('textbox', { name: 'Band 2 stops', exact: true })
  await position.fill('0.75')
  await position.press('Enter')
  await panel(page, 'Configure')
  const configured = page.getByRole('tab', { name: 'Configure', exact: true })
  await configured.press('Escape')
  await expect(configured).toBeFocused()
  await expect(position).toHaveValue('0.75')
  if (page.viewportSize()!.width < 960) {
    await page.getByRole('button', { name: 'Collapse', exact: true }).click()
    await expect(position).not.toBeVisible()
    await expect(page.getByRole('group', { name: 'Persistent exposure preview', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Adjust', exact: true }).click()
    await expect(position).toBeVisible()
    // Emulate the reduced layout viewport used by Android's on-screen keyboard.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 })
    await position.focus()
    await position.scrollIntoViewIfNeeded()
    const bounds = (await position.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(480)
  }
  await expect(page.getByText(/^Session saved on this device/)).toBeVisible()
  await page.reload()
  await expect(page.getByText('Last session restored on this device.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Select band 2', exact: true }).click()
  await expect(position).toHaveValue('0.75')
  await panel(page, 'Export')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Generate LUT', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.cube$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('corrupt sessions remain recoverable until explicit replacement @checks', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('lut-builder.workspace-session.v1', '{unreadable'))
  await page.reload()
  await expect(page.getByText(/Your saved session could not be recovered/)).toBeVisible()
  const field = page.getByRole('textbox', { name: 'Band 1 stops', exact: true })
  await field.fill('1')
  await field.press('Enter')
  expect(await page.evaluate(() => localStorage.getItem('lut-builder.workspace-session.v1'))).toBe('{unreadable')
  const backup = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download saved session backup', exact: true }).click()
  expect((await backup).suggestedFilename()).toBe('lut-builder-session-backup.json')
  await page.getByRole('button', { name: 'Replace saved session with current setup', exact: true }).click()
  await expect(page.getByText(/^Session saved on this device/)).toBeVisible()
  await page.reload()
  await expect(field).toHaveValue('1')
})

test('reviewed UI screenshots @visual', async ({ page }) => {
  test.skip(process.platform !== 'linux', 'Use pnpm test:ui:container for the canonical Linux screenshots; native checks still run.')
  await expect(page).toHaveScreenshot('workspace.png', { fullPage: true })
  await panel(page, 'Configure')
  await snapshot(page, page.locator('#configuration'), 'configuration.png')
  const output = page.locator('summary').filter({ hasText: 'Output settings' })
  await output.click()
  await snapshot(page, page.locator('#configuration'), 'configuration-expanded.png')
  await output.click()
  await panel(page, 'Palette')
  const palette = page.getByRole('region', { name: 'Band colors', exact: true })
  await snapshot(page, palette, 'palette.png')
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await snapshot(page, palette, 'gradient.png')
  await page.getByLabel('Color hue value', { exact: true }).fill('400')
  await snapshot(page, palette, 'gradient-invalid-focus.png')
})
