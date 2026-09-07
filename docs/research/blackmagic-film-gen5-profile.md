# Blackmagic Film Gen 5 camera profile

Research date: 2026-07-22

Scope: exact values and naming needed to add Blackmagic Film Generation 5 with Blackmagic Wide Gamut to the camera profile catalog. This note does not change application code.

## Recommended catalog entry

| Field | Value |
|---|---|
| Display name | `Blackmagic Film Gen 5` |
| Camera gamut | `Blackmagic Wide Gamut` |
| Vendor transfer name | Blackmagic Film Generation 5 |
| Common camera families | Pocket Cinema Camera 4K/6K, Cinema Camera 6K, PYXIS, URSA Mini Pro 12K |
| Encoded-signal floor | `0.09246575342465753` |
| Encoded-signal ceiling | `1.0` |
| Middle-grey encoded value | `0.3835616438356165` |

The display name follows the repository's short profile-name convention while retaining the vendor's curve generation. `Blackmagic Wide Gamut` is the exact colourspace registry key already provided by Colour 0.4.7; Blackmagic's specification calls the gamut “Blackmagic Camera Wide Gamut.” The specification pairs that gamut with the “Blackmagic Film Generation 5” OETF, and the Academy Software Foundation's Blackmagic-reviewed CLF generator describes the combined transform as `BMDFilm_WideGamut_Gen5` ([Blackmagic Generation 5 technical reference](https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view), [OpenColorIO Config ACES generator](https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES/blob/main/opencolorio_config_aces/clf/transforms/blackmagic/generate.py)).

Blackmagic's current product material explicitly identifies Pocket Cinema Camera 4K/6K, Cinema Camera 6K, PYXIS, and URSA Mini Pro 12K as Generation 5 families ([Pocket Cinema Camera Blackmagic RAW](https://www.blackmagicdesign.com/products/blackmagicpocketcinemacamera/blackmagicraw), [Cinema Camera 6K](https://www.blackmagicdesign.com/products/blackmagiccinemacamera), [PYXIS](https://www.blackmagicdesign.com/products/blackmagicpyxis), [Blackmagic product catalog](https://www.blackmagicdesign.com/products)). This is a concise compatibility hint, not a guarantee for every recording mode or firmware version.

## Transfer function

For scene-linear light `x` and encoded signal `y`, Blackmagic publishes the following constants ([Blackmagic Generation 5 technical reference](https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view)):

| Constant | Value |
|---|---:|
| `A` | `0.08692876065491224` |
| `B` | `0.005494072432257808` |
| `C` | `0.5300133392291939` |
| `D` | `8.283605932402494` |
| `E` | `0.09246575342465753` |
| `LIN_CUT` | `0.005` |
| `LOG_CUT = D * LIN_CUT + E` | `0.13388378370306225` |

Forward OETF:

```text
y = D * x + E                 when x < LIN_CUT
y = A * ln(x + B) + C         when x >= LIN_CUT
```

Inverse OETF (the camera-input decoder needed by the LUT builder):

```text
x = (y - E) / D               when y < LOG_CUT
x = exp((y - C) / A) - B      when y >= LOG_CUT
```

The logarithm is natural logarithm. The equations and constants above are reproduced in Colour's maintained implementation and in the Academy Software Foundation's CLF generator; the latter states that its resulting transforms were reviewed by Blackmagic ([Colour transfer-function source](https://github.com/colour-science/colour/blob/develop/colour/models/rgb/transfer_functions/blackmagic_design.py), [OpenColorIO Config ACES generator](https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES/blob/main/opencolorio_config_aces/clf/transforms/blackmagic/generate.py)).

## Gamut definition

Blackmagic publishes these CIE 1931 `xy` chromaticities ([Blackmagic Generation 5 technical reference](https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view)):

| Point | x | y |
|---|---:|---:|
| Red | `0.7177215` | `0.3171181` |
| Green | `0.2280410` | `0.8615690` |
| Blue | `0.1005841` | `-0.0820452` |
| White | `0.3127170` | `0.3290312` |

The vendor's published linear RGB-to-XYZ and inverse matrices are:

```text
Blackmagic Wide Gamut RGB -> CIE XYZ
 0.606530   0.220408   0.123479
 0.267989   0.832731  -0.100720
-0.029442  -0.086611   1.204861

CIE XYZ -> Blackmagic Wide Gamut RGB
 1.866382  -0.518397  -0.234610
-0.600342   1.378149   0.176732
 0.002452   0.086400   0.836943
```

No project-local matrix is required: Colour 0.4.7 already registers these primaries and white point as `colour.RGB_COLOURSPACES["Blackmagic Wide Gamut"]` and derives equivalent higher-precision matrices ([Colour gamut source](https://github.com/colour-science/colour/blob/develop/colour/models/rgb/datasets/blackmagic_design.py)).

## Signal-domain assumptions

The official mapping table defines `x = 0` as `y = 0.0924657534246575` (10-bit video code 145), 18% grey as `y = 0.3835616438356165` (code 400), linear `x = 1` as `y = 0.5304896249573048` (code 529), and the top mapping `x = 222.86` as `y = 1.0` (code 940). Blackmagic describes that top as 10.27 stops above 18% grey ([Blackmagic Generation 5 technical reference](https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view)).

Therefore the catalog's normalized encoded-signal warning thresholds should be `0.09246575342465753` and `1.0`. These values assume the host has already expanded the 10-bit video-level representation so codes 64–940 correspond to normalized `0.0–1.0`; the vendor table confirms code 145 is `64 + 0.0924657534 * (940 - 64)`. They are signal-domain boundaries, not sensor clipping guarantees. BRAW decoding can also depend on clip metadata, camera type, selected color-science generation, gamut, gamma, ISO, exposure, white balance, and highlight recovery, all exposed by Blackmagic's SDK ([Blackmagic RAW SDK manual](https://documents.blackmagicdesign.com/DeveloperManuals/BlackmagicRAW-SDK.pdf)).

## Repository integration constraint

Colour 0.4.7 exposes the decoder as `colour.models.oetf_inverse_BlackmagicFilmGeneration5`, paired with `colour.models.oetf_BlackmagicFilmGeneration5`; it does **not** register this curve in `colour.LOG_ENCODINGS` under a name accepted by `colour.models.log_decoding` ([Colour transfer-function source](https://github.com/colour-science/colour/blob/develop/colour/models/rgb/transfer_functions/blackmagic_design.py)). The current catalog validator and engine use the generic log-decoding registry, so adding only a data row will fail validation or generation. The implementation needs the smallest OETF-aware source dispatch that routes this profile to the inverse OETF while leaving existing log profiles unchanged.

Minimum numerical regression values:

- decoding `0.3835616438356165` must return approximately `0.18`;
- encoding `0.18` must return approximately `0.3835616438356165`;
- decoding `0.09246575342465753` must return `0.0`;
- decoding `1.0` must return approximately `222.86`.

## Source URLs for the catalog

- `https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view`
- `https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES/blob/main/opencolorio_config_aces/clf/transforms/blackmagic/generate.py`
- `https://documents.blackmagicdesign.com/DeveloperManuals/BlackmagicRAW-SDK.pdf`
