# Browser app support

This matrix describes the static [GitHub Pages app](https://today20092.github.io/lut_builder/) introduced for [issue #9](https://github.com/Today20092/lut_builder/issues/9). It generates LUTs on-device and does not run the Python workspace.

| Feature | Browser build |
| --- | --- |
| Camera profiles and output gamuts | Six supported profiles; Rec.709 and Rec.2020 |
| Exposure editor | Stops and IRE bands, Fill zones, overlap priority, palette and setup controls |
| LUT generation | On-device worker; 17, 33, and 65 point `.cube` downloads |
| Setup JSON | Import and export remain available |
| Named setup presets | Saved in this browser only; storage may be cleared and does not sync between devices. Export JSON for backup or transfer. |
| Exposure preview | Not included in the static build |
| Camera-matched still verification | Not available in the static build; see [follow-up #39](https://github.com/Today20092/lut_builder/issues/39) |
| Camera-matched video verification | Not available in the static build; see [follow-up #39](https://github.com/Today20092/lut_builder/issues/39) |

The demonstration image is illustrative. It does not apply the exported LUT and is not a verification result. The static app does not send setup data, LUTs, or media to a calculation service.

## Verification completed locally

- Python reference nodes cover all six profiles and both target gamuts. Additional fixtures cover Stops overlap and an inclusive band edge, IRE, Fill boundary selection, warning precedence, legal range, and R-fastest cube serialization; the browser engine is compared within `0.000001` per channel.
- The three supported cube sizes were generated and downloaded in the Codex in-app browser on this Windows desktop. The observed click-to-download round trip was under one second for each size; this includes browser automation overhead and is not a device benchmark.
- The deployed app loaded at the repository subpath and generated/downloaded a 17-point `.cube` file in the in-app browser. The [Pages workflow run](https://github.com/Today20092/lut_builder/actions/runs/39179887256) passed its build and deployment jobs.
- Named setup save/load and keyboard tab navigation were smoke-checked in the same browser. Existing frontend tests cover JSON setup compatibility, editing and keyboard/pointer band interactions.
- The browser tool did not expose its engine version or a phone-sized viewport, so no browser-version claim, touch check, memory measurement, or mobile-download claim is made. Cross-browser checks remain pending.

## Release

The [Pages workflow](../.github/workflows/deploy-pages.yml) builds and tests the static app at the `/lut_builder/` repository subpath, then deploys after a successful push to `main`. Use the [live app](https://today20092.github.io/lut_builder/) to test browser LUT creation and downloads.
