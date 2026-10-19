# Documentation design

The manual follows the builder's neutral interface: system sans-serif type,
light/dark surfaces, restrained borders, and 8px corner radii. Colors inside
exposure examples describe labels, not decoration or universal exposure targets.

## Choose the form that helps the reader

| Content | Form | Rule |
| --- | --- | --- |
| A setting, limit, or comparison | Table | Put comparable facts in the same columns |
| Ordered actions | Numbered steps | Preserve UI labels and give an observable result |
| A relationship or processing order | Diagram | Keep one subject and at most nine nodes |
| A short interpretation to remember | Blockquote | Write a takeaway; do not imply an external quotation |
| A prerequisite or consequence | Note, tip, or caution | Reserve caution for a real workflow mistake |
| Exact math, commands, or file content | Code block | Keep expressions copyable and units explicit |

> **Visuals explain; prose preserves precision.** Keep formulas, thresholds,
> source qualifications, and edge cases in searchable text beside the figure.

## Diagram conventions

The Diagram Design flowchart layout uses rectangles for stages and orthogonal
arrows for order. The three overview figures use a fitted 720 × 300 canvas,
16px stage names, 12px supporting labels, one filled focal stage, and no animation
or remote font dependency. This is a project-specific system-font skin, based on
`frontend/src/index.css`; it intentionally replaces the plugin's editorial fonts.

Each HTML figure includes a descriptive page title, an SVG title and description,
unique accessible IDs, and a keyboard-focusable local horizontal scroller. The
minimum SVG width matches its viewBox, so phone readers can scroll without
shrinking text. Embedded figures inherit the parent color scheme; standalone
figures follow the system preference. The caption repeats the essential path.

| Figure | Purpose | Deliberately omitted |
| --- | --- | --- |
| Recording → diagnostic LUT | Orient a new user | Internal decoding/gamut math; see the development guide |
| Warning priority | Explain which overlay wins | Threshold constants; see profiles and the adjacent formulas |
| Verification path | Distinguish the three RGB inspection stages | Codec and resource limits; see the source tables |

## Keep both reading surfaces usable

Use ordinary Markdown tables and blockquotes in repository guides so GitHub can
render them. Use Starlight notes in the published manual. Do not add diagrams to
historical acceptance reports merely for consistency: their dates, commands, and
results are the evidence. Keep the [documentation map](README.md) current instead.

After changes, run the frontend checks and rebuild bundled assets. Check local
and Pages paths, light and dark themes, keyboard scrolling, and narrow screens.
