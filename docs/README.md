# Documentation map

Use the [browser manual](https://today20092.github.io/lut_builder/docs/) while
editing a LUT. The files here provide local-tool instructions, technical conventions,
source evidence, and dated acceptance reports.

> **Start with your task.** The manual explains what to do; research explains why;
> acceptance reports record what was checked on a particular date. A historical
> result is not a guarantee for every camera, monitor, browser, or future build.

## Use and understand LUT Builder

| Task | Guide | What to look for |
| --- | --- | --- |
| Run the local tools or contribute | [User and development guide](guide.md) | Setup, CLI, pipeline, project layout |
| Choose Full or Legal | [Output range](output-range-guide.md) | Separate input interpretation from output packing |
| Compare Stops and IRE | [Camera-log IRE](camera-log-ire.md) | Measurement basis, gray references, legacy setups |
| Build a reusable palette | [Exposure palettes](exposure-palettes.md) | Fixed reference, color blending, apply versus preview |
| Edit without dragging | [Keyboard shortcuts](keyboard-shortcuts.md) | Focus, graph controls, numeric alternatives |
| Check camera media | [Still verification](still-verification.md) · [Video verification](testing/video-verification.md) | Supported sources, interpretation, checked cube |
| Choose a browser workflow | [Browser support](browser-support.md) | Supported features, limits, physical-device gaps |

## Follow the evidence

| Question | Evidence |
| --- | --- |
| How are transforms and sampled LUTs validated? | [False-color correctness](research/false-color-lut-correctness.md) |
| Do warning colors establish sensor clipping? | [Sensor-clipping limits](research/sensor-clipping-monitoring-lut.md) |
| What is special about Blackmagic input? | [Film Gen 5 profile](research/blackmagic-film-gen5-profile.md) |
| What can a preview establish? | [Preview fidelity](research/preview-fidelity.md) · [Video frames](research/video-frame-preview.md) |
| Why compute in the browser? | [Feasibility](research/browser-app-feasibility.md) · [Computation options](research/browser-computation-options.md) |

## Reproduce acceptance checks

| Area | Report / instructions |
| --- | --- |
| Manual, search, links, responsive layout | [Manual acceptance](testing/manual.md) |
| Integrated local workspace | [Integration](testing/integration.md) · [Workbench](testing/workbench.md) |
| Mobile editor | [Mobile workflow](testing/mobile-workflow.md) |
| Palette persistence and editing | [Custom palettes](testing/custom-palettes.md) |
| Video selection and verification | [Video frames](testing/video-frames.md) · [Video verification](testing/video-verification.md) |

## Maintain the docs

The published manual is authored in
[`frontend/manual/src/content/docs/`](../frontend/manual/src/content/docs/).
Its shared styles cover every topic; diagrams are self-contained HTML with inline
SVG in [`frontend/manual/public/diagrams/`](../frontend/manual/public/diagrams/).
See [documentation design](design.md) for the visual conventions.

Contributor and agent instructions stay separate:
[Contributing](../Contributing.md), [domain](agents/domain.md),
[issue tracker](agents/issue-tracker.md), and [triage labels](agents/triage-labels.md).
