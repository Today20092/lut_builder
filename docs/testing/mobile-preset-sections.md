# Mobile preset sections

The mobile Presets destination replaces its selector with three visible sections:
IRE (Camera-log IRE and Detailed IRE), Fill (Contrast Checker, Standard Fill and
Detailed Fill), and Stops (Three-band Exposure, Standard Stops and Detailed Stops).
Each action shows its description and applies directly, with nearby live feedback.
Desktop retains its selector. All choices reuse existing editor preset operations
in one undoable update; no exposure calculations or numeric presets were added.

Reviewed full-page captures at 320px, 390px and 1280px in light and dark themes:
labels wrap, action targets are at least 48px high on mobile, and content has no
horizontal overflow. The fixed navigation overlays the viewport while scrolling;
the reserved bottom padding lets the last action and text scroll clear of it.
No existing screenshot baseline was changed.

Acceptance covers all original presets, configuration preservation, each newly
exposed Standard/Detailed arrangement, undo, minimum mobile action height, and
accessibility of the grouped page. The full matrix captures mobile Presets as a
review artifact. Automated checks use emulation; physical-phone and screen-reader
testing were not performed.

Local verification: locked install, lint, UI typecheck, 109 unit tests and the
production build passed. The full local layout/accessibility matrix passed
90 checks, with six intentional skips for mobile-only tests on desktop.

Canonical Linux [UI-quality run 39364086948](https://github.com/Today20092/lut_builder/actions/runs/39364086948)
passed the full acceptance and strict screenshot-comparison suite for commit
`2840418`. Existing baselines remain unchanged.
