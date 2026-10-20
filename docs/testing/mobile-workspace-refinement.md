# Native-style mobile workspace refinement

Approved direction: mobile proposal reviewed on 2026-10-19. Implementation remains
on `codex/workspace-composition-55-56`; desktop keeps its existing workspace layout.

## Behavior

- Five bottom destinations: Bands, Palette, Presets, Media and More. Configuration
  and saved setups are under More; Export LUT remains in the header.
- Bands uses an inline exposure graph, numbered selection, Add/Undo and exact
  color/position/width fields. The graph scrolls away rather than covering controls.
- Palette retains its compact preview. Configuration, presets, media, setups and
  export do not carry the exposure stage above their controls.
- Occasional band settings, palette adjustments, saved palettes, imported LUTs and
  signal warnings open a dedicated phone screen with Back and focus restoration.
- Main tab content does not require another Collapse/Expand action. Output settings,
  setup loading, camera verification and exact gradient hex fields are visible in
  their destination. Optional explanations and the photo illustration retain their
  useful disclosures.
- Phone fields use 16px text and primary controls use 48px targets. Compact band and
  header controls retain at least 44px targets. Bottom safe-area clearance reserves
  space for the navigation.

`WorkspaceShell` owns navigation; `WorkspaceTask` owns responsive task presentation.
Existing controls and domain state remain shared. LUT mathematics, source
interpretation, draft application, undo and portable setup behavior are reused.
The media file inputs explicitly shrink within their grids, including at 320px.
Responsive disclosures retain their mounted content and desktop open state across
viewport changes; an unconfirmed imported LUT draft survives the same transition.

## Verification

- Locked install, frontend lint, 109 unit tests, UI TypeScript and production build
  passed. Bundled browser assets were regenerated.
- The existing 72 behavior/accessibility checks passed across 320/390/1280px and
  light/dark. A new graph-scroll assertion initially assumed every page was tall
  enough to move the graph offscreen; it now checks movement against actual scroll.
- New phone navigation and touch checks cover the four phone projects. They verify
  task isolation, native file-input containment, focus return, graph scrolling and
  horizontal touch editing. Desktop skips these phone-only cases.
- Screenshot setup waits for the initial session write. The restore test polls the
  serialized edited value before reloading, respecting the existing 500ms autosave
  debounce rather than treating an older saved-status message as proof of durability.
- Separate Chromium, WebKit and Firefox runs passed navigation, task isolation,
  media containment, exact editing/undo, landscape overflow and fields remaining
  above the bottom navigation.
- Synthesized Chromium touch moved a band horizontally and scrolled vertically
  across the graph without changing exposure. This is browser automation, not a
  physical-device test.
- The independent mobile review confirmed task isolation, 320px media containment
  and the band toolbar after its two material findings were corrected.

The canonical Linux screenshot capture is
[run 39345335576](https://github.com/Today20092/lut_builder/actions/runs/39345335576).
All 32 mobile candidates (eight states in four width/theme projects) were reviewed
and accepted. The strict comparison passed in
[run 39346873728](https://github.com/Today20092/lut_builder/actions/runs/39346873728),
including both unchanged desktop baseline sets. The complete Linux gate passed in
[run 39348490422](https://github.com/Today20092/lut_builder/actions/runs/39348490422):
92 passed, with four intentional desktop skips for the two phone-only tests. This
includes all 48 screenshot comparisons with updates disabled and zero pixel
tolerance. Application code was at `748dc53`; later changes only record this result.

## Baseline intent

Phone workspace and imported-workspace images change for bottom navigation, stage
placement, compact selection/actions and directly available fields. Configuration
images change because output settings are already open; collapsed and expanded
capture names represent the same phone presentation. Palette and gradient images
change for dedicated saved/advanced tasks and visible exact hex editing. Imported
interpretation changes to a dedicated screen. Desktop baselines are preserved;
incidental desktop text metric differences are corrected rather than accepted.

## Limits

No physical iPhone/Android keyboard, safe-area, browser-chrome, back-gesture or
screen-reader testing was available. Automated WebKit does not establish Safari
hardware behavior. This refinement did not repeat camera-file decoding or display
calibration; existing generation/import integration checks use synthetic inputs.
