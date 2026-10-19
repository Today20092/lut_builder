# Workspace and imported composition acceptance

Issues: [55](https://github.com/Today20092/lut_builder/issues/55) and
[56](https://github.com/Today20092/lut_builder/issues/56). Integration branch:
`codex/workspace-composition-55-56`; review base: `dba91c7`.

## Behavior and maintenance

The workspace separates task navigation/layout from the existing editor and
verification modules. Phone editing keeps the exposure reference with selected
band controls; desktop adds a navigation rail and adjustment column. Configuration,
presets, setup files, media and export have their own panels. Validated current
sessions restore locally; setup files carry work between devices. Media must be
reselected. Corrupt current sessions and named libraries retain their raw bytes
until explicit recovery; blocked writes and downloadable backups prevent silent
loss. Preset validation uses Schema and one cancellable Effect lifetime.

Imported look parsing, sampling and declared encoding live in focused modules.
Original camera samples determine exposure before direct tetrahedral look
evaluation. Outside overlays the base look bypasses additional output encoding;
diagnostic colors encode and range-pack once. Portable version 3 embeds the exact
cube and hash; ordinary legacy formats remain readable. See
[composition mathematics and limits](../imported-lut-composition.md).

## Verification

- Python: **194 passed**, no skipped tests. Two pre-existing Canon Log 3 warnings
  remain. Ruff formatting/lint and ty passed. No Python changes followed this run.
- Frontend: **109 passed**, no skipped tests; lint, TypeScript, UI types and
  production/manual build passed. Rebuilt bundled assets are committed.
- Nineteen Python/browser composition comparisons include all output transfers,
  gamuts/ranges, warning priority and 17/33/65 sampling. Maximum serialized-channel
  difference was `1.000000001e-7`; independent display tests and finite-marker
  measurements are documented separately.
- Connected production Chromium: palette drafts/persistence/server restart,
  setup import/export, generation, numeric and keyboard editing, dialog focus,
  390px/desktop/200% text/dark layouts, real PFM verification, pixel inspection,
  exact checked-cube hash, invalidation, and real VFR video frame selection,
  verification, errors and release passed. The complete keyboard-only workflow
  passed. Imported-look verification on original PFM samples passed: declared
  transfer and embedded identity match provenance, Look renders the real source,
  and toggling it preserves inspection and exact checked-cube bytes. No page errors.
- Static Pages Chromium, Firefox and WebKit: desktop 1280, phone 390 and tablet
  820 workflows passed, including 17/33/65 generation, setup persistence,
  cancellation, keyboard controls and no remote computation requests. Browser
  automation is emulation, not a physical-device or calibrated-monitor claim.
- Native recovery accessibility passed all six configured widths/themes. The
  full strict Linux gate is recorded below after its final run.

## Canonical visual evidence and baseline changes

Local Docker's Linux daemon could not start; no reset or security/configuration
workaround was applied. The existing versioned GitHub Actions Playwright image
provided canonical Linux evidence. Initial full run
[39334282163](https://github.com/Today20092/lut_builder/actions/runs/39334282163)
passed 65 checks and exposed one transient restore-message assertion, corrected to
check persistent recovery feedback and the restored value. Its six visual tests
failed against the intentionally replaced layout. Focused capture run
[39336117618](https://github.com/Today20092/lut_builder/actions/runs/39336117618)
captured the final visual states without updating snapshots or reducing tolerance.
The 36 shared captures were byte-identical between these runs.

All 48 candidate images were opened and visually valid. The fresh finish reviewer
found no material UI corrections in the required matrix. Each state below applies
at **320, 390 and 1280 pixels in both light and dark themes**:

| Baseline | Intentional change |
| --- | --- |
| `workspace.png` | New header, task navigation, exposure stage and selected-band layout replace the long single-column page. |
| `configuration.png` | Configuration occupies its dedicated adjustment panel and uses the new panel width. |
| `configuration-expanded.png` | Expanded output settings retain their controls within that panel. |
| `palette.png` | Palette editing occupies its own task panel without duplicating the band controls. |
| `gradient.png` | Expanded gradient controls follow the new panel geometry. |
| `gradient-invalid-focus.png` | Invalid hue and focus feedback remain visible within the new panel geometry. |
| `imported-interpretation.png` | New explicit source/output confirmation for the imported cube. |
| `imported-workspace.png` | New actual serialized exposure comparison and confirmed imported-look controls. |

Candidates were copied deliberately from canonical Linux output to their matching
baseline paths. Pixel tolerance remains **zero**; automatic snapshot updates remain
disabled. Manual CI can select visual capture alone; reusable/default runs still
execute the complete gate.

## Review and limits

Independent Standards review findings were fixed and rechecked: named-library
data preservation, Effect interruption, Schema envelope validation and shared
serialization. Independent Spec review found no remaining confirmed defects.
The fresh visual reviewer cleared all 48 states. Its sole process correction was
to record that no randomized design seed ran: the implemented direction follows
the user's pinned Lightroom brief. The surface contract now discloses that workflow
deviation; no retroactive seed provenance or complete seed gate is claimed.
Keyboard acceptance additionally exposed and fixed graph focus changing panels;
merely focusing a handle now preserves the current panel, while explicit activation
opens band editing. Removal confirmation survives focus within the selected band.

No physical phone, mobile software keyboard, storage eviction, manufacturer-media
certification, HDR viewing or calibrated-display check was performed. Cube sampling
can blur or miss narrow markers, and large imported setups can exceed browser
storage quota; those limitations are visible in the product and composition guide.

Final strict Linux result and design documentation: pending final run/recording.
