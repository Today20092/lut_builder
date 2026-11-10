---
title: Camera thresholds and sources
description: Exact configured limits, input assumptions, evidence gaps, and worked examples for all six profiles.
---

> **Match the whole profile.** Camera brand alone is insufficient: log curve, gamut, and the documented input-range convention must agree with the source. Threshold evidence is specific to each profile.

Each floor is the curve's encoded zero-light level. Each ceiling is where that camera family's recorded signal stops, from the manufacturer where one is published and otherwise from a labelled measurement. None is a per-body sensor calibration. Match the log curve and gamut together. The values are maintained in the [browser catalog](https://github.com/Today20092/lut_builder/blob/main/frontend/src/lutEngine.ts) and [Python catalog](https://github.com/Today20092/lut_builder/blob/main/src/lut_builder/data.py).

| Profile | Required gamut | Low F | High C |
| --- | --- | ---: | ---: |
| Sony S-Log3 | S-Gamut3.Cine | 0.0929 | 0.867 |
| Panasonic V-Log | V-Gamut | 0.1251 | 0.8905 |
| Canon Log 3 | Cinema Gamut | 0.1251 | 0.79 (unverified) |
| ARRI LogC3 | ARRI Wide Gamut 3 | 0.0928 | 0.9296 |
| RED Log3G10 | REDWideGamutRGB | 0.0916 | 0.7986 (unverified) |
| Blackmagic Film Gen 5 | Blackmagic Wide Gamut | 0.09246575342465753 | 0.8561 (unverified) |

**Unverified** ceilings have no manufacturer-published clip code. They use the lowest credible measurement, so the warning may appear somewhat before your camera actually clips. Check against your own waveform.

## Reading the examples

All examples below use a **65³ cube**, both warnings enabled, and normalized camera RGB at exact lattice nodes. Each comparison includes `t = 0.015625`, one grid step. They illustrate the exported warning rule, not sensor performance or an arbitrary interpolated pixel. Warning colors override exposure bands; high wins when both trigger.

The camera documents linked below support curve/gamut interpretation. A source link in the catalog does not by itself prove every warning constant. Where the repository has no reproducible derivation, that gap is stated rather than assigning a false precision or a camera-wide guarantee.

## Sony S-Log3

**Input:** S-Log3 with S-Gamut3.Cine. The cited Sony specification defines normalized S-Log3 as 10-bit code divided by 1023. Do not substitute S-Gamut3 or an already display-converted signal.

**Evidence:** Sony's [S-Log3/S-Gamut3 technical summary, appendix](https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf) gives the zero-light code as 95. `95 / 1023 = 0.092864125…`, consistent with the catalog's rounded **0.0929** floor. Sony [support documentation](https://www.sony-asia.com/electronics/support/articles/00145909) states that S-Log3's maximum is 94% in video output. On the 10-bit legal scale that is `64 + 0.94 × 876 ≈ 887`, and `887 / 1023 ≈ 0.867` in the full-range code values Sony records, so the **0.867** ceiling marks where Sony cameras stop. Earlier releases used 0.94 (code 962, about 102% video), which S-Log3 cameras do not reach, so clipped highlights were not flagged. The value is still not a per-camera sensor measurement.

**Worked example:** low is `min(R,G,B) <= 0.108525`; high is `max(R,G,B) >= 0.851375`. `(0.09375, 0.5, 0.5)` triggers low. `(0.859375, 0.5, 0.5)` triggers high; `(0.84375, 0.5, 0.5)` does not. Sony's 18% reference is code 420, or about 0.41056; that encoded value is not 41% scene-linear light.

**Limit:** the 94% maximum is Sony's family-wide statement. Lower ISOs or bodies with less highlight range can stop slightly earlier; a7S III footage measures about 0.871, just above the ceiling.

## Panasonic V-Log

**Input:** V-Log with V-Gamut, full-range code divided by 1023.

**Evidence:** Panasonic's [V-Log/V-Gamut reference manual](https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf) lists black at code 128 (`128 / 1023 = 0.12512`, the **0.1251** floor) and VariCam 35 clipping at code 911. `911 / 1023 = 0.89052`, so the ceiling is **0.8905**. It was previously 0.8906, a rounding just above code 911. S5II/S5IIX measurements also report code 911 ([Gamut](https://gamut.io/product/baseluts-for-panasonic-s5ii-s5iix-and-s9/)).

**Worked example:** low is `min <= 0.140725`; high is `max >= 0.874875`. `(0.140625, 0.5, 0.5)` triggers low; `(0.875, 0.5, 0.5)` triggers high; `(0.859375, 0.5, 0.5)` does not.

**Limit:** GH-series V-Log clips lower (reported codes 762–837 depending on Dynamic Range Boost), so this ceiling will not flag GH6/GH7 clipping.

## Canon Log 3

**Input:** Canon Log 3 with Cinema Gamut. Canon's v1.2 constants are legal-range values applied to code divided by 1023.

**Evidence:** Canon Log 3's zero-light output is code 128 (`0.12512`), the **0.1251** floor. Earlier releases used 0.04, which is below black and could not trigger. Canon publishes no clip code. Its [C300 Mark II white paper](https://downloads.canon.com/nw/camera/products/cinema-eos/c300-mark-ii/white-papers/canon-c300-mk-ii-image-performance-wp.pdf) places sensor saturation near +6.3 stops, about code 1017. C70 and C300 Mark III users [report clipping at 85–90 IRE](https://www.dvxuser.com/threads/c70-when-is-this-bad-boy-going-to-start-shipping.374091/page-3). The ceiling uses 85 IRE (code 809, **0.79**). The previous 0.90 was about 98 IRE, which those cameras do not reach.

**Worked example:** low is `min <= 0.140725`; high is `max >= 0.774375`. `(0.140625, 0.5, 0.5)` triggers low; `(0.78125, 0.5, 0.5)` triggers high; `(0.765625, 0.5, 0.5)` does not.

**Limit:** unverified. A C300 Mark II will warn about two stops early. Measure your body's clip on a waveform before relying on it.

## ARRI LogC3

**Input:** ARRI LogC3 with ARRI Wide Gamut 3, full-range code divided by 1023, decoded at EI 800.

**Evidence:** ARRI's [Log C usage document](https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2017-03-alexa-logc-curve-in-vfx-data.pdf) defines black as sensor code 256/65535 and the maximum as full sensor signal. Through the EI 800 parameters those encode to code 95 (**0.0928** floor) and code 976. ARRI's [false-color specification](https://www.arri.com/resource/blob/390448/2d469ae1e98110562fe347cea50a284b/arri-logc-false-color-specification-data.pdf) starts red at code 951, one-third stop below clipping. That is the **0.9296** ceiling. The previous 0.03 floor was below black and could not trigger.

**Worked example:** low is `min <= 0.108425`; high is `max >= 0.913975`. `(0.09375, 0.5, 0.5)` triggers low; `(0.921875, 0.5, 0.5)` triggers high; `(0.90625, 0.5, 0.5)` does not.

**Limit:** EI-specific. At EI 400 the sensor clips at code 917, below this ceiling, and at EI 1600 it reaches code 1023.

## RED Log3G10

**Input:** Log3G10 with REDWideGamutRGB, full-range code divided by 1023. The builder does not read R3D RAW.

**Evidence:** RED's [Log3G10 white paper](https://docs.red.com/955-0187/PDF/915-0187%20Rev-C%20%20%20RED%20OPS,%20White%20Paper%20on%20REDWideGamutRGB%20and%20Log3G10.pdf) encodes linear zero at 0.091551 (**0.0916** floor) and reaches 1.0 only at +10 stops. The previous 0 and 1 thresholds could therefore never trigger. RED publishes no clip code. KOMODO at ISO 800 measures code 817 ([Gamut](https://gamut.io/product/baseluts-for-red-komodo/)), the **0.7986** ceiling.

**Worked example:** low is `min <= 0.107225`; high is `max >= 0.782975`. `(0.09375, 0.5, 0.5)` triggers low; `(0.796875, 0.5, 0.5)` triggers high; `(0.78125, 0.5, 0.5)` does not.

**Limit:** unverified, and the clip code moves with ISO and body. The camera's own exposure tools see the sensor directly and remain authoritative.

## Blackmagic Film Gen 5

**Input:** Blackmagic Film Generation 5 with Blackmagic Wide Gamut, **after video-level expansion**: 10-bit codes 64–940 map to 0–1. Code 145 becomes `(145 − 64) / 876 = 0.0924657534…`.

**Evidence:** the [existing Blackmagic research](https://github.com/Today20092/lut_builder/blob/main/docs/research/blackmagic-film-gen5-profile.md) traces the floor to the constant `E` in `encoded = D × linear + E`: linear zero is **0.09246575342465753**. Blackmagic publishes no clip code. Pocket 4K/6K at ISO 400 measure code 814 ([Gamut](https://gamut.io/product/baseluts-for-blackmagic-pocket-cinema-camera-6k-and-pocket-cinema-camera-4k/)), or `(814 − 64) / 876 = 0.8561` in this domain. The previous ceiling of 1 (code 940) could not trigger.

**Worked example:** low is `min <= 0.10809075342465753`; high is `max >= 0.840475`. `(0.09375, 0.5, 0.5)` triggers low; `(0.84375, 0.5, 0.5)` triggers high; `(0.828125, 0.5, 0.5)` does not.

**Limit:** unverified. The same source also lists code 850, and the clip moves with ISO. BRAW decode settings and highlight recovery change the samples.

## Evidence status

Source check: November 10, 2026. Sony and Panasonic documents were retrieved directly. Unavailable vendor links above remain as the catalog's original references, with their access and derivation limits explicit. Review the repository's [profile contribution requirements](https://github.com/Today20092/lut_builder/blob/main/Contributing.md) before proposing a threshold correction. Missing evidence is a reason to investigate; it is not permission to silently change LUT behavior.
