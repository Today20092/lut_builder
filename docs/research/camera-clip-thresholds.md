# Camera clip thresholds for encoded-signal warnings

Research date: 2026-11-10

Scope: why the high (red) and low (purple) warnings did not fire on real footage,
and the evidence behind each profile's corrected floor and ceiling. Background on
what a LUT can and cannot know about sensor clipping is in
[sensor-clipping-monitoring-lut.md](sensor-clipping-monitoring-lut.md).

## Findings

1. **The log curves were correct.** Every decoder is colour-science's
   implementation and reproduces the vendor's middle-grey code (S-Log3 420,
   V-Log 433, LogC3 400, Log3G10 1/3, Blackmagic Gen 5 0.3836). Browser and
   Python engines agree node for node.
2. **Most thresholds were unreachable.** A threshold beyond where a camera's
   recorded signal stops can never trigger. Sony's 0.94 (code 962, ~102% video)
   appears to confuse Sony's "94%" video level with a full-range code value.
   RED and Blackmagic used the cube domain bounds 0 and 1. Canon (0.04) and
   ARRI (0.03) floors sat below encoded black.
3. **Half-grid tolerance left clipped pixels partly coloured.** Hosts interpolate
   between lattice nodes, so a value renders the solid warning only if every node
   of its cell is flagged. Widening each test by one grid step guarantees this;
   half a step left, for example, RED at 33³ only 55% red at its clip code.

## Input domains

| Profile | Decoder input |
| --- | --- |
| Sony S-Log3, Panasonic V-Log, ARRI LogC3, RED Log3G10 | full-range `code / 1023` |
| Canon Log 3 | `code / 1023`; Canon's v1.2 constants are legal-range values |
| Blackmagic Film Gen 5 | video-level expansion `(code - 64) / 876` |

Sony quotes video levels on the legal scale: 0% black 3.5% = code 95, 18% grey
41% = code 420, so 94% = `64 + 0.94 × 876 = 887`.

## Corrected values

| Profile | Floor | Ceiling | Evidence | Status |
| --- | ---: | ---: | --- | --- |
| Sony S-Log3 | 0.0929 | 0.867 | Sony: S-Log3 maximum is 94% in video output ([support article](https://www.sony-asia.com/electronics/support/articles/00145909)); a7S III measures ~0.871 ([eoshd](https://eoshd.com/comments/topic/48631-a7siii-my-first-impressions/page/2)) | manufacturer |
| Panasonic V-Log | 0.1251 | 0.8905 | VariCam 35 clips at code 911 ([Panasonic](https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf)); S5II/S5IIX measure 911 ([Gamut](https://gamut.io/product/baseluts-for-panasonic-s5ii-s5iix-and-s9/)). Was 0.8906, just above 911. | manufacturer |
| Canon Log 3 | 0.1251 | 0.79 | Zero light is code 128. No Canon clip code; C70/C300 III reported at 85–90 IRE ([dvxuser](https://www.dvxuser.com/threads/c70-when-is-this-bad-boy-going-to-start-shipping.374091/page-3)); 85 IRE = code 809 | unverified |
| ARRI LogC3 | 0.0928 | 0.9296 | Black = sensor 256/65535, maximum = full sensor signal ([ARRI Log C in VFX](https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2017-03-alexa-logc-curve-in-vfx-data.pdf)); at EI 800 these encode to codes 95 and 976. False-color red starts at 951, 1/3 stop below clip ([ARRI false color](https://www.arri.com/resource/blob/390448/2d469ae1e98110562fe347cea50a284b/arri-logc-false-color-specification-data.pdf)) | manufacturer |
| RED Log3G10 | 0.0916 | 0.7986 | Linear zero encodes to 0.091551 ([RED white paper](https://docs.red.com/955-0187/PDF/915-0187%20Rev-C%20%20%20RED%20OPS,%20White%20Paper%20on%20REDWideGamutRGB%20and%20Log3G10.pdf)). No RED clip code; KOMODO ISO 800 measures 817 ([Gamut](https://gamut.io/product/baseluts-for-red-komodo/)) | unverified |
| Blackmagic Film Gen 5 | 0.0925 | 0.8561 | Floor is constant `E`. No Blackmagic clip code; Pocket 4K/6K ISO 400 measure 814 ([Gamut](https://gamut.io/product/baseluts-for-blackmagic-pocket-cinema-camera-6k-and-pocket-cinema-camera-4k/)), `(814 - 64) / 876` | unverified |

Unverified ceilings use the lowest credible measurement, so they warn early
rather than miss clipping.

## Known gaps

- One threshold per log curve cannot fit every body. GH6/GH7 V-Log clips at
  reported codes 762–837, below 0.8905. ARRI clips at code 917 at EI 400 and
  reaches 1023 at EI 1600; the decoder assumes EI 800. A C300 Mark II warns about
  two stops early under the Canon value.
- Per-body presets (camera, ISO/EI, recording mode) would remove these gaps.
- Sony zebras and histograms read the recorded S-Log3 signal, not the Gamma
  Display Assist image ([xdcam-user](https://xdcam-user.com/2021/06/understanding-sonys-viewfinder-display-gamma-assist)).
  Newer bodies label the scope "Look" when a LUT is applied
  ([Sony](https://helpguide.sony.net/ilc/2630/v1/en/contents/video_signal.html)).
  The LUT warning always tests the log input, independent of display.

## Regression coverage

`tests/test_diagnostic_semantics.py` checks, for every profile, that the floor
decodes to zero light, that the ceiling is at or under half a stop below the
recorded clip, and that values at the ceiling and the clip render solid warning
color at 17³, 33³ and 65³. `frontend/tests/python-parity.mjs` compares browser
and Python cubes with warnings enabled for every camera.
