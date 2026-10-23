// Shared by the deployed-browser checks; keep navigation aligned with the app.
export async function enterWorkspace(page) {
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click()
  await page.getByRole('button', { name: 'Add band', exact: true }).waitFor()
}

export async function openDisclosure(page, title) {
  const summary = page.locator('summary').filter({ hasText: title })
  if (await summary.locator('..').getAttribute('open') === null) await summary.click()
}

export async function navigateWorkspace(page, name, activate = locator => locator.click()) {
  const sheet = page.getByRole('dialog', { name: 'Export LUT', exact: true })
  if (await sheet.isVisible()) {
    if (name === 'Export') return
    await activate(page.getByRole('button', { name: 'Close Export LUT', exact: true }))
    await sheet.waitFor({ state: 'hidden' })
  }
  if (name === 'Export') { await activate(page.getByRole('button', { name: 'Export LUT', exact: true })); return }
  const destination = ['Bands', 'Palette'].includes(name) ? 'Edit' : ['Configure', 'Setups'].includes(name) ? 'Settings' : name === 'Media' ? 'Preview' : name
  const control = page.viewportSize().width < 960
    ? page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: destination, exact: true })
    : page.getByRole('tab', { name: destination, exact: true })
  await activate(control)
  if (['Bands', 'Palette'].includes(name)) await activate(page.getByRole('group', { name: 'Edit tools' }).getByRole('button', { name, exact: true }))
}
