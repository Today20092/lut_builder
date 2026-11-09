# UI quality checks

Use this workflow when changing layout, styling or controls. The regular frontend
checks in AGENTS.md still apply. Rendered screens are the evidence: unit tests and
a clean source-code critique do not establish visual quality. No CI job runs these
checks, so a UI change is only reviewed if someone runs them.

## Fast review

From `frontend/`, with `pnpm dev` running (install Chromium once with
`pnpm exec playwright install chromium`):

```sh
pnpm ui:shots
```

This takes about 30 seconds. It screenshots every screen at 320, 390, 768 and
1280px in both themes into `frontend/test-results/shots/`, runs axe and an overflow
check on each, and exercises radio selection and the enlarged-preview dialog. Set
`UI_URL` for another server and `UI_WIDTHS` for other widths.

Done: the command reports no problems, and you have looked at the screenshots for
every changed component. Check alignment, balanced spacing, wrapping, contrast,
overflow, and whether the selected control is obvious. Full-page captures show
fixed navigation mid-page; that is a capture artifact.

## Browser acceptance

`pnpm check:browser` builds in Pages mode to a temporary folder, serves it on a free port and runs `tests/browser-only.mjs` in Chromium. CI runs the same script in Chromium, Firefox and WebKit, so run it before pushing any markup, control or accessible-name change. Set `BROWSERS="chromium firefox"` for more engines.

## Deeper behaviour tests

The Playwright suite in `frontend/tests/ui/` covers geometry, enlarged text, focus,
recovery and accessibility in more states. It is optional and slower:

```sh
pnpm typecheck:ui
pnpm test:ui:checks --project=390-light --project=1280-light --grep 'disclosures'
```

It starts its own Vite server on port 4187; set `UI_PORT` when another checkout holds that port. CI does not run it, so run it after changing markup the specs query by role or name: they went stale unnoticed once before. Each test
gets a fresh browser context. The matrix lives in
[playwright.config.ts](../../frontend/playwright.config.ts). Open
`pnpm test:ui:report` after failures. When changing the UI, extend the relevant test
when the expectation is measurable, and fix violations rather than disabling rules.

Emulation supplements real-phone scrolling, keyboard and screen-reader checks;
report those separately when not performed. Cross-browser and media checks are in
[integration.md](integration.md).

## Assessed accessibility exception

The scan includes WCAG 2.2 AA. Dense exposure-graph handles can overlap because
their positions encode exposure. Their `target-size` findings use the
[WCAG 2.5.8 Equivalent exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
the same page provides numeric position and total-width controls of at least
24×24 CSS pixels. The gradient's add-on-bar target uses the same exception while its
full-size **Add color** button is available. Fill separators closer than 24 pixels
rely on the equivalent numeric boundary fields and color-picker buttons. All other
findings remain failures. Reassess this exception if graph operations or their
equivalent controls change.
