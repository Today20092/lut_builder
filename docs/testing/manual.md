# Browser manual acceptance — issue #42

Checked October 19, 2026. The [manual source](../../frontend/manual/src/content/docs/index.md)
contains nine complete user-facing topics, separate from the CLI/development guide.
The workspace has a header Help / Manual link and contextual links for configuration,
bands/palettes, recorded-signal limits, saving/application, and camera verification.
Help opens in another tab to preserve the editing session.

## Build and routing

From `frontend/`:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

`pnpm build` builds Vite first, then Starlight. Both outputs live under
`src/lut_builder/static/`; the manual occupies only `docs/`. Do not build the manual
before Vite, whose output cleanup would remove it. The final bundled assets use
the default local paths `/` and `/docs/`.

For Pages, set `LUT_BUILDER_PAGES=true` before building and before starting Vite
preview. On PowerShell:

```powershell
$env:LUT_BUILDER_PAGES = 'true'
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort
```

The builder is then at `/lut_builder/` and the manual at `/lut_builder/docs/`.
The existing Pages workflow uploads the combined directory and runs the manual
acceptance check alongside the existing browser check for each browser engine.
It still waits for the Python job before deployment.

Starlight 0.37.6 and locked Astro 5.18.2 build successfully in this repository.
The initially attempted Starlight 0.42.6 / Astro 7.4.0 pair failed during prerendering
with a `cookie` named-export incompatibility. Sharp is an explicit build dependency
for optimizing the screenshot. The older Astro dependency tree reports TypeScript 6
peer-range warnings in `tsconfck` and `zod-to-ts`; lint, application TypeScript
compilation, and static generation passed. No application TypeScript downgrade was made.
Setup follows the [Starlight manual setup](https://starlight.astro.build/manual-setup/)
and [component override](https://starlight.astro.build/guides/overriding-components/)
documentation fetched through Context7.

## Browser acceptance

Use the existing external Playwright installation as described in
[integration verification](integration.md). From the repository root:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/path/to/playwright/index.mjs'
$env:LUT_BUILDER_URL = 'http://127.0.0.1:4173/lut_builder/'
$env:BROWSER = 'chromium' # repeat with firefox and webkit
node frontend/tests/manual-browser.mjs
```

Set `MANUAL_EVIDENCE` to an output directory for screenshots. The script tests all
nine direct page URLs, internal links and heading fragments, stylesheet/script/image
assets, a real Pagefind search for “purple”, keyboard activation of Help, the mobile
menu, screenshot decoding, document overflow, return navigation, and every workspace
manual link. It uses 1280px and 390px viewports. Search assets are fetched by the real
browser, including the index and WebAssembly module.

Results:

| Check | Result |
| --- | --- |
| Locked frontend install and ESLint | Passed |
| Frontend tests | 64 passed |
| Combined local and Pages builds | Passed |
| Pages-path manual acceptance, Chromium | Passed at both widths |
| Pages-path manual acceptance, Firefox | Passed at both widths |
| Pages-path manual acceptance, WebKit | Passed at both widths |
| Existing browser-only acceptance | Passed in all three engines at desktop, phone, and tablet widths |
| Local Vite preview, Chromium | Passed at both widths |
| Actual Python local server, Chromium | Passed at both widths, including search |
| Current browser screenshot | Captured and included in the first-LUT guide |
| Visual inspection | Desktop and narrow manual screenshots inspected, including dark appearance |
| Ruff format and lint | Passed |
| `uv run ty check` | Passed in the isolated PR worktree |
| `uv run pytest -q` | 158 passed; documentation routes, search JS, missing pages and traversal rejection included |
| `git diff --check` | Passed |

The initial shared-checkout run encountered a Windows media-cleanup timing failure.
The isolated PR worktree's full suite passed, with two existing colour-science
Canon Log 3 numerical warnings. Media processing was not changed for this task.

## Scope and remaining checks

The manual documents maintained LUT behavior without changing calculations or
thresholds. It distinguishes nominal thresholds from the exporter's half-grid
tolerance, high-over-low precedence, and sensor-clipping uncertainty. All six
profiles have exact constants, range assumptions, evidence status, and 65³ grid
examples. Sony and Panasonic vendor documents were retrieved directly; inaccessible
vendor URLs and missing historical derivations are identified explicitly rather
than presented as established evidence.

The PR was reconciled against the published main branch in an isolated worktree.
The manual describes camera-log IRE defaults, legacy target IRE, and the published
setup, output-range, and palette controls. Separate local mobile-workflow changes
were excluded. The screenshot was refreshed from this reconciled build.

Successful local Pages-path checks do not establish a successful GitHub Actions
deployment; the PR and deployment runs provide that evidence after publishing.
Physical phones/tablets, assistive technology,
and camera/monitor hardware were not tested. Emulated widths do not establish those
results. No real camera threshold calibration is claimed.
