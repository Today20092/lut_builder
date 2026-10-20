# A consistent mobile editing workspace

Date: 2026-10-20  
Status: primary-source research; shared controls and interaction rules implemented on the workspace branch, with acceptance checks recorded separately.

## Recommendation

Keep the chosen shadcn Rhea/Roboto system and Lightroom direction. Improve the
interaction system across every destination: one navigation-row recipe, one field
recipe, one action hierarchy, one icon vocabulary, and one feedback policy.
A different component theme alone cannot enforce those relationships. This is a
design judgment for the workflows in [PRODUCT.md](../../PRODUCT.md) and
[DESIGN.md](../../DESIGN.md).

The supplied phone screenshots show three concrete defects: inconsistent More
destinations, excessively verbose external-link labels, and preset success text
that changes page height. The current DESIGN.md already records matching More
rows and transient preset feedback; implementation and tests should enforce that
contract throughout the app, including less-frequently used screens.

## References to inspect

| Reference | What it provides | What to take for LUT Builder |
| --- | --- | --- |
| [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Guidance for labeled, persistent top-level navigation. | Stable Bands, Palette, Presets, Media and More destinations. Keep Export as an action outside navigation. |
| [Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | Button hierarchy, clear labels, familiar symbols and touch regions. | Equal heights within a set; distinguish importance through treatment; pair unfamiliar actions with text. |
| [Cloudflare Kumo components](https://kumo-ui.com/components/button/) and [source](https://github.com/cloudflare/kumo) | Public component examples, variants and implementation source. | Consistent action surfaces and navigation links; study recipes without adding a second component library. |
| [Stripe app design](https://docs.stripe.com/stripe-apps/design) and [patterns](https://docs.stripe.com/stripe-apps/patterns) | Shared components composed into repeatable contextual workflows. | Reuse page and task patterns across the whole tool; preserve context while editing. Stripe Apps is a different host environment, so its APIs are not an implementation dependency here. |
| [Lightroom mobile light editing](https://helpx.adobe.com/lightroom/mobile/adjust-light-and-color/adjust-light-in-photos.html) | Task-specific editing panel and tonal controls. | Keep the exposure artifact alongside relevant adjustments; show a graph only when it helps that task. |
| [Penpot interface tour](https://help.penpot.app/user-guide/first-steps/the-interface/), [UI guide](https://help.penpot.app/technical-guide/developer/ui/) and [source](https://github.com/penpot/penpot) | Open-source editing-workspace structure and shared UI guidance. | Inspect reusable editor controls and common surface rules. It is a desktop-workspace reference, not evidence of a suitable phone layout. |
| [shadcn Field](https://ui.shadcn.com/docs/components/base/field) and [Toast](https://ui.shadcn.com/docs/components/base/toast) | Existing-stack composition examples. | Adopt the existing base primitives consistently rather than making screen-specific imitations. |

Apple, Stripe and Adobe are references for interaction design, not claims that
their application source is open source. Cloudflare Kumo and Penpot provide code
that can be inspected. These are selected references with different strengths;
this research does not establish an objective ranking of the “best” apps.

## Practical rules and application mapping

### 1. Navigation has one visual grammar

Apple separates tab navigation from actions, recommends labels, and keeps tabs
available across sections. Adapt that to a stable five-item phone navigation bar
and the existing desktop rail. Preserve the selected task and unfinished values
when switching destinations. [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars).

More should use the same row height, icon slot, label alignment, spacing, focus
ring and hover/pressed treatment for Configure, Setups, Help / Manual and Report
an issue. Use a trailing chevron for an internal task and an external-link symbol
for a new tab. Link semantics and button semantics can differ while their visual
recipe remains consistent: Cloudflare explicitly supports button-styled links
for navigation and buttons for in-place actions.
[Kumo Button](https://kumo-ui.com/components/button/).

Application decision: display short labels. Put “opens in a new tab” in the
accessible name and optional tooltip rather than repeating it as a long sentence
inside the row. Keep an actual anchor with its URL for external destinations.

### 2. Icons reinforce meaning

Apple recommends familiar symbols for familiar actions, with text when that
communicates more clearly. Use one installed icon family, one stroke treatment
and a shared slot size. Primary destinations and menu rows retain visible labels;
utility buttons such as Undo, Help, Back, Import and Export get the same icon each
time they appear. Do not add icons to every field or explanatory paragraph.
[Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons).

Application decision: decorative SVGs are hidden from assistive technology;
icon-only controls have a visible focus state and an accessible action name.
Preset thumbnails, exposure colors and selection indicators are domain content,
not replacements for navigation icons.

### 3. Feedback follows the event

Use a toast for a completed reversible action: “Standard Fill applied” with Undo
when that recovery is available. Keep focus on the initiating control and avoid
moving the surrounding preset list. Base UI documents a shared toast viewport,
keyboard navigation and an Undo action example.
[Base UI Toast](https://base-ui.com/react/components/toast).

A tooltip explains a control on hover or keyboard focus; it is not the primary
way to report success on a touch screen.
[shadcn Tooltip](https://ui.shadcn.com/docs/components/base/tooltip).
Provide touch-accessible help through a labeled information button opening a
popover or task screen when explanation is needed.

Success notices should be announced without taking focus. Field errors stay by
the field until corrected; failures that block export or verification retain a
visible recovery action. Keep permanent Undo in Bands even after a toast closes.
This also avoids making recovery depend on reading a timed message. Apple warns
about time-limited interfaces, and WCAG describes programmatic status messages.
[Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

### 4. Forms use repeatable groups, not isolated styling

Use the existing FieldGroup, Field, FieldLabel, FieldDescription and FieldError
recipes, including their validation association. Related radio choices belong in
a labeled fieldset. Use one control-height rule and one label/description spacing
rule across Configure, Setups, imported LUT interpretation and Export.
[shadcn Field](https://ui.shadcn.com/docs/components/base/field).

Stripe recommends composing established patterns to produce consistent, clear
workflows. Apply this by making every occasional task use the same header, Back
action, concise introduction, form grouping and completion feedback.
[Stripe patterns](https://docs.stripe.com/stripe-apps/patterns).
The graph belongs with Bands editing; it does not belong above filenames, cube
size, camera interpretation, saved setups or the help menu. This placement is an
application decision based on the approved phone workflow, not a Stripe rule.

### 5. Hierarchy and density are deliberate

Use one page title, compact section labels, readable descriptions and deliberate
gaps between groups. Avoid repeating the same heading at page, card and
disclosure levels. Within a tab, show its main content directly; use a separate
task for infrequent advanced settings. Maintain one visually prominent action per
task, with secondary actions using secondary treatment. Apple recommends style
rather than inconsistent sizes to distinguish preferred options.
[Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons).

Application decision: preserve neutral chrome so exposure colors remain readable.
Use visible Stops, IRE and Fill labels, exact numeric values and selected-band
indicators alongside colors. Apple advises conveying information through more
than color alone.
[Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

### 6. Touch and keyboard are both first-class

Keep the project's 48 CSS-pixel mobile control target and 16 CSS-pixel input text
rules. Apple's button guidance recommends a 44-point hit region; native points
and CSS pixels are different measurement contexts. WCAG 2.2's AA target-size
criterion uses 24 CSS pixels with stated exceptions; do not mistake that minimum
for the preferred comfort target of this application.
[Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Graph dragging must retain numeric entry or another single-pointer alternative.
Vertical swipes should scroll the phone page, without accidentally dragging a
band. [WCAG dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
Verify readable reflow at 320 CSS pixels and text enlargement; fixed headers,
toasts and bottom navigation must not hide the focused field or final action.
[WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
Hover help should be dismissible, hoverable and persistent when its criteria
apply. [WCAG hover/focus content](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

## Procedure for this application

1. Inventory Bands, Palette, Presets, Media, More, Configure, Setups and Export,
   including imported LUT, empty, busy, success, invalid and restored-session
   states. Record the shared pattern each control should use before editing it.
2. Fix shared recipes first: menu row, task header, field group, action treatment,
   icon slot, tooltip/popover help and toast. Then remove conflicting one-off CSS.
3. Walk one complete phone workflow: choose interpretation; apply a preset; edit
   exposure/color; undo; verify media; save/import setup; export. Repeat recovery
   from invalid inputs and interrupted media access.
4. Review 320, 390 and 430 pixel phones in both themes, landscape, a visible
   keyboard and enlarged text; also verify desktop. These sizes are this
   project's review matrix, not requirements from the reference brands.
5. Check roles/names, focus return, Escape, screen-reader announcements, contrast,
   hit targets and content overlap. Kumo's guidance explicitly notes that library
   focus management still needs visible focus styling and accessible names from
   application code. [Kumo accessibility](https://kumo-ui.com/accessibility/).
6. Accept screenshot baselines only after reviewing composition and completing
   the task flow. A passing snapshot protects a reviewed design; it does not
   determine whether that design is usable.

Priority: first unify navigation, feedback and repeated controls; then reduce
duplicate copy and improve form grouping; then refine motion and decoration.
Retain the current preset and product behavior throughout.

## Limits

This document reviews official published guidance and the supplied screenshots;
it is not a usability study or a physical-phone test. Stripe's connector required
reauthentication and its CLI was unavailable, so public first-party documentation
was used. Product-authenticated dashboards were not inspected. No dependency,
application source, user state or screenshot baseline was changed by this research.
