# Video frame selection, ticket 37

Implemented on `codex/workbench-ticket-5` from `c944573fe15fbdecfd25b6632b83518a956fbfbc`, after blocker 34. Scope: [ticket 37](https://github.com/Today20092/lut_builder/issues/37) under [specification 33](https://github.com/Today20092/lut_builder/issues/33).

## Behavior

Choose video uploads bytes only to the token-protected loopback server. FFprobe indexes the first non-cover-art video stream's decoded presentation frames. Relative zero is that stream's first decoded PTS. A request selects the first frame whose exact rational relative time is at least the request; previous/next uses adjacent decoded ordinals. Extraction decodes from the start with `select=eq(n,index)`, `-copyts`, no autorotation, and `-fps_mode passthrough`. It never seeks through browser video, calculates frames from average FPS, or substitutes the last frame for a beyond-end request.

The UI shows actual decimal and rational time, ordinal, PTS, time base and first PTS. Stream and frame metadata are shown separately, with missing values marked unknown. There is no camera-profile inference. Supported frame color tags take precedence over stream tags for the demonstration. Missing/unsupported matrix, range and chroma tags use explicitly unconfirmed BT.709, limited and left assumptions. The separate assumptions disclosure records the actual conversion.

The image is an illustration of encoded RGB, clipped/quantized and tagged sRGB. No gamma, gamut, viewing transform or LUT is applied before that illustration. Log/HDR signals therefore are not a neutral reference view. Original/Split/Band colors remain demonstration comparisons. The image and its overlay cannot establish camera exposure or exported-LUT agreement.

## Retained source and ticket 6 integration

`WorkspaceServer.videos` is the per-launch `VideoStore`. `get(source_id)` rejects replaced/cancelled sources. Under `with session.operation():`, consumers can inspect `session.selected` and `session.root`. The lock prevents source mutation while a consumer reads it; consumers must check the requested frame identity against `selected['frame']`. A failed new extraction clears `selected`, so an old UI image cannot establish a valid server selection. Honor `session.check()` during subsequent processing and discard client responses after source/settings changes.

- `input`: original uploaded container, retained for any required re-decode.
- `source.raw`: one full-resolution native planar Y, Cb, Cr frame. 8-bit samples are bytes; 10-bit samples are little-endian unsigned 16-bit words with native subsampling. No matrix, range or transfer conversion is applied. `selected['source']` describes dimensions, pixel format, component depth and SHA-256.
- `selected.json`: frame identity, separate container/stream/frame metadata and decoding provenance, including FFmpeg/FFprobe versions, stream index and exact demonstration conversion filter.
- `demonstration.gbrpf32le`: planar G, B, R float32 little-endian encoded RGB produced by zscale with the disclosed, unconfirmed matrix/range/chroma settings. This buffer preserves excursions in the tested path, but is not a confirmed verification input.
- The response's `display` is an 8-bit PNG data URL. Never use it or browser canvas as the verification source.

Ticket 6 should decode `source.raw` using confirmed matrix/range/chroma settings, then call the shared still-verification function with high-precision RGB and this frame identity. Transfer/gamut confirmation and actual serialized-cube processing remain in that ticket. This module contains no LUT math. Rebuild production frontend assets after integrating overlapping `App.tsx` and server changes.

## Bounds and cleanup

Supported container demuxers: MP4/MOV and Matroska. Supported codecs: H.264, HEVC, ProRes, FFV1. Accepted pixels: `yuv420p`, `yuv420p10le`, `yuv422p10le`. Other decoder outputs fail explicitly. Only even, square-pixel, progressive, unrotated video up to 1920×1080 is accepted. RAW, interlacing, changing dimensions/pixel format, dynamic HDR/Dolby Vision, and missing or non-increasing PTS are rejected. No HDR tone mapping or calibrated display support is claimed.

- Upload cap: 256 MiB, 60 seconds total, 2 seconds stalled socket read.
- Clip cap: 120 seconds between first/last PTS, 10,000 decoded frames. Initial indexing scans from the start and may be slow; there is no approximate seek optimization.
- Each FFmpeg/FFprobe invocation: 60 seconds, 64 MiB maximum individual FFmpeg allocation, two decoder threads, one filter/output thread. Probe output is capped at 16 MiB, raw output at 32 MiB, stderr at 1 MiB, checked every 50 ms. These are allocation/output/time limits, not a hard operating-system RSS quota.
- One source per app launch, shared across tabs. Starting a replacement cancels and waits for prior work before allocating a new session. Concurrent operations on one source fail with a wait/cancel message.
- Cancel, release, replacement and server close remove temporary storage. A running process is killed and reaped before its operation releases files; Windows cancellation terminates the process tree to handle Chocolatey launcher descendants. Disconnected pages send best-effort cancellation; 15 idle minutes plus the 30-second sweep interval bounds abandoned sessions. A forced OS process kill cannot guarantee cleanup, unlike normal server shutdown.

Only local uploaded handles are accepted; client paths are never used. FFmpeg protocols are restricted to file input, demuxers are allowlisted, and subprocesses use argument arrays without a shell. Missing FFmpeg/FFprobe, decoders or zscale return actionable errors. Failed imports cancel their session. Frame-request failures preserve the last displayed image with an explicit error, while invalidating any incomplete server extraction.

## Verification on 2026-09-07

FFmpeg/FFprobe 8.1.2 on Windows. Deterministic synthetic fixtures, not manufacturer camera recordings:

- H.264 8-bit MP4: B-frames, VFR PTS at 5.0, 5.1, 5.3 and 5.6 seconds. Request 0.11 selects exactly 0.3; adjacent steps and beyond-end rejection pass. Selected native pixels match an independent full sequential decode.
- H.264 10-bit MOV, HEVC 10-bit MOV and ProRes 422 10-bit MOV: probe/extract/display smoke checks pass.
- FFV1 10-bit 4:2:2 Matroska: retained YCbCr equals the source bytes exactly for full and limited range. Limited-range neutral 0/1023 samples convert to -64/876 and 959/876 within 2e-6; full-range samples convert to 0/1 within 2e-6. Float and native buffers are separate from display clipping. Fixture tagging uses `setparams` to avoid FFmpeg's automatic unknown-matrix conversion when constructing test files.
- Public HTTP tests cover authentication, invalid timestamps/media, missing tools, processing timeout, cancellation during an incomplete upload, source replacement, and cleanup on cancellation and normal shutdown.
- Existing Node/jsdom tests exercise upload, visible selected identity, next-frame requests, cancellation and rejection of late responses after release. They retain the demonstration comparison tests.
- Real headless Chromium against the Python server and production assets passed upload, 0.11→0.3 selection, previous/next, beyond-end feedback, nonempty decoded canvas, 390px layout, expanded dialog Escape/focus return, and release. No page errors. Wide and narrow screenshots were visually inspected.

Commands: `uv run pytest -q`, `npm --prefix frontend test`, `npm --prefix frontend run build`, `uvx ruff check src/lut_builder/video.py src/lut_builder/web.py tests/test_video.py`, `uvx ruff format --check src/lut_builder/video.py tests/test_video.py`, `uvx ty check src/lut_builder/video.py src/lut_builder/web.py`.

Results: full Python suite 68 passed; frontend tests 28 passed; production build and changed-file Ruff/ty checks passed. The standards review caught a process-reaping failure path when Windows tree termination fails; it is fixed and covered by the HTTP timeout test. Final standards and ticket-scope reviews have no outstanding findings.

## Changed files

- `src/lut_builder/video.py`: bounded decoding, exact selection, native source storage, display encoding and session lifecycle.
- `src/lut_builder/web.py`: authenticated upload/control routes and server shutdown cleanup.
- `frontend/src/App.tsx`: video chooser, time/navigation controls, reported facts, assumptions and cancellation.
- `tests/test_video.py` and `frontend/tests/exposure-graph.test.mjs`: public server and visible UI regression coverage.
- `src/lut_builder/static/index.html` and hashed JavaScript/CSS assets: rebuilt production UI.
- This verification and integration record.

The pre-existing ESLint and whole-repository ty findings are recorded in [Workbench verification](workbench.md). This ticket does not migrate the independent Astral workflow changes. Tests requiring actual FFmpeg/FFprobe skip explicitly when tools are absent. Tool builds without the fixture encoders may fail those tests; production import requires the corresponding decoders and zscale.
