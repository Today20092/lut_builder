# Mobile workspace redesign (#55)

## Implementation

`WorkspaceShell.tsx` owns task navigation and responsive layout. Base UI Tabs
keeps inactive panels mounted, so switching between bands, palette, presets,
configuration, media, setups and export preserves local drafts and file selection.
The desktop has a navigation rail, exposure stage and adjustment column; phones
have a visible stage above expandable adjustments. Selecting a numbered band
returns to editing and exposes its single set of numeric/color fields. The
existing graph, warnings, band transitions and verification modules are retained.

Configuration retains camera/display interpretation, 17/33/65 cube sizes,
monochrome, range conventions, filename and signal warnings. Exposure presets and
setup files have separate panels. Optional illustration and original-camera media
remain distinct: an illustration does not verify camera exposure.

Current-session persistence extends `setupPresets.ts`, using the same validated
portable `exportSetup`/`importSetup` contract as explicit setup files. It stores the
last valid setup in `lut-builder.workspace-session.v1`; existing named setups and
palettes keep their keys. Corrupt/outdated data is left untouched until the user
downloads a backup or explicitly chooses replacement. Quota/unavailable-storage
failures recommend setup-file export and offer retry. Restore explains that media
must be reselected. Selection, open panels and unapplied palette drafts are
transient; committed setup settings are restored. Autosave reports completion
after validation; users should export a setup file for a durable backup.

## Verification at source handoff

- Locked frontend install completed. Lint, TypeScript, production/manual build and
  the 95-test frontend suite passed before the final panel-aware acceptance-script
  migration; rerun integrated checks after merging #56.
- Session tests observed red before implementing the storage boundary, then pass
  for setup round trip, malformed/outdated preservation and quota errors.
- The public App test observed red for missing section tabs, then passed for
  navigation, Escape return and browser generation without backend requests.
- Native Chromium provisional screenshots were inspected at 390 and 1280 pixels;
  no document horizontal overflow. Impeccable detector returned no findings.
- The revised native layout/accessibility suite tests all seven panels, expanded
  and invalid states, selected mobile fields, numeric input, presets, palette
  persistence, session recovery and actual download. The spatial-control target
  exception now exercises the full-size band selector and the selected numeric
  field for every graph operation, rather than assuming hidden fields are usable.
- The Pages and connected local browser scripts now navigate panels explicitly;
  the local script retains its keyboard-only and real-media provenance checks.

## Remaining integrated gates

Root integration must mount #56 settings in Configure and its actual serialized
comparison next to the exposure stage, disable conflicting ordinary interpretation
controls while an imported look is confirmed, regenerate assets once, rerun all
native checks and browser acceptance, and review canonical Linux screenshots at
320/390/1280 pixels in both themes. Every screenshot baseline changes intentionally
because navigation, preview placement and editing-panel geometry replace the old
single-column layout; configuration/expanded configuration/palette/gradient/invalid
gradient captures must open their corresponding panel first. Do not relax pixel
tolerances. Docker's Linux daemon was unavailable locally, so the coordinator is
using the existing UI-quality CI workflow for canonical Linux evidence. Fresh
Impeccable finish review and design documentation remain integration gates.

No physical phone, iOS keyboard, browser storage eviction or calibrated monitor
claim is made. Reduced-height Chromium emulation is evidence about reachable
fields, not a substitute for those device checks.
