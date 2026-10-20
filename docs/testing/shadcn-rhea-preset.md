# Shadcn Rhea preset migration

Applied `b27GcsVu` with the shadcn CLI's full overwrite command, retaining Base UI.
Preset resolution reports Rhea, neutral theme and charts, Roboto, Lucide, default
radius, subtle menu accent, and default-translucent menus, without fallbacks.
All four installed components (Button, Card, Spinner and Tooltip) were refreshed.
Roboto is bundled locally. Existing mobile navigation, dedicated settings screens,
grouped presets, media handling and exposure calculations remain in place.

Integration adjustments:

- Both dark utilities and tokens follow the device color scheme, as before.
- Light muted text uses OKLCH 0.53 instead of 0.556: the latter failed WCAG AA
  against a muted surface at 4.34:1. No accessibility rule was disabled.
- ESLint explicitly allows the existing public `buttonVariants` export in the
  generated Button module, alongside its component export.

Reviewed all 48 canonical candidates from
[visual run 39368494457](https://github.com/Today20092/lut_builder/actions/runs/39368494457),
at 320px, 390px and 1280px in light and dark themes. Every baseline changes
intentionally because Roboto replaces the system font, Rhea changes shared control
shapes and spacing, light backgrounds become white, and dark backgrounds deepen.
States include default workspace, configuration collapsed/expanded, palette,
gradient, invalid/focused gradient input, imported interpretation and imported
workspace. No clipping or horizontal overflow was found in the reviewed layouts.
The mobile Presets page was separately reviewed at both phone widths and themes.

Locked install, lint, UI typecheck, 109 unit tests and production build passed.
Physical-phone and screen-reader tests were not performed.
