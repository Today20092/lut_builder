# Mobile workspace release

The release consolidates Presets, Edit, Preview and Settings into four consistent
destinations. Camera/output controls stay together in Settings; optional imports,
warnings and saved setups use disclosures. Export and import confirmation use
dialogs. Color editing gains mobile OKLCH controls, a saved-sRGB swatch and reserved
space for gamut feedback. Preview controls also wrap at enlarged phone text sizes.

## Canonical screenshot review

The versioned Linux Playwright workflow produced the candidates in run
[39956864335](https://github.com/Today20092/lut_builder/actions/runs/39956864335).
Reviewed the 320px, 390px and 1280px layouts in light and dark themes. Accepted:

- `workspace` and `band-modes`: four destinations, Edit subnavigation and selected
  band controls replace the former workspace arrangement.
- `presets`: mobile preset sections and the desktop preset destination.
- `setups`: saved work now sits below camera/output in Settings; capture starts at
  the top rather than retaining the disclosure's scrolled position.
- `configuration` and `configuration-expanded`: camera/output controls are always
  visible, so these formerly collapsed/expanded states now match.
- `palette`, `gradient` and `gradient-invalid-focus`: shared palette actions,
  touch controls, saved-color swatch, stable gamut feedback and invalid focus.
- `imported-interpretation`: confirmation is a modal sheet instead of an inline
  settings region; `imported-workspace` shows the confirmed camera interpretation.

Full-page phone captures place fixed navigation at the viewport boundary even
when the captured document is longer. The separate scrolling and reachability
checks assess controls behind that boundary. Screenshot comparison tolerances
and accessibility rules remain unchanged.

The full Linux suite must pass against these committed candidates before merge.
Chromium acceptance on 390px, 820px and 1280px passed locally, including durable
session reload, saved setups, import and cube downloads. GitHub Pages also runs
the deployed-build and manual checks in Chromium, Firefox and WebKit.

Real-phone screen-reader/keyboard behavior and physical S5IIX LUT loading have
not been retested for this release.
