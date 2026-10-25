import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const cube = 'TITLE "Navigation test"\nLUT_3D_SIZE 2\n' + Array(8).fill('0.125 0.25 0.5').join('\n') + '\n'

async function navigate(page: Page, name: string) {
  if (name === 'Media') name = 'Preview'
  if (page.viewportSize()!.width < 960) await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name, exact: true }).click()
  else await page.getByRole('tab', { name, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add band', exact: true })).toBeEnabled()
})

test('desktop navigation stays visible while scrolling @checks', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 960, 'Desktop rail')
  const tabs = page.getByRole('tablist', { name: 'Editing sections' })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  for (const name of ['Presets', 'Edit', 'Preview', 'Settings']) {
    await expect(tabs.getByRole('tab', { name, exact: true })).toBeInViewport({ ratio: 1 })
  }
  expect((await tabs.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('.workspace-header').boundingBox())!.height)
  await page.screenshot({ path: `test-results/navigation-scrolled-${test.info().project.name}.png` })
})

test('settings choices retain their dimensions and text weight when selected @checks', async ({ page }) => {
  await navigate(page, 'Settings')
  for (const name of ['Target display', 'Cube size']) {
    const buttons = page.getByRole('group', { name, exact: true }).getByRole('button')
    await expect(buttons.first()).toBeVisible()
    const measure = () => buttons.evaluateAll(elements => elements.map(element => {
      const { width, height } = element.getBoundingClientRect()
      return { width, height, weight: getComputedStyle(element).fontWeight }
    }))
    const initial = await measure()
    for (const button of await buttons.all()) {
      await button.click()
      expect(await measure()).toEqual(initial)
    }
  }
})

