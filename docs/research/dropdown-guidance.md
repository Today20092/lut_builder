# Choosing visible controls and progressive disclosure

Date: 2026-10-23  
Status: primary-source research and recommendations; no interface changes.

## Finding

Avoid unnecessary hidden choices, rather than banning every control that opens.
The screenshot's **Band setup & graph settings** is a disclosure (it reveals a
section). Select dropdowns choose a value; menus for actions are a third pattern.
They need separate decisions. The pictured **Coverage** field is actually
read-only explanatory text in the current source, not a selector. Its input-like
styling is a separate opportunity: show “Until next boundary” as supporting text
instead of making it resemble an editable field.

## What the sources say

| Source | Guidance and limits |
| --- | --- |
| [Apple: disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls) | Keep the most-used controls visible; disclose advanced details when relevant. Give the disclosure a label describing its content and place it near that content. This supports hiding secondary features, not routinely used editing controls. |
| [GOV.UK: accordions](https://design-system.service.gov.uk/components/accordion/) | Do not hide content everyone needs. Test structured content with plain headings first. Use accordions when evidence supports selectively revealing related sections; avoid nested accordions. This is guidance for public services, so apply the principle with judgment to an editing workspace. |
| [NN/g: dropdown lists](https://www.nngroup.com/articles/dropdown-list/) | Dropdowns hide alternatives and add an opening interaction. Prefer exposed radio choices when the small set fits comfortably. Very long lists can warrant searchable selection. The article explicitly notes differing numerical cutoffs across design systems: there is no universal option-count standard. |
| [Apple: pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons) | A compact menu remains appropriate for a flat, mutually exclusive selection when space is limited and all alternatives need not stay visible. Show a useful default/current choice and a label that predicts the options. Actions belong to a different menu pattern. |
| [Apple: segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) | Use grouped segments for closely related choices affecting an object, state or view, especially when the current selection should be obvious. Too many segments become difficult to parse; mobile width and label length matter. |
| [NN/g: mobile accordions](https://www.nngroup.com/articles/mobile-accordions/) | Accordions can provide a useful overview and save space on phones. They can also disorient people and increase scrolling. This is a tradeoff, not evidence that every mobile section should collapse. |
| [Refactoring UI: official book overview](https://refactoringui.com/) | The published contents emphasize hierarchy, de-emphasis and spacing. These support organizing visible controls with visual hierarchy; they do not establish a dropdown-specific rule. The paid book was not inspected. Its [public labels excerpt](https://refactoringui.com/previews/labels-are-a-last-resort) explicitly excludes forms, so it must not be used to justify removing field labels. |
| [Notion: headings and toggles](https://www.notion.com/help/columns-headings-and-dividers) | Notion provides ordinary headings, collapsible headings and a table of contents. This documents alternative organization tools, not comparative evidence that hiding controls improves usability. |

## Recommended policy for LUT Builder

These are design judgments derived from the guidance, not measured findings about
LUT Builder's users:

1. Keep normal editing controls visible under short, specific headings. The
   screenshot's combined band/graph disclosure is a priority to review: separate
   everyday band editing from optional graph configuration.
2. Prefer a short radio group or segmented control for small, frequently changed
   selections. Use vertical radios when labels cannot fit comfortably on a phone.
3. Retain compact selection for longer, familiar lists; consider search only when
   list length and actual lookup needs justify it.
4. Hide only secondary settings and supplemental explanations. Avoid nesting
   hidden controls inside hidden sections.
5. Remove interactive controls for values that cannot actually change; present
   their value or explanation as text instead.
6. Audit each control by task frequency, option visibility, label length and
   mobile fit. Check keyboard and screen-reader access, focus, and selected or
   expanded state when replacing a pattern. Review representative editing tasks
   on both phone and desktop before applying the policy across the site.

## Scope and uncertainty

The following recommendations combine the supplied screenshot with the parent
agent's source audit. They are proposals for review, not implemented changes.

| Area found in source | Recommendation |
| --- | --- |
| Band setup and graph settings | Split the mixed disclosure. Show common width editing in the normal Edit flow. Put arrangement replacement with Presets, reusing the existing workflow rather than repeating it in Edit; preserve explicit Apply/Use and undo behavior. Expose the three drag-step choices when relevant. Keep graph preferences secondary and near the graph; consider bounded numeric range entry instead of the 20-item range selector. |
| Palette blend and hue choices | Expose the two alternatives in each group, using short segments or radios. |
| Palette intensity on touch devices | Replace the 0–200 select list with a bounded numeric control, optionally paired with a slider for exploration. Preserve precise entry and validation. |
| Color model, cube size and preset mode | Review the two, three and two choices respectively for visible selection. Prefer readable vertical choices when phone labels would crowd a segmented row. |
| Export destination | Show the four destinations with radio choices and their explanations, so users can compare the consequences before choosing. |
| Gradient selected color | Up to 32 choices justify retaining a compact picker; consider visible swatches where they aid recognition without crowding the editor. |
| Camera/log profile and display color space | Keep compact selectors for lists whose alternatives do not need continuous comparison. Add search only if the real list makes finding a known profile difficult. Use the same pattern in first-run setup and Settings. |
| Media interpretation confirmation | Review small range/chroma selections for visible radios, but keep unknown/unconfirmed states and explicit confirmation. A metadata suggestion is not proof; do not simplify away this distinction. Long transfer/gamut lists can stay compact. |
| Saved setups | Make saved setup loading directly discoverable rather than nesting the optional Load setup disclosure inside Saved setups. |
| Media and imported looks | Keep provenance, help and custom filename details optional. Keep an active imported LUT's summary and Remove action visible. |
| Advanced palette controls | Retain disclosure for secondary adjustments; make any important active effect visible in the summary. |
| Manual | No authored select/disclosure controls were found in `frontend/manual/src`; framework navigation was excluded from this source scan. |

For mobile, stack visible choices when needed instead of introducing horizontally
scrolling choice chips. Follow the project's 48px phone target convention; this
is a project implementation constraint, not a universal dropdown cutoff. For
quantities, keep exact numeric entry and existing increment/decrement controls
where appropriate.

## Suggested implementation sequence

1. Start with the pictured Edit section: separate band editing and graph options,
   and expose the small, frequently used choices.
2. Apply the same decision rule to palette, settings, saved setups and export.
   Keep longer selectors and useful secondary disclosures.
3. Validate complete tasks: change a band, adjust palette, load a setup, inspect
   an imported look and export. Check state persistence, exact numeric entry,
   keyboard focus, screen-reader semantics and touch targets. Review screenshots
   at the repository's configured widths and themes, then run its frontend and UI
   quality checks. User observation is still needed to confirm that the changes
   improve discoverability without excessive scrolling.

No application code or screenshots were changed. Review covered the screenshot
and application source, not deployed-site runtime or interactive usability tests.
The screenshot shows unused vertical space, but its cause was not diagnosed in a
running browser. This note does not claim an objective ranking of designers or
products or access to the full Refactoring UI book. Exposing every setting could
create excessive mobile scrolling; retain disclosure where the secondary content
actually warrants it.
