---
title: Keyboard and touch
description: Edit without dragging and navigate the manual and builder with a keyboard.
---

:::tip[You do not need to drag]
Use the numeric band fields for precise positions and widths. Tab reaches controls; Enter or Space activates buttons. Escape closes the picker or discards a numeric draft.
:::

Use Tab and Shift+Tab to move through controls. Buttons activate with Enter or Space. Native selects, radios, and sliders keep their usual arrow-key behavior. Numeric table fields provide an alternative to graph dragging on a keyboard or touch device.

| Focus | Keys | Action |
| --- | --- | --- |
| Outside fields and popups | ? | Open Keyboard shortcuts. |
| Outside fields and popups | Ctrl+Z / Cmd+Z | Undo the most recent band edit; one step, no redo. |
| Graph center or divider | Arrows | Move by the current increment. |
| Graph edge | Arrows | Resize the edge by 0.1 half-width units. |
| Graph control | Shift+Arrows | Adjust ten steps. |
| Graph | Alt+Left / Alt+Right | Select the previous/next band. |
| Graph | Delete / Backspace | Remove selected band immediately; Fill retains two colors. |
| Band number field | Enter / Escape | Commit / discard draft; blur commits valid input. |
| Band number field | Up / Down, optionally Shift | Adjust one / ten steps. |
| Gradient dot | Arrows / Shift+Arrows | Move one / ten steps. |
| Gradient dot | Home / End | Move to allowed limits; reference position stays fixed. |
| Focused image preview | F | Expand. |
| Video controls outside fields | Left / Right, optionally Shift | Previous/next frame, or ten frames. Browser selection stays within the inspected interval and requires verification afterward. |
| Dialog or color picker | Escape | Close and return focus. |
| Palette controls | Escape | Cancel audition; an active field handles its own draft first. |

Text fields keep text editing shortcuts. Editor shortcuts do not run underneath an open dialog or color picker. Frame shortcuts pause during decoding and ignore repeat. Wheel gestures scroll or zoom the browser rather than changing bands.

In **HSV triangle**, Tab reaches the hue ring. Arrow keys change hue by one degree;
Shift changes it by ten, and Home/End reach the red endpoint. Saturation and
brightness also have numeric fields, so choosing a color never requires dragging.

On touch screens, tap the numeric fields and swatches when a small drag handle is difficult to use. Scroll the table horizontally within its panel to reach the remaining columns. Export JSON before leaving the page if you need to keep the current setup.

## Navigate this manual

Use the skip link to reach the page content. On narrow screens, the menu button opens topic navigation; **Return to LUT Builder** is first. Search is available in the header; Escape closes its dialog. The page's table of contents links directly to headings. Light, dark, and system appearance options affect the manual's display, not LUT output.
