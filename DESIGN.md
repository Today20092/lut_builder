---
name: LUT Builder Workspace
description: A neutral editing bench for precise diagnostic exposure LUTs.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.53 0 0)"
  border: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  sidebar: "oklch(0.985 0 0)"
  preview-middle-grey: "oklch(0.55 0 0)"
  dark-background: "oklch(0.145 0 0)"
  dark-foreground: "oklch(0.985 0 0)"
  dark-card: "oklch(0.205 0 0)"
  dark-primary: "oklch(0.922 0 0)"
  dark-primary-foreground: "oklch(0.205 0 0)"
  dark-muted: "oklch(0.269 0 0)"
  dark-muted-foreground: "oklch(0.708 0 0)"
  dark-border: "oklch(1 0 0 / 10%)"
  dark-input: "oklch(1 0 0 / 15%)"
  dark-ring: "oklch(0.556 0 0)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
typography:
  title:
    fontFamily: "Roboto Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Roboto Variable, sans-serif"
    fontSize: "0.875rem"
    lineHeight: "1.25rem"
  label:
    fontFamily: "Roboto Variable, sans-serif"
    fontSize: "0.75rem"
    lineHeight: "1rem"
  compact:
    fontFamily: "Roboto Variable, sans-serif"
    fontSize: "0.6875rem"
  phone-input:
    fontFamily: "Roboto Variable, sans-serif"
    fontSize: "1rem"
rounded:
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  3xl: "1.375rem"
  preview: "0.375rem"
  phone-adjustments: "0.75rem 0.75rem 0 0"
spacing:
  compact: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  panel: "1.25rem"
  section: "1.5rem"
  stage: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "1.125rem"
    height: "2rem"
    padding: "0 0.75rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "1.125rem"
    height: "2rem"
    padding: "0 0.75rem"
  field:
    rounded: "{rounded.2xl}"
    height: "2.5rem"
    padding: "0 0.625rem"
  navigation:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    height: "4rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.3xl}"
    padding: "1rem"
---

# Design System: LUT Builder Workspace

## Overview

**Creative North Star: "A neutral editing bench"**

The workspace applies the user's Lightroom direction through restrained neutral
surfaces, a prominent exposure scale and precise controls. Diagnostic colors are
the artifact being edited. System sans typography keeps the surrounding tool quiet.

This is the browser workspace system, extracted from `frontend/src/index.css`,
`WorkspaceShell.tsx`, the shared button/card components and the fields in `App.tsx`.
The manual has its own contract in `docs/DESIGN.md`. This records the shipped
implementation; it does not establish seed-process compliance. The direction
contract discloses that the seed was not run.

**Key Characteristics:**
- Neutral light and dark chrome.
- A visible labeled exposure preview beside or above precise editing.
- Compact task navigation and optional media.
- Numeric entry, selection and recovery feedback remain explicit.

## Colors

Achromatic chrome gives diagnostic colors room to communicate exposure.

### Primary

Primary and primary-foreground create the high-contrast action pair. The pair
reverses in dark mode, selected through `prefers-color-scheme`.

### Neutral

Background is the stage; card is the adjustment surface; sidebar supports task
navigation. Muted surfaces mark hover and selection. Muted-foreground carries
supporting information, while foreground carries actionable text and focus outlines.
Border separates regions; dark inputs use a stronger stroke than dark dividers.
Preview-middle-grey belongs to the preview rather than general chrome.

Destructive is reserved for error/destructive states. Band colors, palette colors
and comparison tiles remain editable domain data, not brand tokens.

**The Artifact Color Rule.** Keep diagnostic colors in the exposure artifact and its editing controls; use neutral chrome around them.

## Typography

System sans serves headings, navigation and prose; there is no display face.
The brand uses the title role. Standard control/body text uses the body role;
metadata and navigation use label or compact text. Panel headings use body size
with weight 650. Phone inputs increase to the phone-input role. Hexadecimal color
entry uses monospace, and the workspace applies tabular numerals.

**The Precision Rule.** Keep exact values readable and editable through numeric or text fields alongside graphical controls.

## Layout

