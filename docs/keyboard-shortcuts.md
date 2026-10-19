# Workbench keyboard shortcuts

The local workspace and browser build share these controls. Open the visible
**Keyboard shortcuts (?)** button or press `?` outside a field for help.

| Focus | Keys | Action |
| --- | --- | --- |
| Any control | Tab / Shift+Tab | Move forward / backward between controls. |
| Button or disclosure | Enter / Space | Activate the control using its native behavior. |
| Graph center or boundary | Arrow keys | Move by the selected movement increment. |
| Graph edge | Arrow keys | Resize that edge by 0.1 half-width units. |
| Graph edit control | Shift+Arrow | Adjust by ten normal steps. |
| Graph | Alt+Left / Alt+Right | Select and focus the previous / next band, clamped at either end. |
| Graph | Delete / Backspace | Remove the selected band immediately, then focus the nearest remaining band. |
| Outside fields and open popups | Ctrl+Z / Cmd+Z | Undo the most recent band edit, including its prior selection. |
| Band number field | Enter / Escape | Commit / discard the draft. Blur also commits valid input. |
| Band number field | Up / Down, with optional Shift | Adjust by one / ten steps. |
| Gradient dot | Arrows, Shift+Arrows, Home / End | Move within its allowed range. The exposure reference stop remains fixed. |
| Image preview | F | Expand the preview. |
| Local video preview | Left / Right, with optional Shift | Request the previous / next decoded frame, or jump ten frames. |
| Browser video selection | Left / Right, with optional Shift | Select a frame in the inspected interval, or jump ten frames; confirm its interpretation and verify explicitly afterward. |
| Dialog or color picker | Escape | Close and return focus to its control. |
| Palette controls | Escape | Cancel the palette audition without applying its colors. An active field handles its own draft first. |

Clicking a band's colored area also selects and focuses its graph control.
Each ordinary band's edge and center controls are adjacent in Tab order.
Deleting the last ordinary band leaves focus on the empty graph. Fill mode keeps
at least two colors; a blocked deletion preserves the existing undo step.
Holding Delete does not delete additional bands, and frame shortcuts ignore
auto-repeat and pause during decoding or inspection.

Text fields, sliders, selects, radio groups and native file controls retain their
own keyboard behavior. Editor shortcuts do not run underneath a dialog or color
popup. File, setup, palette management, verification and export actions remain
available through their visible keyboard-operable controls.

Band undo remains one step deep. Redo and a longer edit history are outside this
change. Browser Save/Open/Reload shortcuts are preserved.

## Integrated UI

The current checkout includes the newer UI work from the `ui-workbench` worktree:
gradient editing, exposure palette mapping, persistent exposure preview, palette
audition/apply/cancel, and the revised layout. The existing browser camera
verification is retained. The throwaway `prototype/lut-ui` runtime was excluded.
The source worktree was left intact, and production browser assets were rebuilt.

## Verification

Run from `frontend/`: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`,
and `pnpm build`.

Two optional real-Chromium checks run from the repository root:

```sh
node frontend/tests/keyboard-browser.mjs
node frontend/tests/workbench-browser.mjs
```

Both use the Playwright installation and launch prerequisites documented in
[integration verification](testing/integration.md). Set `PLAYWRIGHT_MODULE` to an
existing Playwright `index.mjs` when needed. The checks launch the actual local
workspace on port 8765 and stop it afterward. The focused check also serves the
built static entry page to exercise browser-only keyboard behavior.

Checked on Windows with Chromium: Tab navigation, Delete/Backspace, empty-graph
focus, one-step undo, Fill minimum, modal isolation, Escape and focus restoration,
palette cancellation, picker access, and narrow layout. The connected Workbench
check also covers keyboard-only setup/edit/save/import/export/generation, browser
palette persistence through server restart, actual PFM and VFR video verification,
checked-cube identity, and desktop/narrow/200% text/dark layouts. FFmpeg and FFprobe
were available. Unit coverage also checks frame jumps, bounds, field protection,
busy states and confirmation invalidation.

Final frontend checks: ESLint, all 62 tests, TypeScript/Vite production build and
Git whitespace checks pass. Both connected Chromium scripts pass.

Not checked: Safari, Firefox, screen-reader speech, or a physical Mac keyboard.
Cmd+Z is covered by a synthetic event; Ctrl+Z is exercised in real Chromium.
Python source was unchanged, so the full Python suite was not rerun.
