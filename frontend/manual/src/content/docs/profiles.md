---
title: Camera thresholds and sources
description: Exact configured limits, input assumptions, evidence gaps, and worked examples for all six profiles.
---

These are the current **application constants**, not a table of measured sensor clipping points. Match the log curve and gamut together. The values are maintained in the [browser catalog](https://github.com/Today20092/lut_builder/blob/main/frontend/src/lutEngine.ts) and [Python catalog](https://github.com/Today20092/lut_builder/blob/main/src/lut_builder/data.py).

| Profile | Required gamut | Low F | High C |
| --- | --- | ---: | ---: |
| Sony S-Log3 | S-Gamut3.Cine | 0.0929 | 0.94 |
| Panasonic V-Log | V-Gamut | 0.1251 | 0.8906 |
| Canon Log 3 | Cinema Gamut | 0.04 | 0.90 |
| ARRI LogC3 | ARRI Wide Gamut 3 | 0.03 | 0.91 |
| RED Log3G10 | REDWideGamutRGB | 0 | 1 |
| Blackmagic Film Gen 5 | Blackmagic Wide Gamut | 0.09246575342465753 | 1 |

## Reading the examples

All examples below use a **65³ cube**, both warnings enabled, and normalized camera RGB at exact lattice nodes. Each comparison includes `t = 0.0078125`. They illustrate the exported warning rule, not sensor performance or an arbitrary interpolated pixel. Warning colors override exposure bands; high wins when both trigger.

The camera documents linked below support curve/gamut interpretation. A source link in the catalog does not by itself prove every warning constant. Where the repository has no reproducible derivation, that gap is stated rather than assigning a false precision or a camera-wide guarantee.

## Sony S-Log3

**Input:** S-Log3 with S-Gamut3.Cine. The cited Sony specification defines normalized S-Log3 as 10-bit code divided by 1023. Do not substitute S-Gamut3 or an already display-converted signal.

**Evidence:** Sony's [S-Log3/S-Gamut3 technical summary, appendix](https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf) gives the zero-light code as 95. `95 / 1023 = 0.092864125…`, consistent with the catalog's rounded **0.0929** floor. The repository does not record a reproducible derivation for the **0.94** ceiling; treat it as the configured high warning, not a universal Sony saturation value.

**Worked example:** the low comparison is `min(R,G,B) <= 0.1007125`; the high comparison is `max(R,G,B) >= 0.9321875`. `(0.09375, 0.5, 0.5)` triggers low. `(0.9375, 0.5, 0.5)` triggers high. Sony's 18% reference is code 420, or about 0.41056; that encoded value is not 41% scene-linear light.

**Limit:** camera model, recording path, and channel processing remain relevant. The high constant has no per-model calibration.

## Panasonic V-Log

**Input:** V-Log with V-Gamut in the normalized code domain used by the decoder. The vendor's 10-bit code table can be read on a 0–1023 scale; any upstream YCbCr decoding and range handling must preserve the intended camera RGB values.

**Evidence:** Panasonic's [V-Log/V-Gamut reference manual](https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf) lists black at code 128 and 18% gray at 433. `128 / 1023 = 0.125122…` is consistent with the rounded **0.1251** floor. The catalog uses **0.8906** as its ceiling, but does not record a reproducible derivation tying that value to all V-Log cameras. Do not treat it as a V-Log L or camera-body clipping guarantee.

**Worked example:** low is `min <= 0.1329125`; high is `max >= 0.8827875`. `(0.125, 0.5, 0.5)` triggers low; `(0.890625, 0.5, 0.5)` triggers high. The vendor gray code gives `433 / 1023 ≈ 0.423265`; the decoder maps gray to scene exposure near the reference, not to that many stops.

**Limit:** V-Log-family cameras and modes need their own headroom checks. A proxy tagged BT.709 is not evidence that its samples still contain V-Log.

## Canon Log 3

**Input:** Canon Log 3 with Cinema Gamut, in the decoder's normalized camera-code domain. Do not substitute Canon Log, Canon Log 2, or a display-rendered export. Confirm the file/host range interpretation; this manual does not certify all Canon recording paths.

**Evidence:** the catalog cites Canon's [C300 Mark II image-performance white paper](https://downloads.canon.com/nw/camera/products/cinema-eos/c300-mark-ii/white-papers/canon-c300-mk-ii-image-performance-wp.pdf). Its **0.04** floor and **0.90** ceiling are existing application constants. The repository contains no reproducible, page-specific derivation of that pair, and the cited URL could not be retrieved during this manual's source check. Neither constant is presented here as a verified zero-light code or a model-independent clipping value.

**Worked example:** low is `min <= 0.0478125`; high is `max >= 0.8921875`. `(0.046875, 0.5, 0.5)` triggers low; `(0.90625, 0.5, 0.5)` triggers high.

**Limit:** use the configured warnings as provisional diagnostic markers and validate them on the selected camera mode. This documentation does not alter their values.

## ARRI LogC3

**Input:** ARRI LogC3 with ARRI Wide Gamut 3. LogC4/AWG4 is a different encoding. The application does not expose an EI selector; it uses the maintained decoder's defaults. Do not assume that a fixed warning pair describes all exposure indices.

**Evidence:** the catalog cites ARRI's [Log C image-encoding document](https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2012-01-arrilog-c-logarithmic-cine-camera-image-encoding-data.pdf). The configured **0.03** floor and **0.91** ceiling have no reproducible EI-specific derivation recorded in this repository. The original URL was unavailable during the source check. These are normalized input-domain constants, not a claim about legal-range transport codes or universal LogC3 black/saturation levels.

**Worked example:** low is `min <= 0.0378125`; high is `max >= 0.9021875`. `(0.03125, 0.5, 0.5)` triggers low; `(0.90625, 0.5, 0.5)` triggers high.

**Limit:** check the original recording's LogC generation, gamut, EI, and range handling before relying on the result.

## RED Log3G10

**Input:** Log3G10 with REDWideGamutRGB. Supply decoded camera RGB in the curve's normalized domain; the builder does not read R3D RAW or infer decode settings.

**Evidence:** **0** and **1** are the chosen boundaries of the normalized cube input domain. They are not a derivation of the camera sensor's black or saturation points, nor a claim that encoded linear zero equals zero. The catalog points to RED's [IPP2 technical paper](https://www.red.com/download/ipp2-technical-paper); that URL was unavailable during the source check. The normalized-domain policy is independently visible in the exported cube's `DOMAIN_MIN` and `DOMAIN_MAX`.

**Worked example:** low is `min <= 0.0078125`; high is `max >= 0.9921875`. `(0, 0.5, 0.5)` triggers low; `(1, 0.5, 0.5)` triggers high. On a 65³ grid, the next interior nodes, 0.015625 and 0.984375, do not cross those respective tests.

**Limit:** RGB transformations before the LUT can reach these boundaries even without sensor clipping. RAW decode metadata and exposure adjustments remain outside this warning policy.

## Blackmagic Film Gen 5

**Input:** Blackmagic Film Generation 5 with Blackmagic Wide Gamut. This profile expects the normalized domain **after the appropriate video-level expansion**: 10-bit codes 64–940 map to 0–1. Code 145 becomes `(145 − 64) / 876 = 0.0924657534…`; dividing it by 1023 instead would give the wrong input for this convention.

**Evidence:** the [existing Blackmagic research](https://github.com/Today20092/lut_builder/blob/main/docs/research/blackmagic-film-gen5-profile.md) traces the floor to the constant `E` in the vendor's linear segment `encoded = D × linear + E`. At linear zero, encoded equals **0.09246575342465753**. Its top mapping is **1**, corresponding to video code 940. The [vendor reference](https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view) was unavailable during this manual's direct source check; the repository preserves the equations and links to the [Blackmagic-reviewed Academy implementation](https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES/blob/main/opencolorio_config_aces/clf/transforms/blackmagic/generate.py).

**Worked example:** low is `min <= 0.10027825342465753`; high is `max >= 0.9921875`. `(0.09375, 0.5, 0.5)` triggers low; `(1, 0.5, 0.5)` triggers high. The documented gray code 400 expands to `(400 − 64) / 876 ≈ 0.38356164`, which decodes to 0.18 linear.

**Limit:** BRAW decoding, color-science generation, ISO, white balance, exposure, and highlight recovery can change the samples. This profile is not a RAW decoder. The high mapping is an encoding boundary, not a guarantee of 10.27 stops of usable sensor headroom on every camera.

## Evidence status

Source check: October 19, 2026. Sony and Panasonic documents were retrieved directly. Unavailable vendor links above remain as the catalog's original references, with their access and derivation limits explicit. Review the repository's [profile contribution requirements](https://github.com/Today20092/lut_builder/blob/main/Contributing.md) before proposing a threshold correction. Missing evidence is a reason to investigate; it is not permission to silently change LUT behavior.