Mobile is the primary interaction target, not a reduced desktop layout. Design
and review at 320px and 390px before expanding to desktop. Keep touch controls at
least 44px, phone text inputs at 16px, and scrolling available with the keyboard
open. Color editing uses a modal bottom panel on phones, with OKLCH channel
sliders, numeric entry and explicit Done; HSV and Tailwind presets remain options.
Reuse the existing gamut mapping and save displayable sRGB HEX. Field labels and
read-only values share the editable field grid. Desktop adds space, not a second
interaction vocabulary or different task semantics.
Changing slider values must not resize their editing panel or move its controls.
Reserve space for the longest dynamic status message instead of clipping warnings;
test both normal and warning states at phone widths and in both themes.

The workspace fills at least the small viewport height, caps at 112rem, and uses
safe-area padding. At 960px and above, its grid is a 7rem task rail, a flexible
preview stage, and a 24–29rem adjustment column. Stage padding is 2rem vertically
and `clamp(1rem, 2vw, 2.5rem)` horizontally.

Four destinations provide Presets, Edit, Preview and Settings at every width.
Below 960px they form a fixed bottom navigation with safe-area padding. Edit
contains a Bands / Palette switch; Export LUT opens a sheet from the top header.
Content reserves `calc(5.5rem + env(safe-area-inset-bottom))` below its flow.

The phone stage scrolls with the page. Bands keeps its editable graph and selected
band controls together; Palette retains a compact exposure preview without the
graph or band picker. Other destinations and dedicated tasks hide the stage.
Imported-look phone previews show their comparison in place of the editable graph.
Only the selected band appears in the phone band editor. Swatch, hexadecimal color,
position and width stay directly available. Band modes, shared widths and movement
increments remain visible. Graph view, recorded-signal warnings and saved palettes
expand inline; imported looks and saved setup loading stay directly available.
Main destinations have no Back action. Import confirmation and export use shared
modal sheets with a visible Close action, Escape and browser Back dismissal.

Primary phone panel fields and buttons use a 3rem (48px) minimum height; bottom
navigation buttons use 3.625rem. Phone fields use 1rem (16px) text. Some compact
controls retain their 44px minimum. Preserve safe-area and focus-scroll clearance
when adding controls.

**The Preview and Edit Rule.** Keep the graph and selected-band editing together in Bands on phone, and keep the preview beside editing on desktop. Palette uses its compact exposure preview.

## Elevation & Depth

Tonal surfaces and fine dividers provide the workspace structure. The stage and
top-level panel cards explicitly remove shadows, rounded card framing and outer
borders. Standalone shared cards use a subtle foreground ring; controls use focus
rings. Slider thumbs retain contrasting white/dark outlines for visibility over
the color track. Floating controls may retain their shared component elevation.

## Shapes

Rounded controls and softly rounded previews sit within straight workspace
dividers. Shared fields and buttons use Rhea's 2xl radius; standalone shared cards use 3xl.
The phone adjustment surface uses straight edges. Numbered band buttons
contain small bordered color swatches; colors retain their actual artifact values.

## Components

### Interaction language — required for workspace changes

- Destination names are Presets, Edit, Preview, Settings, in that order at every
  width. Screen headings use the same names. Media is content within Preview.
- Peer destinations use the persistent navigation only. Do not add inline
  “view result”, “return”, or “back” links between them. Back is reserved for a
  real nested screen; sheets use Close and restore their opening context.
- Use shared shadcn controls: Button for actions, ToggleGroup for local modes,
  FieldGroup/Field for forms. Keep native links for documentation and external
  resources. Icon-only actions require an accessible name; destination labels
  stay visible. Do not replace a redundant link with a redundant icon.
- Keep one primary action per task. Use verb + object labels. Close dismisses a
  view, Cancel stops unfinished work, Remove deletes an item; do not interchange
  these meanings. Downloads should name the artifact and keep consistent wording.
- Keep core settings visible. Disclosures contain optional or advanced controls,
  not a second navigation hierarchy. Align section spacing and control heights
  with existing tokens and components, rather than adding local CSS exceptions.
- A UI change must check this contract, existing callers and destination names,
  keyboard/focus recovery, narrow/large-text layouts and both themes. Extend
  `frontend/tests/ui/navigation.spec.ts` when changing the navigation contract.
  Passing tests supplement rendered review; they cannot guarantee consistency.

### Buttons

