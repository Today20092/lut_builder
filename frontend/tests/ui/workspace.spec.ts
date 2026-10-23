import { test, expect, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

const constantLookCube = 'TITLE "Constant camera look"\nLUT_3D_SIZE 2\n' + Array(8).fill('0.125 0.25 0.5').join('\n') + '\n'

async function applyPreset(page: Page, preset: string) {
  const names: Record<string, string> = { 'contrast-checker': 'Contrast Checker', 'three-band': 'Three-band Exposure', 'camera-ire': 'Camera-log IRE' }
  await page.getByRole('button', { name: `Use ${names[preset]}`, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add band', exact: true })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.workspace-session-status')).toContainText('Session saved on this device.')
})

async function panel(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name: 'Export LUT', exact: true })
  if (await sheet.isVisible()) {
    if (name === 'Export') return
    await page.getByRole('button', { name: 'Close Export LUT', exact: true }).click()
    await expect(sheet).not.toBeVisible()
  }
  if (name === 'Export') { await page.getByRole('button', { name: 'Export LUT', exact: true }).click(); return }
  const destination = ['Bands', 'Palette'].includes(name) ? 'Edit' : ['Configure', 'Setups'].includes(name) ? 'Settings' : name === 'Media' ? 'Preview' : name
  if (page.viewportSize()!.width < 960) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: destination, exact: true }).click()
  } else {
    await page.getByRole('tab', { name: destination, exact: true }).click()
    await expect(page.getByRole('tab', { name: destination, exact: true })).toHaveAttribute('aria-selected', 'true')
  }
  if (['Bands', 'Palette'].includes(name)) await page.getByRole('group', { name: 'Edit tools' }).getByRole('button', { name, exact: true }).click()
  if (name === 'Setups') await expect(page.getByRole('region', { name: 'Saved setups', exact: true })).toBeVisible()
  if (name === 'Configure') await expect(page.getByLabel('Import .cube LUT', { exact: true })).toBeVisible()
}

async function disclosure(page: Page, title: string) {
  if (title === 'Output settings') { await expect(page.getByRole('group', { name: 'Cube size', exact: true })).toBeVisible(); return }
  const summary = page.locator('summary').filter({ hasText: title })
  await expect(summary).toBeVisible()
  if (await summary.locator('..').getAttribute('open') === null) await summary.click()
  await expect(summary.locator('..')).toHaveAttribute('open', '')
}

async function bandMode(page: Page, name: string, change = false) {
  const radio = page.getByRole('radio', { name, exact: true })
  if (change) await radio.check()
  else await expect(radio).toBeChecked()
}