test('settings sections expose controls without nested disclosures @checks', async ({ page }) => {
  await navigate(page, 'Settings')
  const settings = page.getByRole('tabpanel', { name: 'Settings', exact: true })
  await expect(settings.locator('details')).toHaveCount(0)
  for (const name of ['Camera and display', 'LUT output', 'Imported creative LUT', 'Recorded-signal limit warnings', 'Saved setups']) {
    await expect(settings.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(settings.getByRole('textbox', { name: 'Output filename template', exact: true })).toBeVisible()
  const importing = settings.getByRole('button', { name: 'Import .cube LUT', exact: true })
  expect((await importing.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(settings.getByLabel('Import .cube LUT', { exact: true })).toHaveAttribute('tabindex', '-1')
  expect((await new AxeBuilder({ page }).include('[role="tabpanel"]:not([hidden])').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  await settings.getByRole('heading', { name: 'Camera and display', exact: true }).scrollIntoViewIfNeeded()
  await settings.screenshot({ path: test.info().outputPath('settings-sections.png') })
  await settings.getByRole('region', { name: 'Imported creative LUT settings', exact: true }).screenshot({ path: test.info().outputPath('creative-lut-import.png') })
  await page.addStyleTag({ content: 'html { font-size: 125% !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(settings.getByRole('textbox', { name: 'Output filename template', exact: true })).toBeVisible()
})

test('export choices keep the sheet geometry stable @checks', async ({ page }) => {
  await navigate(page, 'Presets')
  await page.getByRole('button', { name: 'Use Three-band Exposure', exact: true }).click()
  await page.getByRole('button', { name: 'Export LUT', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Export LUT', exact: true })
  const initial = (await sheet.boundingBox())!
  const choices = sheet.locator('.workspace-radio-choice')
  const measureChoices = () => choices.evaluateAll(elements => elements.map(element => {
    const { width, height } = element.getBoundingClientRect()
    return { width, height }
  }))
  const initialChoices = await measureChoices()
  for (const name of [/Lumix S5IIX/, /General .cube/]) {
    await sheet.getByRole('radio', { name }).check()
    const current = (await sheet.boundingBox())!
    expect(await measureChoices()).toEqual(initialChoices)
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(current[dimension], dimension).toBeCloseTo(initial[dimension], 0)
    }
  }
  await page.screenshot({ path: `test-results/export-stable-${test.info().project.name}.png` })
})

test('four destinations and inline settings preserve context @checks', async ({ page }) => {
  const mobile = page.viewportSize()!.width < 960
  const navigation = mobile ? page.getByRole('navigation', { name: 'Mobile navigation' }) : page.getByRole('tablist', { name: 'Editing sections' })
  expect(await navigation.getByRole(mobile ? 'button' : 'tab').allTextContents()).toEqual(['Presets', 'Edit', 'Preview', 'Settings'])
  await navigate(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Back/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Import .cube LUT', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Imported creative LUT', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Low recorded-signal warning', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import .cube LUT', exact: true })).toBeVisible()
  await expect(page.getByLabel('Camera recording', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `test-results/settings-${test.info().project.name}.png`, fullPage: true })
  // The graph's spatial handles have equivalent numeric controls, exercised by workspace.spec.ts.
  expect((await new AxeBuilder({ page }).exclude('.workspace-graph').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([])
  await navigate(page, 'Edit')
  const tools = page.getByRole('group', { name: 'Edit tools' })
  await page.evaluate(() => window.scrollTo(0, 0))
  const toolsTop = (await tools.boundingBox())!.y
  await page.getByRole('group', { name: 'Edit tools' }).getByRole('button', { name: 'Palette', exact: true }).click()
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'palette')
  expect((await tools.boundingBox())!.y).toBeCloseTo(toolsTop, 0)
  await navigate(page, 'Settings')
  await expect(page.getByRole('button', { name: 'Import .cube LUT', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'palette')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await navigate(page, 'Media')
  await expect(page.getByRole('heading', { name: 'Preview', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Back to band editing|View photo result/ })).toHaveCount(0)
  await expect(page.locator('a[href="#photo-result"]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Quick illustration', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Choose camera still/ })).toBeVisible()
})

test('fill coverage aligns with its boundary field on phones @checks', async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 960, 'Phone field layout')
  await page.getByRole('radio', { name: 'Fill Color every zone', exact: true }).check()
  const boundary = page.getByRole('textbox', { name: 'Boundary after color 1', exact: true })
  await boundary.scrollIntoViewIfNeeded()
  const coverage = page.locator('.band-table tbody tr[data-selected="true"] td').nth(2).locator('span').last()
  const field = (await boundary.boundingBox())!
  const value = (await coverage.boundingBox())!
  expect(value.y + value.height / 2).toBeGreaterThanOrEqual(field.y)
  expect(value.y + value.height / 2).toBeLessThanOrEqual(field.y + field.height)
  await expect(coverage).toHaveText('Until next boundary')
  await expect(coverage.locator('input, select, button')).toHaveCount(0)
  await page.screenshot({ path: `test-results/fill-fields-${test.info().project.name}.png` })
})

test('OKLCH picker size and slider positions stay stable across gamut changes @checks', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Band 1 color picker', exact: true }).click()
  const picker = page.locator('[data-color-picker]')
  await picker.getByRole('group', { name: 'Color model', exact: true }).getByRole('button', { name: 'OKLCH · perceptual', exact: true }).click()
  const channels = ['lightness', 'chroma', 'hue'] as const
  const slider = (name: typeof channels[number]) => picker.getByRole('slider', { name: `Color ${name}`, exact: true })
  await slider('chroma').press('Home')
  const measure = async () => {
    const box = (await picker.boundingBox())!
    const tracks = await Promise.all(channels.map(async name => (await slider(name).boundingBox())!))
    const scrollTop = await picker.evaluate(element => element.scrollTop)
    // Keyboard focus can scroll a short phone sheet; its content geometry must stay stable.
    return [box.x, box.y, box.width, box.height, ...tracks.flatMap(track => [track.x - box.x, track.y - box.y + scrollTop, track.width, track.height])]
  }
  const initial = await measure()
  await expect(picker.getByText(/^Within sRGB\./)).toBeVisible()
  for (const [name, key] of [['chroma', 'End'], ['lightness', 'Home'], ['lightness', 'End'], ['hue', 'End'], ['hue', 'Home'], ['lightness', 'Home'], ['chroma', 'Home']] as const) {
    await slider(name).press(key)
    const current = await measure()
    current.forEach((value, index) => expect(Math.abs(value - initial[index]), `${name} ${key}, dimension ${index}`).toBeLessThanOrEqual(1))
  }
  await slider('lightness').press('End')
  await slider('chroma').press('End')
  await expect(picker.getByText(/^Outside sRGB:/)).toBeVisible()
  await page.screenshot({ path: `test-results/picker-outside-gamut-${test.info().project.name}.png` })
  await slider('chroma').press('Home')
  await expect(picker.getByText(/^Within sRGB\./)).toBeVisible()
  await page.screenshot({ path: `test-results/picker-inside-gamut-${test.info().project.name}.png` })
})

test('OKLCH color controls fit and remain operable @checks', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Band 1 color picker', exact: true }).click()
  const picker = page.locator('[data-color-picker]')
  await picker.getByRole('group', { name: 'Color model', exact: true }).getByRole('button', { name: 'OKLCH · perceptual', exact: true }).click()
  const lightness = picker.getByRole('textbox', { name: 'Color lightness value', exact: true })
  await lightness.fill('60')
  await lightness.press('Enter')
  await expect(lightness).toHaveValue('60')
  await expect(picker).toContainText('sRGB')
  const savedHex = await page.locator('input[aria-label="Band 1 color hex value"]').inputValue()
  await expect(picker.getByLabel('Saved color hex', { exact: true })).toHaveText(savedHex.toUpperCase())
  await expect(picker.getByRole('img', { name: `Saved sRGB color ${savedHex}`, exact: true })).toHaveCSS('background-color', await page.locator('input[aria-label="Band 1 color hex value"]').evaluate(input => {
    const probe = document.createElement('span')
    probe.style.color = (input as HTMLInputElement).value
    document.body.append(probe)
    const result = getComputedStyle(probe).color
    probe.remove()
    return result
  }))
  const bounds = (await picker.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  await page.screenshot({ path: `test-results/oklch-${test.info().project.name}.png` })
  const hex = await page.locator('input[aria-label="Band 1 color hex value"]').inputValue()
  await picker.getByRole('group', { name: 'Color model', exact: true }).getByRole('button', { name: 'HSV triangle', exact: true }).click()
  await expect(picker.getByRole('textbox', { name: 'Band 1 color hex color', exact: true })).toHaveValue(hex)
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(picker).not.toBeVisible()
})

test('export recovery opens the preserved palette draft @checks', async ({ page }) => {
  await page.getByRole('group', { name: 'Edit tools' }).getByRole('button', { name: 'Palette', exact: true }).click()
  await page.getByRole('button', { name: 'Customize gradient', exact: true }).click()
  await page.getByLabel('Color hue value', { exact: true }).fill('150')
  await page.getByLabel('Color hue value', { exact: true }).press('Enter')
  await navigate(page, 'Settings')
  await page.getByRole('button', { name: 'Export LUT', exact: true }).click()
  await page.getByRole('button', { name: 'Review palette', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Export LUT', exact: true })).not.toBeVisible()
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'palette')
  await expect(page.getByLabel('Color hue value', { exact: true })).toBeVisible()
})

test('export and import sheets dismiss with browser Back and restore focus @checks', async ({ page }) => {
  await navigate(page, 'Settings')

  const input = page.getByLabel('Import .cube LUT', { exact: true })
  const importButton = page.getByRole('button', { name: 'Import .cube LUT', exact: true })
  const choosing = page.waitForEvent('filechooser')
  await importButton.click()
  await (await choosing).setFiles({ name: 'test.cube', mimeType: 'text/plain', buffer: Buffer.from(cube) })
  const confirmation = page.getByRole('dialog', { name: 'Confirm imported LUT', exact: true })
  await expect(confirmation).toBeVisible()
  await page.getByRole('combobox', { name: /^LUT camera input/ }).selectOption('Panasonic V-Log')
  await page.screenshot({ path: `test-results/import-sheet-${test.info().project.name}.png` })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([])
  await page.goBack()
  await expect(confirmation).not.toBeVisible()
  await expect(importButton).toBeFocused()
  await expect(page.locator('.workspace')).toHaveAttribute('data-section', 'configuration')
  await input.setInputFiles({ name: 'test.cube', mimeType: 'text/plain', buffer: Buffer.from(cube) })
  await expect(confirmation).toBeVisible()
  await page.getByRole('button', { name: 'Confirm and apply look', exact: true }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove imported look', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Cube size', exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 250))
  const trigger = page.getByRole('button', { name: 'Export LUT', exact: true })
  await trigger.focus()
  const before = await page.evaluate(() => window.scrollY)
  await trigger.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Export LUT', exact: true })
  await expect(sheet).toBeVisible()
  await page.screenshot({ path: `test-results/export-sheet-${test.info().project.name}.png` })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Close Export LUT', exact: true }).click()
  await expect(sheet).not.toBeVisible()
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0)
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
})