Primary actions use the high-contrast primary pair. Outline actions use a visible
border; secondary and ghost controls use muted hover surfaces. Shared buttons
carry focus rings, disabled opacity and invalid-state treatment. Phone target
overrides apply to these shared primitives.

### Inputs / Fields

Text and number fields use the shared shadcn Input. Short exclusive choices use
ChoiceField with the shared ToggleGroup; longer lists use NativeSelect.
Both use the Rhea input surface and focus treatment. Layout classes belong on the
select wrapper, which has no second border. Controls are at least 40px high on
desktop and 48px on phones. Invalid drafts remain visible with error feedback;
disabled controls reduce opacity. Contextual help opens on tap or keyboard and
returns focus when dismissed. Labels stay visible outside the help popup.

### Navigation

Labeled SVG icons stack above task labels. Active tasks gain a muted surface,
foreground text, weight 650 and an inset border outline. Hover changes color and
background over 160ms ease-out; reduced motion removes that transition. Desktop
navigation is vertical; phone navigation uses the same four fixed destinations.
Settings contains camera/output settings, imported looks and saved setups.

### Cards / Containers

Shared cards group content with spacing and a subtle ring. Workspace top-level
panels flatten those cards into the adjustment column. Native disclosures collect
infrequent settings at every width and keep their full padded summary clickable.
Destination sections show their content directly. Modal sheets restore focus and
scroll to their opening context when dismissed.

### Exposure selection and comparison

Mobile Presets uses three visible sections: IRE, Fill and Stops. Each preset has
a named, scaled exposure-strip preview and a trailing Use button with at least a
48px touch target. The preview uses the same setup function as Apply; camera-log
IRE previews follow the selected camera. Mode choices show illustrative strips
alongside their labels on phones as well as desktop.
Standard and Detailed choices reuse the existing arrangements. Apply feedback
uses a temporary shadcn toast above mobile navigation; Bands provides editing and
undo. Desktop uses the same visible, explained preset browser.

Settings includes Saved setups and workspace actions: New LUT, Help / Manual
and Report an issue. External destinations retain link semantics, show an
external-link icon, and explain the new tab in their accessible name.

Routine autosave and setup-restoration details belong in Settings → Saved setups, including
Restore previous setup. Editing screens do not repeat that footer. Storage
failures retain visible recovery controls where they occur.

Task headers pair a Lucide icon with a concise title and purpose. Action icons
come from that same family and supplement visible labels; decorative icons are
hidden from assistive technology. Palette and imported-look comparison choices
use the shared ToggleGroup, preserving their existing state and undo behavior.
See [mobile UI research](docs/research/mobile-workspace-ui.md) for the Apple,
Cloudflare, Stripe and Lightroom references behind these interaction rules.

The labeled stop scale, selected graph handle and numbered color swatches connect
the artifact to its editor. Imported comparison labels distinguish camera exposure
reference, look, and look plus diagnostics. Optional photo illustration remains a
disclosure. Selection, units and comparison labels carry meaning alongside color.

## New LUT and export workflow

New visitors enter a two-step, full-page setup: camera/log and display color space,
then an explained exposure preset with a real band-strip preview. The same neutral
surfaces, Roboto typography and shared controls carry this flow. Steps announce
their heading to keyboard and screen-reader users. Continue editing skips setup;
New LUT is available in the desktop header and Settings. Valid saved work
resumes immediately. Starting a new LUT retains the existing setup for recovery.

Export presents destinations as explained radio choices and keeps compatibility feedback visible, with
loading instructions in a disclosure that opens after a successful download.
The S5IIX option requires Panasonic V-Log input, at most 33³ and full range. It
links Panasonic's instructions and distinguishes V-Log View Assist monitoring
from recording diagnostic colors with REAL TIME LUT. Generic monitor and editor
guidance keeps device-specific compatibility the user's explicit responsibility.

## Do's and Don'ts

### Do:
- **Do** keep diagnostic colors in the artifact and its editing controls.
- **Do** retain labeled units, exact input values and visible selection.
- **Do** preserve focus visibility, touch targets and reduced-motion behavior.

### Don't:
- **Don't** require media import before editing the exposure scale.
- **Don't** replace the labeled exposure scale with a decorative grayscale ramp.
- **Don't** treat illustration or emulated screenshots as calibrated display evidence.