async function accessible(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const section = await page.locator('.workspace').getAttribute('data-section')
  const startingPanel = ({ bands: 'Bands', palette: 'Palette', presets: 'Presets', media: 'Media', configuration: 'Configure', files: 'Setups', export: 'Export' } as Record<string, string>)[section!]
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

test('configuration help opens by tap and fields keep a single control surface @checks', async ({ page }) => {
  await panel(page, 'Configure')
  await disclosure(page, 'Output settings')
  const camera = page.getByLabel('Camera recording', { exact: true })
  await expect(camera).toBeVisible()
  const field = await camera.evaluate(element => {
    const control = element.getBoundingClientRect()
    const wrapper = element.parentElement!.getBoundingClientRect()
    return { height: control.height, width: control.width, wrapperWidth: wrapper.width, wrapperBorder: getComputedStyle(element.parentElement!).borderWidth }
  })
  expect(field.height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 960 ? 48 : 40)
  expect(field.width).toBeCloseTo(field.wrapperWidth, 0)
  expect(field.wrapperBorder).toBe('0px')
  const help = page.getByRole('button', { name: 'About cube size', exact: true })
  await help.click()
  await expect(page.getByText('Higher cube sizes sample the transform more precisely', { exact: false })).toBeVisible()
  const result = await new AxeBuilder({ page }).include('[data-slot="popover-content"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(help).toBeFocused()
  await expect(page.getByText('Higher cube sizes sample the transform more precisely', { exact: false })).toBeHidden()
  await expect(camera).toHaveValue('Sony S-Log3')
})

test('frequent choices stay visible and numeric graph preferences preserve valid work @checks', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'All total widths', exact: true })).toBeVisible()
  const steps = page.getByRole('group', { name: 'Movement increment', exact: true })
  await expect(steps).toBeVisible()
  await steps.getByRole('button', { name: '½ stop', exact: true }).click()
  await expect(steps.getByRole('button', { name: '½ stop', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await steps.getByRole('button', { name: '½ stop', exact: true }).click()
  await expect(steps.getByRole('button', { name: '½ stop', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await disclosure(page, 'Graph view')
  const range = page.getByRole('textbox', { name: 'Graph range in stops', exact: true })
  await range.fill('20')
  await range.press('Enter')
  await expect(page.getByRole('group', { name: 'Editable exposure graph from -20 to 20 stops', exact: true })).toBeVisible()
  await range.fill('21')
  await expect(range).toHaveAttribute('aria-invalid', 'true')
  await range.press('Escape')
  await expect(range).toHaveValue('20')
  await panel(page, 'Configure')
  const sizes = page.getByRole('group', { name: 'Cube size', exact: true })
  await sizes.getByRole('button', { name: '17³', exact: true }).click()
  await expect(sizes.getByRole('button', { name: '17³', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: /^Cube size/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Saved setups', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import setup file', exact: true })).toBeVisible()
  await panel(page, 'Export')
  await page.getByRole('radio', { name: /^External monitor/ }).check()
  await expect(page.getByRole('radio', { name: /^External monitor/ })).toBeChecked()
  await accessible(page)
})

test('enlarged phone text keeps navigation reachable without sideways scrolling @checks', async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 960, 'Phone navigation contract')
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  for (const name of ['Settings', 'Edit', 'Presets', 'Media', 'Settings']) {
    await panel(page, name)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const overflow = await page.locator('body *').evaluateAll(elements => elements.filter(element => {
      const bounds = element.getBoundingClientRect()
      return bounds.width > 0 && bounds.right > innerWidth + 1
    }).map(element => `${element.tagName}.${element.className}`).slice(-12))
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name}: ${overflow.join(', ')}`).toBeLessThanOrEqual(page.viewportSize()!.width)
    if (name === 'Edit') await page.screenshot({ path: `test-results/enlarged-edit-${test.info().project.name}.png` })
    const bounds = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
  }
})

test('disclosures, palette layout and keyboard controls @checks', async ({ page }) => {
  for (const title of ['Save and reuse palettes']) {
    await panel(page, title === 'Output settings' ? 'Configure' : 'Palette')
    if (page.viewportSize()!.width < 960) {
      await disclosure(page, title)
      await expect(page.getByRole(title === 'Output settings' ? 'combobox' : 'textbox', { name: title === 'Output settings' ? /^Cube size/ : 'Palette name' })).toBeVisible()
      continue
    }
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
  await panel(page, 'Palette')
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
  await disclosure(page, 'Output settings')
  await accessible(page)
  await panel(page, 'Palette')
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await disclosure(page, 'Save and reuse palettes')
  await accessible(page)
  const value = page.getByLabel('Color hue value', { exact: true })
  await value.fill('400')
  await expect(value).toHaveAttribute('aria-invalid', 'true')
  await accessible(page)
})

test('band editor uses selected phone fields and a desktop table with confirmed removal @checks', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Confirm remove band 1', exact: true }).focus()
  await page.getByRole('button', { name: 'Confirm remove band 1', exact: true }).click()
  await expect(table.locator('tbody tr')).toHaveCount(count - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('sticky preview reflects recorded-signal warning toggles @checks', async ({ page }) => {
  await panel(page, 'Configure')
  const preview = page.getByRole('group', { name: 'Persistent exposure preview', exact: true })
  for (const limit of ['Low', 'High']) {
    await disclosure(page, 'Recorded-signal limit warnings')
    const toggle = page.getByRole('checkbox', { name: `${limit} recorded-signal warning`, exact: true })
    const indicator = preview.getByRole('img', { name: `${limit} signal enabled`, exact: true })
    await expect(indicator).toHaveCount(0)
    await toggle.check()
    if (page.viewportSize()!.width < 960) await panel(page, 'Bands')
    await expect(indicator).toBeVisible()
    await panel(page, 'Configure')
  }
  if (page.viewportSize()!.width < 960) await panel(page, 'Bands')
  const low = await preview.getByRole('img', { name: 'Low signal enabled', exact: true }).boundingBox()
  const high = await preview.getByRole('img', { name: 'High signal enabled', exact: true }).boundingBox()
  expect(low!.y).toBe(high!.y)
  expect(low!.x).toBeLessThan(high!.x)
  await preview.screenshot({ path: `../.scratch/signal-preview-${test.info().project.name}.png` })
  await panel(page, 'Configure')
  await disclosure(page, 'Recorded-signal limit warnings')
  await page.getByRole('checkbox', { name: 'Low recorded-signal warning', exact: true }).uncheck()
  if (page.viewportSize()!.width < 960) await panel(page, 'Bands')
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
  await disclosure(page, 'Save and reuse palettes')
  await expect(colors.getByText('Stored in this browser only.', { exact: true })).toBeVisible()
  await expect(colors.getByText('Saved palettes · this browser only', { exact: true })).toHaveCount(0)
  await expect(colors.getByRole('combobox', { name: 'Reuse saved palette', exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `../.scratch/palette-simplified-${test.info().project.name}.png`, fullPage: true, clip: (await colors.boundingBox())! })
  await accessible(page)
})

test('fill gradient stays inside the graph border @checks', async ({ page }) => {
  await bandMode(page, 'Fill Color every zone', true)
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
  expect(await colors(output)).toEqual(await colors(page.locator('[aria-label="Persistent exposure preview"] > button').first()))
  const ranges = output.getByRole('list', { name: 'Output band colors and boundaries', exact: true })
  await expect(ranges).toContainText('to')
  await expect(ranges).not.toContainText('#')
  await panel(page, 'Configure')
  await disclosure(page, 'Recorded-signal limit warnings')
  for (const limit of ['Low', 'High']) await page.getByRole('checkbox', { name: `${limit} recorded-signal warning`, exact: true }).check()
  await panel(page, 'Export')
  await expect(output.getByText('Low recorded signal', { exact: true })).toBeVisible()
  await expect(output.getByText('High recorded signal', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `../.scratch/output-summary-${test.info().project.name}.png`, fullPage: true, clip: (await output.boundingBox())! })
})

test('preset sections apply existing standard and detailed arrangements @checks', async ({ page }) => {
  const cases = [
    ['Detailed IRE', 9], ['Standard Fill', 5], ['Detailed Fill', 9],
    ['Standard Stops', 7], ['Detailed Stops', 10],
  ] as const
  for (const [name, count] of cases) {
    await panel(page, 'Presets')
    const preview = page.getByRole('img', { name: `${name} preview`, exact: true })
    await expect(preview).toBeVisible()
    const colors = await preview.locator('rect').evaluateAll(rects => rects.map(rect => rect.getAttribute('fill')))
    expect(colors).toHaveLength(count)
    await page.getByRole('button', { name: `Use ${name}`, exact: true }).click()
    await panel(page, 'Bands')
    await expect(page.locator('table[aria-label="Band colors and positions"] tbody tr')).toHaveCount(count)
    const applied = await page.locator('table[aria-label="Band colors and positions"] input[aria-label$=" hex value"]').evaluateAll(fields => fields.map(field => (field as HTMLInputElement).value))
    expect(applied).toEqual(colors)
    await page.getByRole('button', { name: 'Undo last band edit', exact: true }).click()
    await expect(page.locator('table[aria-label="Band colors and positions"] tbody tr')).toHaveCount(1)
  }
})

test('mode choices have visible examples and routine recovery stays in Setups @checks', async ({ page }) => {
  await expect(page.locator('.workspace-session-status')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Restore previous setup', exact: true })).toBeHidden()

  const choices = page.getByRole('group', { name: 'Band mode', exact: true })
  await expect(choices.locator('.workspace-mode-preview svg')).toHaveCount(3)
  for (const preview of await choices.locator('.workspace-mode-preview svg').all()) {
    await expect(preview).toBeVisible()
    expect(await preview.locator('rect').count()).toBeGreaterThanOrEqual(3)
  }
  await panel(page, 'Setups')
  await expect(page.locator('.workspace-session-status')).toBeVisible()
  await accessible(page)
  await panel(page, 'Bands')
  await page.evaluate(() => {
    const save = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lut-builder.workspace-session.v1') throw new DOMException('Storage full', 'QuotaExceededError')
      save.call(this, key, value)
    }
  })
  const position = page.getByRole('textbox', { name: 'Band 1 stops', exact: true })
  await position.fill('0.5')
  await position.press('Enter')
  await expect(page.locator('.workspace-session-error')).toContainText('Could not save your session')
  await expect(page.locator('.workspace-session-error')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry session save', exact: true })).toBeVisible()
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
  await applyPreset(page, 'contrast-checker')
  await expect(page.getByRole('combobox', { name: /^Start with a preset/ })).toHaveCount(0)
  for (const mode of ['IRE', 'Fill', 'Stops']) {
    const group = page.getByRole('region', { name: `${mode} presets`, exact: true })
    await expect(group).toBeVisible()
    for (const button of await group.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 960 ? 48 : 24)
    }
  }
  await accessible(page)
  await page.screenshot({ path: test.info().outputPath('presets.png'), fullPage: true })
  await panel(page, 'Bands')
  await bandMode(page, 'Fill Color every zone')
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
  await applyPreset(page, 'three-band')
  await panel(page, 'Bands')
  await expect(table.locator('tbody tr')).toHaveCount(3)
  await expect(page.getByRole('textbox', { name: 'Band 1 stops', exact: true })).toHaveValue('-2')
  await panel(page, 'Presets')
  await applyPreset(page, 'camera-ire')
  await panel(page, 'Bands')
  await bandMode(page, 'IRE Camera log level')
  await expect(table.locator('tbody tr')).toHaveCount(7)
  await expect(camera).toHaveValue(cameraBefore)
})

async function snapshot(page: Page, region: Locator, name: string) {
  // Capture offscreen regions without moving the sticky preview over their titles.
  await page.evaluate(() => window.scrollTo(0, 0))
  const clip = await region.boundingBox()
  expect(clip).not.toBeNull()
  // Missing baselines fail before Playwright attaches an actual image.
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true, clip: clip!, animations: 'disabled' })
  await expect.soft(page).toHaveScreenshot(name, { fullPage: true, clip: clip! })
}

test('phone graph supports touch editing and page scrolling @checks', async ({ page, context }) => {
  test.skip(page.viewportSize()!.width >= 960, 'Synthesized phone touch only')
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 740 })
  const session = await context.newCDPSession(page)
  async function swipe(x: number, y: number, dx: number, dy: number) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 12; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const center = (await page.getByRole('button', { name: 'Band 1, 0 stops', exact: true }).boundingBox())!
  await swipe(center.x + center.width / 2, center.y + center.height / 2, 50, 0)
  const field = page.getByRole('textbox', { name: 'Band 1 stops', exact: true })
  await expect(field).not.toHaveValue('0')
  const position = await field.inputValue()
  await page.evaluate(() => window.scrollTo(0, 0))
  const graph = (await page.locator('[aria-label^="Editable exposure graph"]').boundingBox())!
  await swipe(graph.x + 12, graph.y + graph.height - 10, 0, -100)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(field).toHaveValue(position)
  await session.detach()
})

test('settings actions are reachable and preset feedback floats above navigation @checks', async ({ page }) => {
  if (page.viewportSize()!.width >= 960) await page.setViewportSize({ width: 390, height: 900 })
  await panel(page, 'Configure')
  const menu = page.getByRole('region', { name: 'Workspace actions' })
  const rows = menu.locator(':scope > button, :scope > a')
  await expect(rows).toHaveCount(3)
  const styles = await rows.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node)
    return { height: node.getBoundingClientRect().height, padding: style.padding, radius: style.borderRadius, font: style.font, decoration: style.textDecorationLine }
  }))
  for (const style of styles) expect(style.height).toBeGreaterThanOrEqual(48)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const help = menu.getByRole('link', { name: /Help \/ Manual/ })
  await expect(help).toHaveAttribute('target', '_blank')
  await accessible(page)
  await page.screenshot({ path: test.info().outputPath('settings-actions.png'), fullPage: true })
  await panel(page, 'Presets')
  const content = page.locator('.workspace-preset-panel')
  const height = await content.evaluate(node => node.scrollHeight)
  await applyPreset(page, 'contrast-checker')
  const notification = page.locator('[data-slot="toast"]')
  await expect(notification).toContainText('Preset applied')
  expect(await content.evaluate(node => node.scrollHeight)).toBe(height)
  await expect(content.getByText('Applied. Open Bands to adjust or undo.', { exact: true })).toHaveCount(0)
  await expect(notification).not.toHaveAttribute('data-starting-style')
  const nav = (await page.locator('.workspace-mobile-navigation').boundingBox())!
  await expect.poll(async () => {
    const bounds = (await notification.boundingBox())!
    return bounds.y + bounds.height
  }).toBeLessThanOrEqual(nav.y)
  const close = notification.locator('[data-slot="toast-close"]')
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await close.focus()
  await expect(close).toHaveAccessibleName('Close toast')
  await accessible(page)
  await page.screenshot({ path: test.info().outputPath('preset-toast.png') })
  await close.click()
  await expect(notification).toHaveCount(0)
  await applyPreset(page, 'three-band')
  await page.mouse.move(0, 0)
  await expect(page.locator('[data-slot="toast"]')).toHaveCount(0, { timeout: 7000 })
})

test('phone destinations keep inline controls and direct access @checks', async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 960, 'Phone navigation only')
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(navigation.getByRole('button')).toHaveCount(4)
  await expect(page.locator('.workspace-stage')).toHaveCSS('position', 'relative')
  for (const name of ['Presets', 'Media', 'Configure', 'Setups', 'Export']) {
    await panel(page, name)
    await expect(page.getByRole('region', { name: 'Exposure workspace', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Collapse', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await panel(page, 'Configure')
  await disclosure(page, 'Output settings')
  await expect(page.getByRole('group', { name: 'Cube size', exact: true })).toBeVisible()
  await disclosure(page, 'Recorded-signal limit warnings')
  await expect(page.getByRole('combobox', { name: /^Camera recording/ })).toBeVisible()

  await expect(page.locator('details[data-task-id="signal-warnings"] > summary')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
  await panel(page, 'Media')
  await expect(page.getByRole('button', { name: /Choose camera still/ })).toBeVisible()
  const file = page.getByLabel('Choose camera still', { exact: true })
  const inputBounds = (await file.boundingBox())!
  const cardBounds = (await file.locator('xpath=ancestor::*[@data-slot="card-content"]').boundingBox())!
  expect(inputBounds.x + inputBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width)
  await panel(page, 'Palette')
  await panel(page, 'Media')
  await panel(page, 'Bands')
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'bands')
  await panel(page, 'Bands')

  await expect(page.getByRole('textbox', { name: 'Band 1 stops', exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Stops Mark exposure', exact: true })).toBeVisible()
  const advanced = page.locator('summary').filter({ hasText: 'Graph view' })
  await advanced.focus()
  await advanced.press('Enter')
  await expect(advanced).toBeFocused()
  const field = page.getByRole('textbox', { name: 'Band 1 stops', exact: true })
  await field.scrollIntoViewIfNeeded()
  await expect(field).toBeVisible()
  const graph = page.locator('.workspace-stage')
  await page.evaluate(() => window.scrollTo(0, 0))
  const initialY = (await graph.boundingBox())!.y
  await page.evaluate(() => window.scrollTo(0, 400))
  const scrolled = await page.evaluate(() => window.scrollY)
  expect((await graph.boundingBox())!.y).toBeCloseTo(initialY - scrolled, 0)
})

test('selected band, panels, session restore and keyboard remain usable @checks', async ({ page }) => {
  await panel(page, 'Presets')
  await applyPreset(page, 'three-band')
  await panel(page, 'Bands')
  await page.getByRole('button', { name: 'Select band 2', exact: true }).click()
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'bands')
  const position = page.getByRole('textbox', { name: 'Band 2 stops', exact: true })
  await position.fill('0.75')
  await position.press('Enter')
  await panel(page, 'Configure')
  const configured = page.viewportSize()!.width < 960 ? page.locator('#workspace-screen-title') : page.getByRole('tab', { name: 'Settings', exact: true })
  await configured.press('Escape')
  if (page.viewportSize()!.width >= 960) await expect(configured).toBeFocused()
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'configuration')
  await panel(page, 'Bands')
  await expect(position).toHaveValue('0.75')
  if (page.viewportSize()!.width < 960) {
    await expect(page.getByRole('button', { name: 'Collapse', exact: true })).toHaveCount(0)
    await expect(position).toBeVisible()
    // Emulate the reduced layout viewport used by Android's on-screen keyboard.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 })
    await position.focus()
    await position.scrollIntoViewIfNeeded()
    const bounds = (await position.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    const navigation = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(navigation.y)
  }
  await expect(page.locator('.workspace-session-status')).toContainText('Session saved on this device.')
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('lut-builder.workspace-session.v1')
    return raw ? JSON.parse(raw).bands?.[1]?.stop : null
  })).toBe(0.75)
  await page.reload()
  await expect(page.getByText('Last session restored. Reselect any camera media to verify; media files are not stored.', { exact: true })).toBeHidden()
  await panel(page, 'Setups')
  await expect(page.getByText('Last session restored. Reselect any camera media to verify; media files are not stored.', { exact: true })).toBeVisible()
  await panel(page, 'Bands')
  await page.getByRole('button', { name: 'Select band 2', exact: true }).click()
  await expect(position).toHaveValue('0.75')
  await panel(page, 'Export')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download LUT', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.cube$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('damaged named library offers accessible backup and deliberate recovery @checks', async ({ page }) => {
  const raw = JSON.stringify({ version: 2, presets: [{ name: 'Missing imported look', setup: { version: 3 } }] })
  await page.evaluate(value => localStorage.setItem('lut-builder.named-setups.v1', value), raw)
  await page.reload()
  await panel(page, 'Setups')
  await expect(page.getByRole('button', { name: 'Save current setup', exact: true })).toBeDisabled()
  const backup = page.getByRole('button', { name: 'Download saved library backup', exact: true })
  await expect(backup).toBeVisible()
  await expect(backup).toBeEnabled()
  await accessible(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const downloading = page.waitForEvent('download')
  await backup.click()
  expect((await downloading).suggestedFilename()).toBe('lut-builder-saved-library-backup.json')
  expect(await page.evaluate(() => localStorage.getItem('lut-builder.named-setups.v1'))).toBe(raw)
  await page.getByRole('button', { name: 'Replace saved library with an empty library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save current setup', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lut-builder.named-setups.v1')!).presets)).toEqual([])
})

test('corrupt sessions remain recoverable until explicit replacement @checks @behavior', async ({ page }) => {
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
  await expect(page.locator('.workspace-session-status')).toContainText('Session saved on this device.')
  await page.reload()
  await expect(field).toHaveValue('1')
})

test('confirmed imported look edits, compares and exports portably without changing comparison bytes @checks', async ({ page }) => {
  // A constant, deliberately non-gray creative transform is independent of the
  // implementation's parser/math. Browser integration proves the actual download.
  const cube = constantLookCube
  await panel(page, 'Configure')
  await disclosure(page, 'Output settings')
  await page.getByRole('group', { name: 'Cube size', exact: true }).getByRole('button', { name: '17³', exact: true }).click()

  await page.getByLabel('Import .cube LUT', { exact: true }).setInputFiles({ name: 'constant-look.cube', mimeType: 'text/plain', buffer: Buffer.from(cube) })
  await expect(page.getByRole('button', { name: 'Confirm and apply look', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: /^LUT camera input/ }).selectOption('Panasonic V-Log')
  await accessible(page)
  await page.getByRole('button', { name: 'Confirm and apply look', exact: true }).click()
  await expect(page.getByRole('combobox', { name: /^Camera recording/ })).toBeDisabled()
  for (const choice of await page.getByRole('group', { name: 'Target display', exact: true }).getByRole('button').all()) await expect(choice).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Full / Data', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Monochrome base', exact: true })).toBeDisabled()
  const comparison = page.getByRole('region', { name: 'Imported look comparison', exact: true })
  if (page.viewportSize()!.width < 960) await panel(page, 'Bands')
  await expect(comparison.locator('[aria-label="Neutral camera patches at labeled stops"] > div')).toHaveCount(9)
  await accessible(page)
  await page.screenshot({ path: test.info().outputPath('imported-workspace.png'), fullPage: true })
  await panel(page, 'Presets')
  for (const preset of ['contrast-checker', 'camera-ire', 'three-band']) {
    await applyPreset(page, preset)
  }
  await panel(page, 'Bands')
  await page.getByRole('button', { name: 'Select band 1', exact: true }).click()
  await page.getByRole('textbox', { name: 'Band 1 total width', exact: true }).fill('4')
  await page.getByRole('textbox', { name: 'Band 1 total width', exact: true }).press('Enter')
  await expect(comparison.locator('[aria-label="Neutral camera patches at labeled stops"] > div')).toHaveCount(9)
  const save = async (label: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: label, exact: true }).click()
    const download = await pending
    expect(await download.failure()).toBeNull()
    return readFile((await download.path())!, 'utf8')
  }
  const rows = (text: string) => text.split('\n').filter(line => /^[-+\d.]/.test(line)).map(line => line.trim().split(/\s+/).map(Number))
  await panel(page, 'Export')
  const diagnostic = rows(await save('Download LUT'))
  expect(diagnostic).toHaveLength(17 ** 3)
  expect(diagnostic.some(row => row.join(',') === '0.125,0.25,0.5')).toBe(true)
  expect(diagnostic.some(row => row.join(',') !== '0.125,0.25,0.5')).toBe(true)
  await panel(page, 'Bands')
  await comparison.getByRole('button', { name: 'Look', exact: true }).click()
  await panel(page, 'Export')
  expect(rows(await save('Download LUT'))).toEqual(diagnostic)
  await panel(page, 'Bands')
  await comparison.getByRole('button', { name: 'Look + diagnostics', exact: true }).click()
  await panel(page, 'Setups')
  const portable = await save('Export setup file')
  const setup = JSON.parse(portable)
  expect(setup.version).toBe(3)
  expect(setup.imported_lut.cube).toBe(cube)
  expect(setup.imported_lut.source_profile).toBe('Panasonic V-Log')
  await expect(page.locator('.workspace-session-status')).toContainText('Session saved on this device.')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Imported look comparison', exact: true })).toBeVisible()
  await panel(page, 'Setups')
  await page.getByLabel('Import setup JSON file').setInputFiles({ name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(portable) })
  await expect(page.getByLabel('Setup loading feedback').getByRole('status')).toContainText('Imported portable.json')
  await panel(page, 'Export')
  expect(rows(await save('Download LUT'))).toEqual(diagnostic)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('reviewed UI screenshots @visual', async ({ page }) => {
  test.setTimeout(120_000)
  test.skip(process.platform !== 'linux', 'Use pnpm test:ui:container for the canonical Linux screenshots; native checks still run.')
  await page.screenshot({ path: test.info().outputPath('workspace.png'), fullPage: true, animations: 'disabled' })
  await expect.soft(page).toHaveScreenshot('workspace.png', { fullPage: true })
  await panel(page, 'Presets')
  await page.screenshot({ path: test.info().outputPath('presets.png'), fullPage: true, animations: 'disabled' })
  await expect.soft(page).toHaveScreenshot('presets.png', { fullPage: true })
  await panel(page, 'Bands')

  await snapshot(page, page.getByRole('group', { name: 'Band mode', exact: true }), 'band-modes.png')
  await panel(page, 'Setups')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({ path: test.info().outputPath('setups.png'), fullPage: true, animations: 'disabled' })
  await expect.soft(page).toHaveScreenshot('setups.png', { fullPage: true })
  await panel(page, 'Configure')
  await snapshot(page, page.locator('#configuration'), 'configuration.png')
  const output = page.getByRole('region', { name: 'Output settings', exact: true })
  await disclosure(page, 'Output settings')
  await snapshot(page, page.locator('#configuration'), 'configuration-expanded.png')
  await expect(output).toBeVisible()
  await panel(page, 'Palette')
  const palette = page.getByRole('region', { name: 'Band colors', exact: true })
  await snapshot(page, palette, 'palette.png')
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await snapshot(page, palette, 'gradient.png')
  await page.getByLabel('Color hue value', { exact: true }).fill('400')
  await snapshot(page, palette, 'gradient-invalid-focus.png')
  await panel(page, 'Configure')
  await disclosure(page, 'Output settings')
  await page.getByRole('group', { name: 'Cube size', exact: true }).getByRole('button', { name: '17³', exact: true }).click()

  await page.getByLabel('Import .cube LUT', { exact: true }).setInputFiles({ name: 'constant-look.cube', mimeType: 'text/plain', buffer: Buffer.from(constantLookCube) })
  await page.getByRole('combobox', { name: /^LUT camera input/ }).selectOption('Panasonic V-Log')
  await snapshot(page, page.getByRole('dialog', { name: 'Confirm imported LUT', exact: true }), 'imported-interpretation.png')
  await page.getByRole('button', { name: 'Confirm and apply look', exact: true }).click()
  if (page.viewportSize()!.width < 960) await panel(page, 'Bands')
  await expect(page.locator('[aria-label="Neutral camera patches at labeled stops"] > div')).toHaveCount(9)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: test.info().outputPath('imported-workspace.png'), fullPage: true, animations: 'disabled' })
  await expect.soft(page).toHaveScreenshot('imported-workspace.png', { fullPage: true })
})

test('open configuration and imported draft survive responsive resizing @checks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await panel(page, 'Configure')
  await disclosure(page, 'Output settings')
  const output = page.getByRole('region', { name: 'Output settings', exact: true })
  await page.getByLabel('Import .cube LUT', { exact: true }).setInputFiles({ name: 'draft.cube', mimeType: 'text/plain', buffer: Buffer.from(constantLookCube) })
  await page.getByRole('combobox', { name: /^LUT camera input/ }).selectOption('Panasonic V-Log')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('combobox', { name: /^LUT camera input/ })).toHaveValue('Panasonic V-Log')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(output).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^LUT camera input/ })).toHaveValue('Panasonic V-Log')
  await expect(page.getByRole('button', { name: 'Confirm and apply look', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close Confirm imported LUT', exact: true }).click()
  await panel(page, 'Media')
  await panel(page, 'Bands')
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'bands')
})
