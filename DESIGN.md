---
name: LUT Builder Workspace
description: A neutral editing bench for precise diagnostic exposure LUTs.
colors:
  background: "oklch(0.975 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.48 0 0)"
  border: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  sidebar: "oklch(0.985 0 0)"
  preview-middle-grey: "oklch(0.55 0 0)"
  dark-background: "oklch(0.17 0 0)"
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
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    lineHeight: "1.25rem"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    lineHeight: "1rem"
  compact:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
  phone-input:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
rounded:
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
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
    rounded: "{rounded.lg}"
    height: "2.25rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2.25rem"
    padding: "0 0.625rem"
  field:
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.75rem"
  navigation:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    height: "4rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
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

The workspace fills at least the small viewport height, caps at 112rem, and uses
safe-area padding. At 960px and above, its grid is a 7rem task rail, a flexible
preview stage, and a 24–29rem adjustment column. Stage padding is 2rem vertically
and `clamp(1rem, 2vw, 2.5rem)` horizontally.

Below 960px, five fixed bottom destinations provide Bands, Palette, Presets,
Media and More. More opens Configure and Setups; Export LUT remains in the top
header. The content reserves `calc(5.5rem + env(safe-area-inset-bottom))` below
its flow, and navigation adds safe-area padding around its five equal columns.

The phone stage scrolls with the page. Bands keeps its editable graph and selected
band controls together; Palette retains a compact exposure preview without the
graph or band picker. Other destinations and dedicated tasks hide the stage.
Imported-look phone previews show their comparison in place of the editable graph.
Only the selected band appears in the phone band editor. Swatch, hexadecimal color,
position and width stay directly available. Band/graph settings, creative LUT
import, recorded-signal warnings and saved palettes open dedicated screens with a
Back action. Main destination content opens directly without a Collapse action.

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

Small rounded controls and softly rounded previews sit within straight workspace
dividers. Shared fields use md, buttons use lg, and standalone shared cards use xl.
The phone adjustment surface uses straight edges. Numbered band buttons
contain small bordered color swatches; colors retain their actual artifact values.

## Components

### Buttons

Primary actions use the high-contrast primary pair. Outline actions use a visible
border; secondary and ghost controls use muted hover surfaces. Shared buttons
carry focus rings, disabled opacity and invalid-state treatment. Phone target
overrides apply to these shared primitives.

### Inputs / Fields

Fields use a transparent background, input stroke and compact horizontal padding.
Focus strengthens the border and adds a ring. Invalid drafts remain visible with
error feedback; disabled controls reduce opacity. Import interpretation fields
use background fill and a 44px minimum height.

### Navigation

Labeled SVG icons stack above task labels. Active tasks gain a muted surface,
foreground text, weight 650 and an inset border outline. Hover changes color and
background over 160ms ease-out; reduced motion removes that transition. Desktop
navigation is vertical; phone navigation uses the five fixed bottom destinations.
Configure and Setups open from More, and Export stays in the header.

### Cards / Containers

Shared cards group content with spacing and a subtle ring. Workspace top-level
panels flatten those cards into the adjustment column. Native disclosures collect
infrequent settings on desktop and keep their full padded summary clickable. On
phone, dedicated task screens provide a Back action; main destination sections
show their content directly.

### Exposure selection and comparison

The labeled stop scale, selected graph handle and numbered color swatches connect
the artifact to its editor. Imported comparison labels distinguish camera exposure
reference, look, and look plus diagnostics. Optional photo illustration remains a
disclosure. Selection, units and comparison labels carry meaning alongside color.

## Do's and Don'ts

### Do:
- **Do** keep diagnostic colors in the artifact and its editing controls.
- **Do** retain labeled units, exact input values and visible selection.
- **Do** preserve focus visibility, touch targets and reduced-motion behavior.

### Don't:
- **Don't** require media import before editing the exposure scale.
- **Don't** replace the labeled exposure scale with a decorative grayscale ramp.
- **Don't** treat illustration or emulated screenshots as calibrated display evidence.
