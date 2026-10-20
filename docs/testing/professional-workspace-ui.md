# Shared workspace controls and mobile consistency

Date: 2026-10-20

The [research](../research/mobile-workspace-ui.md) maps Apple navigation and
accessibility, Cloudflare Kumo components, Stripe task patterns and Lightroom's
editing hierarchy to this workspace. The implementation retains the chosen
shadcn Rhea preset, Roboto and diagnostic colors.

## What changed

- Text/number fields and selectors share Input and NativeSelect rather than
  per-screen border, padding and focus recipes. NativeSelect's wrapper is a
  phrasing element so existing implicit labels remain valid; its visual surface
  belongs entirely to the select. Mobile controls retain 48px minimum height.
- Lucide icons consistently supplement navigation, task rows and utility
  actions. Accessible names still describe the action without reading SVGs.
- Phone destinations share an icon, title and purpose. Redundant top-level card
  titles are hidden while meaningful Save setup grouping remains visible.
- Presets use three compact sections with labeled actions, and application
  feedback uses the previously implemented toast without shifting the list.
- Palette editing and imported-look comparison use the shared ToggleGroup.
  Existing reducers, numeric editing, cancellation and exported LUT math remain
  the authorities for behavior.
- Contextual information opens by tap or keyboard in a shared popover. Escape
  dismisses it and restores focus. More's supplementary tooltips remain optional.
- The phone header wraps and navigation labels reflow for enlarged text rather
  than forcing the layout viewport wider than the screen.

## Verification and baseline review

Lint, UI TypeScript checking, all 109 unit tests and the production build passed.
Test bundles now externalize Lucide and Base UI consistently with the existing
graph UI harness; the camera-patch assertion counts only domain patches rather
than unrelated component inline styles.

Canonical candidate run:
[39376805496](https://github.com/Today20092/lut_builder/actions/runs/39376805496).
Its expected snapshot mismatches capture the intentional appearance changes.
All 48 candidates were reviewed before copying, across 320/390/1280px and
light/dark themes. Zero-pixel comparison tolerance is unchanged.

| Baseline | Reason for change |
| --- | --- |
| workspace | Mobile task heading and icons; shared band fields and utility icons. |
| configuration | Shared selector surfaces, Field grouping and mobile title deduplication. |
| configuration-expanded | Same fields plus tap-accessible cube-size help and output controls. |
| palette | Shared method toggle, action icons and task navigation. |
| gradient | Shared selectors, numeric fields, movement/action icons and task rows. |
| gradient-invalid-focus | Same treatment with invalid value and visible focus preserved. |
| imported-interpretation | Shared selectors and confirm/cancel icons; interpretation text preserved. |
| imported-workspace | Shared comparison toggle, configuration fields and mobile task heading. |

Additional browser walks covered all destinations at 320/390/1280px in both
themes without horizontal overflow or page errors. Navigation also worked at
430×932, 844×390 and 390×500, at normal and 200% root text size, without sideways
scrolling. The short viewport is an emulation of reduced available space, not a
physical soft-keyboard test.

Full canonical acceptance is recorded after the reviewed-baseline run.
Physical-phone keyboard, screen-reader and calibrated display checks were not
performed in this pass. The production bundle still reports the existing
over-500KB chunk advisory; splitting it is separate performance work.
