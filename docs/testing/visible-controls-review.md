# Visible workspace controls review

Branch: `codex/visible-workspace-controls`  
Base: `development` / `origin/development` at `8a9fc8f` (matching after fetch on 2026-10-23).

## Changes for review

- Edit exposes band modes, shared widths and movement increments. The former
  combined band/graph disclosure is gone. Graph view remains secondary and shows
  its current range while collapsed; bounded numeric entry replaces its long list.
- Presets uses the existing explained, previewed IRE / Fill / Stops browser on
  desktop as well as phones. Arrangement replacement is no longer duplicated in
  Edit; explicit Use and band-edit undo remain.
- Color model, cube size, gradient blend, hue path and imported-look output
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
- Complete frontend unit suite passes, including media confirmation, palette
  persistence, graph range validation, imported looks and Python/browser parity.
- Native browser checks cover the configured 390px, 430px and 1280px layouts in
  both themes; final run results are recorded below after completion.
- 54 separate production-build captures cover Edit, invalid graph range, color
  picker, presets, gradient, invalid/focused gradient and expanded adjustments,
  Settings, export compatibility and imported interpretation across all six
  width/theme combinations. Captures reported no overflow or page errors and
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

Tailscale Serve uses a separate HTTPS port and a loopback production preview;
existing Serve/Funnel routes are preserved. The preview requires the user's
Tailscale connection. Browser storage is specific to this preview origin; saved
work on another URL is not automatically copied. Import/export setup files to
transfer it. Development has not been merged or published.
