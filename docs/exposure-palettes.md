# Exposure-focused starting palettes

| Action | Colors | Band geometry | Exported immediately? |
| --- | --- | --- | --- |
| Audition a palette | Draft preview | Preserved | No |
| Use palette | Applied colors replaced | Preserved | Yes, on the next generation |
| Cancel preview | Applied colors preserved | Preserved | Existing colors remain |
| Apply an arrangement preset | Preset colors | Replaced | Yes, on the next generation |

> **Green marks the chosen reference.** It is not a universal exposure target.
> Warning colors and thresholds remain independent of the palette.

The browser's Exposure zones and Reference emphasis palettes are editing aids,
not manufacturer exposure recommendations. Both use cool colors below the
reference, green at the reference, and warm colors above it. Reference emphasis
quiets the surrounding colors so green stands out. Users may edit these colors.

Their seven starting anchors correspond to −3, −2, −1, 0, +1, +2 and +3 stops.
The reference dot cannot be moved or removed. Color interpolation outside the
anchor range holds the endpoint colors. Red does not establish sensor clipping;
recorded-signal warnings remain separate controls.

Stops are scene-linear luminance relative to 18% gray, as in the LUT engine.
Legacy IRE setups use target-encoded brightness before legal-range packing. On the neutral
axis the engine's Rec.709/Rec.2020 OETF places 18% gray at approximately 40.9 IRE.
IRE anchors are 10, 25, 35, approximately 40.9, 55, 65 and 80 target IRE,
following the editor's existing IRE regions with the central anchor at neutral
18% gray. This is not the source camera's log-code reference or a conversion of
colored-pixel IRE to scene stops. New camera-log IRE setups instead use the
selected camera's encoded 18% gray reference and camera-centered palette scale;
see [camera-log IRE](camera-log-ire.md) for math, sources, and compatibility.
Camera-profile decoding remains unchanged.

Band centers sample the fixed exposure scale; a band covering the reference
receives the reference color. Changing the overall band range does not stretch
this mapping. In Fill mode, the zone containing the reference receives its color,
finite surrounding zones sample their midpoint, and open-ended outer zones use
the corresponding endpoint color. Colors cover the existing zones in full; this
does not add boundaries or change widths. A broad zone may therefore share its
reference or endpoint color across a broad exposure interval.

Named palettes save this mapping. Older palettes without a mapping retain their
original band-range-relative behavior and are labeled accordingly. Palette
application stores the chosen band colors in Setup JSON and exported LUTs; it
does not change exposure calculations. Camera-log IRE separately adds the
`ire_basis` setup field and its documented calculation behavior. Previewing
remains non-destructive until Use palette is chosen;
the whole application is one undoable band edit.
