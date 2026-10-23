# Workspace interaction consistency review

## Implemented

Removed View photo result and Back to band editing. Removed the obsolete delegated
anchor handler. Navigation and screen heading now both say Preview. Added regression
assertions for the canonical destination order and absence of the removed links.
DESIGN.md defines the shared navigation, action, disclosure and icon language.
The Controls manual still described the removed five-tab/More/Back hierarchy;
its navigation instructions were corrected to match the application.

## Findings — implemented in the mobile-first picker refinement

1. **Export's palette recovery link is misleading and ineffective.** App.tsx calls
   a link to `#exposure-bands` “Return to palette preview” inside the modal export
   sheet. It neither selects Palette nor dismisses the sheet. Proposed: an explicit
   “Review palette” action that closes Export and selects the draft, preserving it.
2. **Preview has two upload paths with different meanings.** ReferencePreview's
   “Use your own photo” accepts display images; camera verification asks for source
   interpretation. The distinction matters numerically but users can read them as
   interchangeable. Proposed: clearly labeled “Quick illustration” and “Camera
   verification” sections, with one short explanation before each upload action.
3. **Export vocabulary changes mid-task.** The header and sheet say “Export LUT”,
   but the final action says “Generate LUT”. Proposed: “Download LUT” for the final
   action; “Generating…” remains appropriate progress feedback.
4. **New LUT's dismissal label assumes existing work.** NewLut uses “Continue
   editing” on both first visit and when abandoning a replacement. Proposed:
   “Skip setup” for first visit and “Cancel” when returning to existing work.
5. **Help links have mixed presentation.** Workspace actions have an external-link
   icon and screen-reader new-tab text; inline help mixes “(new tab)” suffixes and
   plain underlined text. Proposed: one shared help-link treatment, with an icon
   and accessible new-tab notice. These remain real links, separate from actions.

This is a source-backed review of the affected workspace and supplied screenshots,
not an exhaustive device audit. Findings 1–5 were subsequently implemented: Review
palette routes to the retained draft; upload sections explain their different
interpretations; Download LUT names the artifact; setup dismissal distinguishes
first use from cancellation; shared HelpLink provides external-link treatment.

## Prevention

Use DESIGN.md as the shared interaction contract. Regression checks cover exact
destination labels, stable Edit switching, no redundant peer-screen links, sheet
dismissal and focus recovery. Review screenshots at phone/desktop widths and both
themes when controls change. Do not claim these checks prevent every future UX
inconsistency; contextual review remains necessary.

Validation: lint, UI TypeScript and production/manual build passed. All 23
affected component tests passed. Navigation matrix: 11 passed initially; one
desktop state-continuity failure during the rebuild passed on a settled rerun
(both desktop-dark cases passed). Full regression, canonical Linux screenshots
and physical-phone acceptance were not repeated for this cleanup.
