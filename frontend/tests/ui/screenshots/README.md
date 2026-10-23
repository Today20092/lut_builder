# Visual baseline history

## Current matrix

Routine projects now use 390×664 and 430×740 phone browser viewports from
Playwright's iPhone 13 and iPhone 14 Pro Max descriptors, plus 1280×900 desktop,
each in light/dark. The 320px projects no longer run; their files are historical.

The 66 current references were reviewed from Linux Playwright 1.61.1 Noble
[run 39992738099](https://github.com/Today20092/lut_builder/actions/runs/39992738099)
on 2026-10-23, source `c47dfb7d228e1724b4e4feebcf7cbd59481a6828`.
The 430px images are new captures, not renamed 320px files. Changed 390px captures
reflect the representative phone browser height. Full-page workspace, Presets,
Settings and imported-workspace states include the project footer. The band table
has three columns and selected-band removal sits beside Add band and Undo.
Light-theme destructive controls use the corrected contrast token.

Reviewed states cover all 11 image names at each width/theme, including palette,
gradient, invalid focus and imported-LUT confirmation. Fixed phone navigation
appears at the viewport boundary in full-page/region captures; separate scrolling
and interaction checks verify content reachability. Tolerances remain zero.
Run the complete UI gate against these references before deployment.

## Initial review

Reviewed on 2026-10-19 using Playwright 1.61.1 in its Noble Linux image.
The 36 images cover 320, 390 and 1280 CSS-pixel widths in light and dark themes:
the default workspace, collapsed and expanded configuration, palette selection,
gradient editing, and a focused invalid hue field.

These established the initial UI comparison reference. Review confirmed
balanced collapsed disclosure spacing, a vertical mobile/horizontal desktop
exposure legend, adjacent Blend/Hue selectors, selected-color feedback, visible
channel tracks, and focus rings. At 320px, longer labels and mode buttons wrap
without clipping. Region captures start at scroll position zero so the sticky
preview cannot hide headings.

Known limitation: the invalid hue draft is marked for assistive technology but
does not show an explanatory inline error. These baselines preserve that existing
behavior; passing comparisons are not a claim that every usability issue is solved.

For review and update commands, see [UI quality checks](../../../../docs/testing/ui-quality.md).
