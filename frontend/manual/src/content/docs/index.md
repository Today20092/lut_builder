---
title: Understand your exposure colors
description: A browser-first user manual for making, saving, and using diagnostic false-color LUTs.
---

LUT Builder makes a file that replaces selected exposure levels with colors you choose. Load that `.cube` file into a compatible camera, monitor, or editor to see where the image falls within your exposure bands.

**Start with [Make your first LUT](./first-lut/).** You need a browser and your camera's recording settings. You do not need to install software or use a terminal.

## What the colors mean

<iframe class="manual-diagram" src="./diagrams/lut-workflow.html" title="From camera recording to a diagnostic LUT" loading="lazy"></iframe>

*The path at a glance: match the recording, edit exposure labels, export the cube, then test it in the receiving device. Scroll within diagrams on a narrow screen.*

A LUT is a lookup table: it maps incoming red, green, and blue values to outgoing colors. A false-color LUT uses that mapping to make exposure differences easier to see. The colors are labels you assign, not a universal standard. Green can mark your reference exposure; purple and red can mark recorded-signal limits. You can change all of them.

Log recording compresses a large range of scene brightness into the recorded signal. Each camera log curve does this differently. That is why selecting the correct **Camera recording** profile matters before interpreting any color.

> **Read colors as labels.** These LUTs are diagnostic tools, not finished grades. They do not add a pleasing highlight roll-off or establish the point where your sensor clips.

## Find an answer

| I want to… | Read |
| --- | --- |
| Create my first file | [First-LUT walkthrough](./first-lut/) |
| Understand a setting or change a palette | [Controls and colors](./controls/) |
| Back up my work or load the LUT on a monitor | [Save, export, and apply](./save-and-apply/) |
| Check a camera still or video frame | [Camera verification](./verification/) |
| Understand purple or red warnings | [Recorded-signal warnings](./signal-limits/) |
| Find my camera's threshold values | [Camera thresholds and sources](./profiles/) |
| Fix a confusing result | [Troubleshooting](./troubleshooting/) |
| Work without dragging | [Keyboard and touch](./keyboard/) |

Use **Search** at the top to find topics such as “purple”, “legal range”, or “palette”. On a phone, open the navigation menu to browse topics. **Return to LUT Builder** is the first navigation link.

## Browser and local workspace

The manual leads with the browser app. The optional local Workbench shares the editor, but has a different media-verification workflow. Those differences are identified in the [verification guide](./verification/#local-workbench-differences).

Saved work stays in the browser where you saved it. Export setup JSON for a durable backup. Opening Help in a separate tab keeps the current editor open; returning to the builder in a new tab does not restore unsaved edits from another tab.

Developers should use the separate [repository setup guide](https://github.com/Today20092/lut_builder/blob/main/docs/guide.md#development).
