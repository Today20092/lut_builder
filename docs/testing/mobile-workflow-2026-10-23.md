# Mobile videographer workflow

Implemented locally on `codex/workspace-composition-55-56` on 2026-10-23.

## Agreed journey

Choose camera/log → choose an explained exposure preset → customize with the
existing preview → export → load and use. Media is optional. Returning users
resume their validated browser session. The restrained Lightroom direction stays.

New LUT is available in the desktop header and phone More menu. Its two steps
keep choices local until Start editing. Cancelling preserves the editor screen
and mounted media workflow. Successful creation opens Bands with an independent
setup; existing setup-replacement recovery retains the previous setup. Autosave
does not overwrite the saved session while the new-LUT flow is open. Failed
validation leaves the flow open and the current setup intact.

Export offers general, external-monitor, editing-software and S5IIX destinations.
The S5IIX option requires Panasonic V-Log input, at most 33³ and full-range output.
The explicit compatibility action preserves band values and tells users to review
their thresholds after changing camera. Imported looks cannot silently change
their confirmed input. Camera downloads use an eight-character settings ID;
other destinations preserve configured naming. Loading instructions expand after
download and distinguish View Assist from baking diagnostic colors into a recording.

## Implementation boundaries

NewLut is a presentational React flow that reuses applyExposurePreset and BandStrip.
Creation reuses the setup-replacement adapter, which now reports success/failure
without removing its finalizer or recovery behavior. Export compatibility and
filename selection are shared between the visible review and generation handler.
No dependencies or numerical LUT algorithms changed. Browser sources, manual,
product/design documentation and rebuilt bundled assets are included.

## Validation

- Locked pnpm install, ESLint, TypeScript app build, manual build and UI typecheck passed.
- Frontend unit/integration suite: 112 passed, zero skipped.
- Full layout/accessibility sweep: 119 passed, 8 intentional desktop skips of
  phone-only cases, 5 failures. The failures comprised a new-row spacing defect,
  a new test scanning legacy graph handles without the existing numeric-equivalent
  assessment, and two cases interrupted during live source/build updates.
- All five cases were corrected or rerun after the source/build stabilized.
  Final focused run: 24 passed across 320, 390 and 1280 pixels, light and dark.
  This covers first-run camera/preset selection, actual 33³ camera download with a
  valid short filename, session reload, compatibility blocking/fix, cancellation,
  fresh editor navigation, More-menu consistency and imported-draft resizing.
- New-flow accessibility checks pass. The existing workspace suite continues to
  assess graph controls alongside their numeric equivalents. No new blanket
  accessibility exemptions were added.
- Windows screenshots for camera setup, selected preset, compatibility feedback
  and export guidance were reviewed across the configured width/theme matrix.
  The screenshots include keyboard-focus states; a focused skip link can appear
  in the post-accessibility-scan captures. Evidence is in frontend/test-results/.
- Impeccable's mechanical detector returned no findings. Git diff whitespace check passed.

## Remaining acceptance

The canonical Linux visual gate could not run: Docker Desktop was launched but
its Linux engine exited and the dockerDesktopLinuxEngine pipe was unavailable.
The container visual command failed before running tests. No canonical PNGs were
replaced or accepted. Desktop header captures intentionally gain New LUT; phone
More gains the same action. These changes still require canonical baseline review
and the full Linux gate before deployment. A single clean full-suite rerun is also
still required for that gate; the local results above distinguish sweep and reruns.

No real-phone keyboard/screen-reader test or physical S5IIX loading test was done.
Camera claims come from the manufacturer instructions, not hardware certification.
Python files were unchanged; the standalone Python suite was not rerun.

## Manufacturer evidence

- [LUT Library: supported cubes, recommended range, filenames and loading](https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2X/html/DC-S5M2X_DVQP2992_eng/0072.html)
- [V-Log recording and View Assist](https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2X/html/DC-S5M2X_DVQP2992_eng/0093.html)
- [Photo Style: REAL TIME LUT records with the LUT applied](https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2X/html/DC-S5M2X_DVQP2992_eng/0070.html)
