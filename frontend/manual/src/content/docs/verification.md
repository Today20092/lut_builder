---
title: Verify camera media
description: Check a supported still or selected video frame against the exact serialized LUT.
---

Camera verification applies the serialized cube to original-resolution camera samples using tetrahedral interpolation, then creates an SDR image for your screen. It checks this processing path; it does not identify the camera encoding automatically or certify sensor exposure.

The exposure diagram is different: it illustrates settings. The local Workbench's demonstration photograph is also illustrative and never substitutes for failed camera verification.

## Browser stills

1. In **Preview and camera verification**, choose **Still** and **Choose camera still**.
2. Use an untagged, non-interlaced 16-bit RGB PNG without alpha, or a float32 RGB PFM. Export unchanged camera RGB without a viewing transform. JPEG, RAW, and ordinary 8-bit screenshots are not suitable.
3. Select the source transfer function and gamut to match both the file's known recording/export path and **Camera recording**. Confirm the range and source facts using the checkboxes shown. A file extension cannot establish these facts.
4. Choose the verification action once it is enabled. Read the status and provenance before interpreting the image.

Limits: 4,194,304 decoded pixels and 48 MiB plus header. Unsupported tags, pixel formats, or interpretations are rejected rather than converted silently.

## Browser video

Choose **Video**, select the file, enter **Seek time (seconds from stream start)**, and choose **Inspect video**. The browser inspects a one-second interval. **Frame in inspected interval (from 0)** selects a decoded frame within it; **Previous frame** and **Next frame** move within that interval. Inspect another time to move elsewhere in the clip. Reported PTS and time base identify the actual selected frame; requested time is not an exact frame index.

Confirm all of the following using recording/export knowledge:

| Control | What it describes |
| --- | --- |
| Source transfer | The camera log curve, not the target display transfer. |
| Source gamut | The camera RGB primaries; must match the selected profile. |
| YCbCr matrix | Conversion of the video's luma/chroma samples to RGB; separate from camera gamut. |
| Signal range | Full or limited YCbCr code range. Metadata may say `pc` for full or `tv` for limited. |
| Chroma location | Where subsampled color samples sit: left, center, or top-left. |
| Bit depth | Must match the inspected video. |
| Confirmation checkbox | Confirms the recording/export facts; changing the selection requires confirmation again. |

Then verify the selected frame. Reported transfer/primaries can disagree with the chosen interpretation, especially for proxies. That warning is not proof that the tags are wrong: check whether the export transformed the image before overriding their implication.

Supported codecs are H.264, HEVC, ProRes 422, and FFV1 with supported planar 4:2:0 8/10-bit or 4:2:2 10-bit layouts. Limits are 512 MiB, five minutes, progressive square pixels, and 4,194,304 decoded pixels. Rotation, HDR paths, and unsupported layouts are rejected. A supported container extension alone does not guarantee a supported stream.

## Read and retain the result

The verified image is a display conversion of the cube output, not raw RGB codes painted directly onto the screen. Legal output is expanded, target-encoded values are decoded, target primaries are converted for the SDR view, and the image is encoded for display. There is no tone mapping or highlight recovery.

Click a point in the checked image to inspect its original-resolution coordinates and **source RGB**, **LUT output RGB**, and **display RGB**. They are different stages, so their numbers need not match. Use **Expand** (or F with the preview focused) for a larger view; Escape closes it.

Provenance reports the interpretation, dimensions/frame identity, interpolation, display policy, cube hash, and any warnings. **Download checked .cube** saves the exact serialized artifact used for the check. Editing the setup or source invalidates the old result; verify again before treating it as evidence for the new settings.

**Original/Split** camera comparison is unavailable because no camera-to-SDR reference viewing transform has been established. This limitation is separate from the local demonstration comparison.

## Progress, cancellation, and privacy

The browser downloads its roughly 32 MiB decoder from this site when needed. Verification can take minutes. **Cancel** releases the worker; **Release source** clears the selected media. Media and LUT processing stay on your device. A decoder download still needs a working site connection; this is not a promise of offline availability.

If verification fails, read the status, correct the format or interpretation, then retry. The app does not quietly substitute a demonstration image. See [troubleshooting](../troubleshooting/#verification-is-disabled-or-fails).

## Local Workbench differences

The optional Python Workbench runs at `http://127.0.0.1:8765/` and offers **Demonstration** and **Camera-matched** preview paths. Demonstration controls select an image or local demonstration video, Original/Split/False color, split position, and expanded view. They illustrate palette appearance, not original camera exposure or the sampled cube.

Local camera-matched verification uses the local server and its still/video selectors rather than the browser's one-second inspection workflow. PNG needs local FFmpeg; video needs FFmpeg and FFprobe. Its source confirmations, actual-cube provenance, pixel inspection, and checked download serve the same purpose. For the exact local format contracts and frame-selection behavior, use the [local still guide](https://github.com/Today20092/lut_builder/blob/main/docs/still-verification.md) and [local video guide](https://github.com/Today20092/lut_builder/blob/main/docs/testing/video-verification.md).

The repository's [browser support matrix](https://github.com/Today20092/lut_builder/blob/main/docs/browser-support.md) records tested codecs, browser coverage, and deferred physical-device checks.
