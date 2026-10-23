# Mobile application direction

Status: implemented navigation refinement; verification is recorded in
`docs/testing/mobile-navigation-2026-10-23.md`. Target: the current workspace on
`codex/workspace-composition-55-56`. Phone use drives the structure.

## Evidence and limits

REA observed the public Notion homepage in an isolated Chromium browser at
390 × 844 with reduced motion. Its header exposes the brand, primary action and
one menu control. Opening the menu presents a focused navigation surface with
labelled destinations. This is marketing-site evidence, not observation of the
signed-in Notion editor. No Notion animation timings were measured.

- Closed-page Evidence: `ev_a860f44f896d7d71211af5637db2f4196c77583b8a050798bea5aa49a3190ec5`.
- Open-menu Evidence: `ev_88f948047ef2d2a6cc50ebedc5ec68b9b89bc89b1ab7b79fb950b4643739fc78`.
- Both temporary browser processes were terminated by the provider. No private
  workspace, account, cookies or storage were supplied. An attempted independent
  research delegation was aborted; findings here come from the main investigation.

Notion's official mobile documentation describes persistent bottom navigation and
contextual editing tools. Apple describes tabs as top-level navigation that
preserves each section's state, advises avoiding overflow tabs, and distinguishes
Back from dismissing a scoped task. Its motion guidance calls for purposeful,
optional, interruptible feedback. These sources support the principles; the
specific LUT Builder structure below is a design recommendation.

Sources checked on 2026-10-23:

- [Notion homepage](https://www.notion.com/)
- [Notion workspaces on mobile](https://www.notion.com/en-us/help/workspaces-on-mobile)
- [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Apple sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [Apple motion](https://developer.apple.com/design/human-interface-guidelines/motion)

Apple's linked Markdown versions were read where the documentation HTML required
JavaScript. Native Apple guidance informs this web design; native points and
platform-specific materials are not web implementation requirements.

## First change: a predictable navigation model

Use four stable, labelled phone destinations, in this order:

| Destination | Content | Local controls |
| --- | --- | --- |
| Presets | Explained starting arrangements, real exposure strips | Apply preset, then open Edit |
| Edit | Persistent exposure preview, band and palette editing | Bands / Palette segmented control; undo beside edits |
| Media | Optional camera media and verification | Pick media, inspect results, recover from errors |
| Settings | Camera, display/output, imported look, warnings, saved setups | Expand grouped settings in place |

Export remains a clearly labelled header action. New LUT and setup management
remain findable in Settings. Help is a labelled secondary action there. Each tab
retains its own scroll position and editing state. Desktop adapts the same names
and grouping to its sidebar and wider preview/editor arrangement.

Tab roots have one page title and no Back button. Settings should show concise
current-value summaries, such as the selected camera or imported filename.
Routine settings expand where selected and keep the user's location on the page.
Remove the More → Configure → task-screen sequence.

For Imported LUT, the Settings group initially shows its status and a Choose file
action. Picking a valid file can open a scoped confirmation sheet for required
input/output interpretation. Confirm applies it; Cancel discards the draft and
returns to the same Settings location. An existing look offers Replace and Remove.
Retain validation, explicit interpretation, cancellation and existing recovery.

Export uses a scoped review surface that returns to the exact editing context.
Use Close or Cancel to dismiss a temporary task; use a destination-labelled Back
only for a genuine child navigation step. Do not stack sheets. Browser Back and
Escape should dismiss the active temporary surface before leaving its parent.
These behaviors must be implemented and tested consistently, not independently
invented by each component.

## Professional mobile finish

- Keep the established neutral editing identity and diagnostic colors. Tighten
  typography, alignment, spacing and control consistency around one shared system.
- Use one heading per screen and one clear primary action per scoped task.
- Design around 320–430 CSS-pixel phone widths, large text, safe areas and the
  on-screen keyboard. Prefer 48 CSS-pixel primary touch targets as our design rule.
- Keep the relevant exposure preview visible during frequent adjustments without
  consuming the space needed by fields or the keyboard. Preserve numeric precision.
- Keep saving, validation, progress and recovery feedback next to the action it
  describes. An empty optional Media tab should explain the benefit without
  interrupting LUT creation.
- Preserve accessible names, keyboard focus, announced statuses and non-color
  indicators. Returning from a task restores focus to its initiating control.

## Motion contract

These timings are proposed for LUT Builder, not reverse-engineered measurements:

- Brief 160–220 ms transitions for a disclosure or scoped sheet, using one shared
  easing rule. A sheet enters and leaves through the same spatial relationship.
- Peer tabs switch immediately or with a restrained fade. Avoid a forward/back
  slide that falsely implies a hierarchy between tabs.
- Graph and slider feedback follows input directly. Do not delay precision edits
  or block input until an animation completes.
- Respect prefers-reduced-motion. Retain clear state changes with immediate
  updates or a simple fade; never rely on movement alone to convey success.

## Implementation order and acceptance

1. Refactor the shared navigation/disclosure behavior and remove redundant headings.
2. Consolidate Bands and Palette under Edit and expose Settings directly.
3. Unify scoped task presentation, dismissal, focus restoration and browser history.
4. Refine spacing and motion after the interaction model works.

Affected contracts include WorkspaceShell, WorkspaceTask, workspaceNavigation,
App panel composition, CSS, imported-look forms and the UI test helpers. Preserve
media and imported drafts across tab changes/resizing, setup recovery, palette
application semantics and generation compatibility checks.

Acceptance: every main destination is one tap away; routine settings need no
separate return trip; closing a task restores context; no duplicate headings;
no horizontal document overflow; keyboard and large-text layouts remain usable;
touch and reduced-motion paths work; existing numerical tests remain unchanged.
Review all width/theme captures, run the canonical Linux screenshot gate, and
perform a real-phone Safari check before claiming production mobile acceptance.

The reference investigation did not include motion measurements, private Notion
app inspection or new hardware testing. Implementation evidence is linked above.
