# Camera-log IRE and exposure

| Basis | Measures | Reference |
| --- | --- | --- |
| Stops | Decoded scene-linear CIE Y | 18% gray = 0 stops |
| New camera-log IRE | Weighted encoded source RGB × 100 | Profile-specific encoded gray |
| Legacy target IRE | Target-encoded luma before legal packing | Neutral target gray ≈ 40.9 |

> **Check the basis before comparing numbers.** Encoded luma and scene-linear
> luminance are different measurements. Neither IRE interpretation promises the
> same reading as every external waveform.

The measurement and the diagnostic output are separate. The source camera log
is decoded to scene-linear RGB. Stops measures CIE Y using the source gamut's
RGB-to-XYZ Y coefficients, relative to 18% gray: log2(Y / 0.18). Zero stops means
equal to that reference, not zero light or correct exposure for every subject.

New web-editor IRE selections measure encoded input RGB luma using those source
coefficients, before monochrome, target gamut conversion, output transfer, or
legal-range packing. This is a full-code-range percentage: input 0 is 0 and input
1 is 100 (10-bit codes 0 to 1023). It is not a claim of universal camera waveform
behavior: monitor range scaling and wide-gamut waveform conventions can differ.
IRE is a signal measurement. Weighted encoded luma is not scene luminance;
colored subjects need not yield the same exposure ordering in IRE and Stops.
Stops remains the default for scene-exposure comparisons.

## Neutral references

The displayed reference is each existing profile's encoded neutral 0.18 value,
calculated with Colour 0.4.7's existing profile curve defaults. Python tests
verify the browser constants against those encoders for all six profiles.
Gamut matters for colored-pixel luminance/luma; a neutral reference depends on
the transfer curve. This does not add support for additional EI/gamut variants.

| Existing profile | Full-code-range reference, rounded |
| --- | --- |
| S-Log3 / S-Gamut3.Cine | 41.1% |
| V-Log / V-Gamut | 42.3% |
| Canon Log 3 / Cinema Gamut | 34.3% |
| LogC3 / ARRI Wide Gamut 3 (existing EI 800 curve default) | 39.1% |
| Log3G10 / REDWideGamutRGB | 33.3% |
| Blackmagic Film Gen 5 / Blackmagic Wide Gamut | 38.4% |

Manufacturer evidence, checked 2026-10-19:

- [Sony S-Log3 technical summary](https://www.sony.jp/ls-camera/knowledge/pdf/TechnicalSummary_for_S-Gamut3Cine_S-Gamut3_S-Log3_V1_00.pdf): neutral gray code 420; approximately 41%.
- [Panasonic V-Log manual](https://help.na.panasonic.com/wp-content/uploads/2024/02/DCS5_DVQX2063ZA_ENG.pdf): approximately 42% for 18% gray.
- [Canon log gamma curves](https://www.usa.canon.com/content/dam/canon-assets/white-papers/pro/white-paper-canon-log-gamma-curves.pdf): Canon Log 3 reference approximately 34.3%, code 351.
- [ARRI LogC3 specification](https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2012-01-arrilog-c-logarithmic-cine-camera-image-encoding-data.pdf): the curve and EI are part of the specification; use the existing EI 800 profile.
- [RED Log3G10 white paper](https://docs.red.com/955-0187/PDF/915-0187%20Rev-C%20%20%20RED%20OPS%2C%20White%20Paper%20on%20REDWideGamutRGB%20and%20Log3G10.pdf): 18% gray maps to one third.
- [Blackmagic Gen 5 curve source used by Colour](https://colour.readthedocs.io/en/develop/generated/colour.models.oetf_BlackmagicFilmGeneration5.html): the implementation and its Blackmagic reference establish the neutral value. The UI value is computed from the pinned curve, not inferred from another generation's manual.

## Output and compatibility

The diagnostic output converts the underlying image to the chosen target gamut
and transfer and inserts the false colors, then applies output range packing.
It does not include the highlight tone mapping/look of a finished camera viewing
LUT. It must receive the log/gamut pairing selected in the editor; an upstream
viewing transform would change the meaning of the input.

The optional setup field `ire_basis: "camera"` selects the new measurement in
both Python and the browser. Absence or `"target"` keeps the previous
target-encoded behavior. Old saved setups and CLI behavior therefore keep their
meaning. The editor labels legacy IRE explicitly and offers an undoable switch
to camera IRE that installs fresh camera-centered band presets. Export/import
preserves the basis; content IDs distinguish the two interpretations.

Camera-centered palette anchors surround the reference using fractions of the
available signal range. These are editing defaults, not manufacturer exposure
zones or clipping limits. Changing cameras updates the reference and palette
scale; existing band numbers remain user edits until a preset is applied.
