# Visible workspace controls review

Branch: `codex/visible-workspace-controls`  
Base: `development` / `origin/development` at `c9faf14` on 2026-10-23.
This release merge has the same source tree as the initially inspected `8a9fc8f`.

## Changes for review

- Edit exposes band modes, shared widths and movement increments. The former
  combined band/graph disclosure is gone. Graph view remains secondary and shows
  its current range while collapsed; bounded numeric entry replaces its long list.
- Presets uses the existing explained, previewed IRE / Fill / Stops browser on
  desktop as well as phones. Arrangement replacement is no longer duplicated in
  Edit; explicit Use and band-edit undo remain.
- Color model, display color space, cube size, gradient blend, hue path and imported-look output
  interpretation use visible exclusive choices built from the shared ToggleGroup.
  A selected value cannot be accidentally cleared by pressing it again.
- Export shows all destinations with explanations and preserves compatibility
  checks. Saved setups and imported-look management stay visible in Settings.
  Active imported-look identity and removal are directly accessible.
- Gradient hex entry stays visible. Touch palette intensity uses validated numeric
  entry rather than a percentage menu. Advanced palette summaries expose active
  overall adjustments. Fill coverage is explanatory text rather than a fake field.
- Short media-decoding choices retain explicit Unconfirmed options and reset
  confirmation when changed. Still RGB range uses an explicit checkbox. Transfer
  and gamut lists, camera lists, saved libraries and optional help stay compact.
- Manual controls guidance and DESIGN.md describe the new interaction rules.
  No numerical LUT behavior, persistence schema or media limits changed.

## Verification

- Locked dependency install, TypeScript application build and lint pass.
- Complete frontend unit suite: **113 passed**, including media confirmation,
  palette persistence, graph range validation, imported looks and Python/browser
  parity. The final run uses `pnpm exec node --experimental-strip-types --test
  --test-concurrency=1 tests/*.test.mjs`: the parallel attempt exhausted host memory
  while browser checks were active; the serial run passed without skips.
- Native browser checks cover the configured 390px, 430px and 1280px layouts in
  both themes. The initial full run had 158 passes, 10 skips and 10 failures against
  obsolete control assertions or during live reload. The affected final-source
  rerun passed 38 checks, with four phone-only desktop cases skipped. Two desktop
  preset assertions still expected the phone's 44px target rule; they now check
  the applicable 24px desktop accessibility minimum and 48px project phone rule.
  Final desktop rerun: **2 passed** in both themes. Together, the focused final
  runs pass **40 checks** with four expected phone-only desktop skips, clear every
  earlier failed case and exercise the newly shared desktop preset browser.
  Commands: `pnpm exec playwright test --grep 'fill coverage|starting over|complete
  presets|preset sections|confirmed imported|accessibility in default|enlarged phone
  text|first visit' --workers=2`, then `pnpm exec playwright test
  --project=1280-light --project=1280-dark --grep 'complete presets' --workers=2`.
- 66 separate production-build captures cover Edit, invalid graph range, color
  picker, presets, gradient, invalid/focused gradient and expanded adjustments,
  Settings, export compatibility and imported interpretation across all six
  width/theme combinations, plus initial-setup and Settings display choices.
  Captures reported no overflow or page errors and
  were visually inspected. Local evidence is in
  `.scratch/visible-controls-review/`; these host captures are not Linux baselines.
- Docker Desktop fails during startup with an inaccessible `sailor-ingest.sock`.
  The canonical Linux screenshot comparison/update gate is therefore pending.
  No baseline PNGs were replaced with Windows screenshots. Before integration,
  regenerate and inspect the affected Linux baselines, then pass the complete
  container UI gate. Expected changes include visible band controls, preset
  browser, setup loading, choice groups, gradient hex entry and import sheet.
- Physical-phone/Safari and fresh end-to-end FFmpeg media acceptance were not
  performed. No Python implementation changed; the standalone Python suite was
  not rerun.

## Private preview

Review URL: https://desktop-ayoub.cuttlefish-coho.ts.net:8457/

The review checkout is
`C:/Users/User/.codex/worktrees/visible-workspace-controls/lut_builder`.
Tailscale Serve uses HTTPS port 8457 and a loopback production preview on 5179;
existing Serve/Funnel routes are preserved. The preview requires the user's
Tailscale connection. Browser storage is specific to this preview origin; saved
work on another URL is not automatically copied. Import/export setup files to
transfer it. Development has not been merged or published.

This host has Tailscale DNS disabled, so its system DNS resolves the hostname to
the public Funnel addresses. Tailnet HTTPS and the manual were verified with
the hostname resolved explicitly to this machine's Tailscale address. A phone
using Tailscale DNS can use the review URL directly; no system DNS setting was changed.

DESIGN.md was updated; the optional `.impeccable/design.json` sidecar was not
regenerated as part of this change.
