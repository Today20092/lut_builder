# Workspace direction contract

Primary target: `frontend/src/App.tsx`; related: `WorkspaceShell.tsx`, `index.css`.
Mode: **Operate**. Build path: code-led (application screen).
Seed: not run; user-pinned Lightroom direction and task layout from issue #55;
workflow deviation. No corroborated seed or unavailable-roll result is claimed.

## Purpose

Create and export a camera-log diagnostic LUT on a phone, with precise editing
and the same workflows available in a spacious desktop workspace.

## Direction

A neutral editing bench. The scale is the artifact; diagnostic colors carry
meaning rather than decorating chrome. Use existing shadcn controls and system
sans typography. Keep the manual's separate `docs/DESIGN.md` intact.

## First viewport

Compact product/header actions, a visible camera → display summary, a large
labeled exposure scale, and selected-band editing directly beneath it on phone.
Desktop has a task navigation rail, a wide preview stage and an adjustment column.
No dashboard, decorative metrics or mandatory media import.

## Visitor path and signature interaction

Select a band on the scale or its numbered swatch, then adjust its color, position
and width without losing the preview. Expand/collapse phone adjustments to inspect
the scale. Configuration, presets, files, media and export are explicit panels
that return to the same band selection. Escape returns to editing and restores
the opening control's focus; native popovers/dialogs keep their own Escape first.

## States and constraints

Retain draft/invalid/loading/cancellation/undo feedback and all existing editing
and verification behavior. Session recovery uses validated setup data and leaves
unreadable storage untouched until an explicit recovery action. Media must be
reselected. Numeric entry and reachable actions remain available with a keyboard.

## Quality bar and risk

Lightroom supplies hierarchy and restraint, shadcn supplies familiar controls.
Review 320/390/1280px in light/dark themes, keyboard and invalid states, safe-area
padding and narrow-screen overflow. No real-phone claim follows from emulation.
The principal risk is hiding a workflow behind new navigation; every existing
feature must remain discoverable and tests must navigate the new panels.
