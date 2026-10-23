# Mobile-first color editing

Individual band and warning colors now reuse the existing OKLCH picker and gamut
mapping from GradientPicker. Phones start in OKLCH mode; HSV and Tailwind presets
remain available. Numeric channels, 44px sliders and step buttons work in a modal
bottom panel with safe-area spacing and internal scrolling. Done keeps live edits;
Escape restores the original color. HEX remains the stored LUT color format.

Fill Coverage is read-only and now occupies a field-sized surface aligned with
the boundary control. No LUT coverage calculation changed.

DESIGN.md makes mobile the primary design target. Tests cover channel entry,
phone-width containment, dismissal, palette recovery and first-run/cancel labels.
The previous consistency audit records the five implemented workflow fixes.

Validation: 23 affected component tests passed. The final navigation/recovery
matrix passed 28 cases with 2 expected desktop skips. The subsequent final picker
and Fill matrix passed 10 cases with 2 expected desktop skips, including OKLCH-to-HSV
color preservation. Lint, application/UI TypeScript and production/manual builds
passed. Reviewed phone and desktop light/dark captures; phone Coverage and boundary
values align and the color panel remains within the viewport. The Tailscale Serve
preview returned HTTPS 200. Earlier recovery-test failures were corrected by
actually starting a gradient audition before expecting the recovery action.

Canonical Linux screenshots, physical-phone keyboard/screen-reader checks and
the complete regression matrix remain separate release acceptance work.

## Picker-height regression

The normal gamut message and longer out-of-sRGB warning previously occupied
different line counts and resized the bottom panel. Both now share a grid cell;
the longer wrapping message always reserves its space, while only the active
message is visible and exposed to assistive technology. No fixed text height or
warning truncation is used.

The regression test moves Lightness, Chroma and Hue through their endpoints,
crosses the gamut boundary repeatedly, and compares panel x/y/width/height and
all three slider rectangles against the initial state (at most 1px rounding).
All 6 size/theme cases pass: 320, 390 and 1280px, light and dark. Normal/warning
screenshots were reviewed. All 23 affected component tests, lint and UI types
pass. This tests value changes at a fixed viewport; it does not promise a fixed
panel height when the browser keyboard or viewport size changes.

## Live saved-color swatch

The picker header now includes a live swatch and uppercase HEX value. It previews
the actual saved sRGB color in OKLCH, HSV and preset modes. The header remains
visible during panel scrolling. The gamut status describes the sRGB file limit;
it does not claim to measure or calibrate the physical phone display. Normal and
warning messages retain the shared reserved space to avoid slider/panel shifts.

Browser checks compare the swatch's computed CSS background and displayed HEX
against the actual band value after editing, and retain the repeated gamut-change
geometry assertions. Native captures at the configured widths/themes are reviewed.
Lint, UI types, the 23 affected component tests and production/manual builds pass.
The 12-case swatch/geometry run passed 9 cases before the dev server exhausted
host memory during desktop checks. A sequential desktop rerun passed all 4 cases.
Phone captures show the live saved swatch and HEX without value-driven resizing.
The Tailscale preview was verified at HTTPS 200 after rebuilding.
