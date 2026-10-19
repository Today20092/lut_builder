import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Match CI's OS, browser and fonts; isolate Linux dependencies from the host.
const root = fileURLToPath(new URL('../../', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = manifest.devDependencies['@playwright/test']
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Pin @playwright/test to an exact version before updating visual baselines.')
const result = spawnSync('docker', [
  'run', '--rm', '--init', '--ipc=host',
  '--mount', `type=bind,source=${root},target=/work`,
  '--mount', 'type=volume,target=/work/frontend/node_modules',
  '--mount', 'type=volume,source=lut-builder-ui-pnpm-store,target=/pnpm/store',
  '--workdir', '/work/frontend',
  `mcr.microsoft.com/playwright:v${version}-noble`,
  'bash', '-c', 'npm install --global pnpm@10.28.2 && pnpm install --frozen-lockfile --store-dir /pnpm/store && pnpm exec playwright test "$@"',
  'ui-tests', ...process.argv.slice(2),
], { stdio: 'inherit' })
if (result.error) console.error(`Could not run Docker: ${result.error.message}. Start Docker Desktop with Linux containers.`)
process.exitCode = result.status ?? 1
