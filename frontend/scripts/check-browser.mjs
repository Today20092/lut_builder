// Runs tests/browser-only.mjs (and tests/manual-browser.mjs when CHECK_MANUAL=true) against a Pages-mode build on a free port.
// Locally: `pnpm check:browser`. CI sets SKIP_BUILD=1 to serve the build it already made, BROWSERS="chromium firefox webkit" and PLAYWRIGHT_MODULE.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const playwrightModule = process.env.PLAYWRIGHT_MODULE
  ?? join(dirname(createRequire(require.resolve('@playwright/test/package.json')).resolve('playwright/package.json')), 'index.mjs')
const env = { ...process.env, LUT_BUILDER_PAGES: 'true' }
const outDir = process.env.SKIP_BUILD ? [] : ['--outDir', mkdtempSync(join(tmpdir(), 'lut-check-'))]

if (outDir.length) {
  const build = spawnSync(process.execPath, [vite, 'build', ...outDir, '--emptyOutDir'], { cwd: frontend, env, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}
const port = await new Promise(resolve => { const probe = createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)) }) })
const server = spawn(process.execPath, [vite, 'preview', ...outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: frontend, env, stdio: 'ignore' })
const url = `http://127.0.0.1:${port}/lut_builder/`
let status = 1
try {
  for (let attempt = 0; attempt < 30 && !(await fetch(url).then(r => r.ok, () => false)); attempt++) await new Promise(r => setTimeout(r, 1000))
  const scripts = [...(process.env.CHECK_BROWSER === 'false' ? [] : ['tests/browser-only.mjs']), ...(process.env.CHECK_MANUAL === 'true' ? ['tests/manual-browser.mjs'] : [])]
  status = 0
  for (const browser of (process.env.BROWSERS ?? 'chromium').split(' ')) for (const script of scripts) {
    const run = spawnSync(process.execPath, [script], { cwd: frontend, stdio: 'inherit', env: { ...env, BROWSER: browser, LUT_BUILDER_URL: url, PLAYWRIGHT_MODULE: playwrightModule } })
    if (run.status !== 0) { console.error(`${script} failed in ${browser}`); status = 1 }
  }
} finally {
  server.kill()
  if (outDir.length) rmSync(outDir[1], { recursive: true, force: true })
}
process.exit(status)
