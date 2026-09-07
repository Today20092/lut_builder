# Confirmed video verification, ticket 38

Implemented on `codex/workbench-ticket-6`, from integrated baseline `83dd4b38c65c57c62190cd6abdeef3897620bb6a`. Implementation commit: `2f5fbea`; spatial chroma/lifecycle coverage and integration documentation: `8f560f4`. Final test results are committed on the same branch. The original Documents checkout was not changed; no merge or issue closure was performed.

## Connected workflow

Select **Camera-matched**, **Video**, then **Choose video**. Select a relative time or adjacent frame. The displayed identity contains actual decimal/rational time, ordinal, PTS, time base and first PTS. Confirm matrix, transport range, chroma location, component bit depth, source transfer and gamut, then choose **Verify selected frame**.

Reported stream/frame metadata remains separate from suggestions and confirmed interpretation. Supported frame tags take precedence over stream tags when offering matrix/range/chroma suggestions. Missing or unsupported values stay unknown. All confirmation controls start unknown, including component depth, whose only supported interpretation is the actual native decoder depth. Transfer/gamut must match the LUT profile. Camera and codec names do not select a camera profile.

The result uses the existing still viewer, original-resolution pixel inspector, exact checked-cube download and provenance disclosure. It is the unblended serialized-cube result. Original and Split remain disabled with the established explanation: there is no camera-to-SDR reference viewing transform. Verification failure never displays the demonstration image.

## Processing and lifetime

`POST /verify-video` uses the existing launch token and verification job lock. It accepts `request_id`, `source_id`, the exact selected `frame` object, optional source `name`, `setup` and `interpretation`. Interpretation includes `transfer`, `gamut`, `range="camera-code-values"`, `confirmed=true`, `matrix`, `signal_range`, `chroma_location` and integer `bit_depth`.

The server holds `VideoSession.operation()` while validating frame identity, decoding and verifying. The shared bounded FFmpeg runner reads `source.raw`, explicitly resolves matrix/range/chroma with zscale and outputs planar float32 GBR. Bilinear chroma reconstruction is explicit, matching the [documented zscale default](https://ffmpeg.org/ffmpeg-filters.html#zscale). Planes become top-left RGB without clipping or an intermediate PNG. Transfer and gamut conversion are not performed by this decode. Confirmed settings are passed to `verification.verify_rgb`; its existing serialized-cube interpolation and SDR rendering remain unchanged. The demonstration float file and PNG are not verification inputs.

Provenance includes source name, native sample hash, pixel format/layout/depth/dimensions, exact frame identity/time, separate reported facts, tool versions, stream index, exact confirmed conversion filter, confirmed interpretation, settings/hash, cube/hash/size, interpolation, output/view policy and cube-boundary clamp count.

`/verify-pixel`, `/verify-cube` and `/verify-cancel` retain their existing contracts. The video session invalidates its checked result on any new selection attempt, cancellation, replacement or expiry. UI changes to frame, source, interpretation or generation settings immediately remove the result and cancel matching work. Late replies cannot restore it. A failed frame request hides the checker until a successful selection. A source or frame change from another tab expires the retained artifact; the existing page is not live-synchronized across tabs.

One video and one verification job/result are retained per launch. The upload, duration, frame, pixel-format, decoder and temporary-storage bounds in [video frame selection](video-frames.md) still apply. The new request has a 1 MB JSON cap and 30-second body deadline. Cancellation is checked during the decoder's 50 ms polling loop, before/after cube generation and between verifier chunks. Cube generation itself completes before cancellation is observed. Temporary video storage is released by the existing cancel/expiry/shutdown path; verification cancellation releases its result but retains the selected video for retry.

Supported confirmed matrices: BT.709, BT.470BG, SMPTE 170M, BT.2020 nonconstant luminance. Supported transport ranges: limited/full. Chroma locations: left/center/top-left. Native depths remain 8 or 10 bits in the previously supported formats. SDR viewing is Rec.709 or SDR Rec.2020 with full/legal output; there is no HDR tone mapping, camera RAW support or calibrated-monitor claim.

## Evidence

Tests use deterministic synthetic camera-code samples in lossless 10-bit 4:2:2 FFV1 Matroska, not manufacturer camera recordings. Samples include neutral signal levels, asymmetric chroma, superblack and superwhite. Existing video tests continue to cover H.264/HEVC/ProRes, VFR and nonzero PTS.

| Boundary | Evidence |
| --- | --- |
| Native YUV to confirmed RGB | BT.709 and BT.2020-NCL, each full/limited, compared with independent matrix/range equations at the HTTP pixel endpoint. Absolute tolerance `2e-6` covers float32 conversion. Overrides deliberately disagree with retained BT.709/limited metadata. |
| Chroma placement | Encoded 10-bit 4:2:0 planar chroma ramp, sampled at an interior luma position. Left, center and top-left produce three different RGB values matching independently calculated bilinear sample coordinates within `2e-6`; each result also agrees with its downloaded cube within `1e-12`. |
| Cube application | Downloaded cube hash matches provenance. Independent red-fastest text reader and tetrahedron barycentric solve compare original-resolution output within `1e-12`. The demonstration float file is deleted before each check. |
| SDR PNG | Independent FFmpeg PNG decode equals rounded ideal BT.1886 plus sRGB equations applied to numerical Rec.709 full output. Other output/view combinations inherit the separately tested shared verifier contract. |
| Lifecycle/errors | Unknown/mismatched facts, wrong frame PTS, cancellation at the converter boundary, fresh retry, reselected frame, failed selection, decoder error, expired pixels and replaced sources. |
| Visible workflow | Upload through frame confirmation to verification; exact identity in request, no demonstration bytes, metadata override, result/pixel/cube controls, disabled Original/Split, settings/interpretation/frame invalidation, cancellation and late replies. |
| Real browser | Headless Chromium against production assets and the live Python server: local upload, six confirmations, verification, decoded result PNG, negative original-resolution source sample, expanded Escape/focus return, override invalidation and release. Inspected 1440×1000 and 390×844 screenshots; no horizontal overflow at those sizes or 200% text, and no page errors. |

Checks on Windows, FFmpeg/FFprobe 8.1.2, Colour 0.4.7, NumPy 2.4.2:

- `uv run pytest -q`: 143 passed in 88.68 seconds after all changes.
- `npm --prefix frontend test`: 33 passed.
- `npm --prefix frontend run build`: TypeScript and production build passed.
- Changed Python files pass Ruff and targeted ty. New/changed verification UI and test code pass ESLint except the four existing `App.tsx` Fast Refresh export diagnostics at unchanged lines 73, 77, 81 and 94. Prior repository-wide findings are recorded in [still verification](../still-verification.md).

## Integration

Files changed: `src/lut_builder/video.py`, `src/lut_builder/web.py`, `frontend/src/App.tsx`, `frontend/src/CameraVerification.tsx`, `tests/test_video_verification.py`, `frontend/tests/exposure-graph.test.mjs`, rebuilt static index/assets, and verification documentation. No engine/LUT mathematics or dependencies changed.

Standards review: no actionable findings against the integrated baseline or follow-up. Spec review: no blocking implementation mismatch or scope creep. Its documentation and spatial chroma coverage notes were addressed with this record and the 4:2:0 ramp regression. Both independent reviewers rechecked `2f5fbea..8f560f4` and reported no remaining findings.
