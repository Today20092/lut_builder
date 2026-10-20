# More menu and preset feedback

More presents Configure, Setups, Help / Manual and Report an issue as matching
48px ghost rows with aligned leading icons, padding and typography. Internal
destinations have chevrons; external destinations retain anchor semantics and
show an external-link icon. New-tab information is available in accessible names
and supplementary shadcn tooltips. Base UI intentionally disables tooltips on
touch devices, so no essential information relies on hover.

Applying a preset on mobile or desktop shows the preset's success notification
through the shadcn Base UI Toast component. The old inline success paragraph is
removed. Notifications dismiss automatically after 3.5 seconds, can be closed
manually, are announced to assistive technology and float above mobile navigation
with safe-area spacing. The close control has a 44px mobile target. Reduced-motion
preferences disable toast transitions. Band-edit undo remains in Bands.

Coverage checks matching menu rows, compact heading spacing, external-link
semantics, mouse tooltips, no preset-page height change, notification placement,
manual dismissal, automatic expiry and accessibility while the notification is
open. Screenshots cover More and preset feedback at 320px and 390px in both themes,
plus desktop notifications at 1280px. Existing baseline appearances are unchanged;
the new screenshots are retained as test artifacts.

The full Linux matrix has a 25-minute job budget. The prior 15-minute budget was
exhausted during the Rhea migration run; assertions and screenshot tolerances
remain unchanged.
