# Exposure editor UI study

Question: which arrangement makes precise exposure-band editing and preview interpretation easiest to understand?

This is a throwaway interactive prototype on `prototype/lut-ui`, based on draft UI commit `698512a`. It is not production code or an implementation of the researched LUT-verification pipeline.

## Open it

From this checkout's `frontend` directory, install the existing dependencies with `npm ci` if needed, then run:

```sh
npm run prototype
```

This starts a loopback-only Vite server at [the workbench prototype](http://127.0.0.1:5178/?variant=A). It does not need a Python backend. The normal application remains the default route without a variant query, and still needs its normal Python launcher. The prototype UI is excluded from production JavaScript builds.

- [A · Workbench](http://127.0.0.1:5178/?variant=A): arrangement, graph, palette, and detailed band rows beside a persistent preview.
- [B · Guided workflow](http://127.0.0.1:5178/?variant=B): place bands, choose colors, and inspect bands in sequential steps.
- [C · Graph first](http://127.0.0.1:5178/?variant=C): a larger exposure graph with a compact selected-band inspector.

Use the floating bottom bar or left/right keys to switch. Arrow keys inside editable fields, selected graph markers, and an open dialog keep their normal meaning. Band and palette state survives variant changes. Preview-specific choices reset when switching layout. Everything resets on reload; no files or configurations are saved.

## Try these interactions

1. Choose another palette or brightness progression. Notice the draft preview and Unapplied changes label. The bands keep their colors until Apply to bands is clicked.
2. Apply colors, then undo. Positions and widths stay fixed.
3. Select a graph marker and use arrow keys or drag in quarter-stop steps. Edit its center, full width, or individual color. Numeric center/width edits commit when leaving the field. Undo stores the most recent band edit, not a history.
4. Compare the sRGB sample and illustrative band colors, change opacity, and expand the preview. The High signal label remains inside the graph.
5. Choose an image or a browser-decodable video. For video, choose a time or nudge by 0.1 seconds. A small H.264 MP4 is suitable for trying the interaction.
6. Select Camera-matched mode and record source gamma, gamut, and range. Notice that the image remains unprocessed and verification is explicitly unavailable.
7. Compare the layouts at desktop and narrow widths. The preview is beside the editor on wide screens and below it on narrow screens.

## What is simulated or limited

- Output settings are in-memory controls; no LUT generation, file writing, or API mutations occur.
- Demonstration rendering reuses existing palette helpers and applies an illustrative sRGB exposure-band overlay. It does not apply an exported LUT or infer original camera exposure. Its 960-pixel working image is for layout evaluation.
- Video selection uses the browser's decoder and current time, not FFmpeg. The actual decoded frame timestamp is not verified. The 0.1-second controls are time nudges, not frame steps. Files over 1 GB are rejected in this prototype; codec support is browser-dependent.
- Metadata, source-color validation, high-precision extraction, calibrated viewing, LUT interpolation, and encoded-signal image warnings are not connected. Manual source selections are recorded only as mockup state.
- The graph warning region is a visual example, not a computed camera threshold.
- No layout has been selected by the user yet. Preserve this branch as the primary source for the decision.

## Checks

```sh
npm run prototype:check
node node_modules/typescript/bin/tsc -b
node node_modules/eslint/bin/eslint.js src/UiPrototype.tsx src/prototype-state.ts src/main.tsx
```

The small check covers staged color application, immutable undo input, geometry preservation, snapped movement, and illustration opacity. Browser checks cover the layouts, source controls, expanded preview, and responsive placement. They do not establish numerical LUT accuracy or a full accessibility audit.

Decision ticket: [Agree the preview layout and understandable exposure-color controls](https://github.com/Today20092/lut_builder/issues/32).
