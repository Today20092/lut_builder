# Visual baseline history

## Current matrix

Routine projects now use 390×664 and 430×740 phone browser viewports from
Playwright's iPhone 13 and iPhone 14 Pro Max descriptors, plus 1280×900 desktop,
each in light/dark. The 320px projects no longer run. The images below record
the earlier matrix; 430px candidates and affected 390px captures require canonical
Linux review before deployment. Do not rename 320px images as 430px baselines.

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
