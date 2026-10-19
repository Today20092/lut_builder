# Proa evaluation for the LUT Builder web interface

Date: 2026-10-18  
Status: primary-source review; no prototype or performance comparison was run.

## Recommendation

Do not replace the current LUT Builder interface with Proa now. Proa is an
interesting Rust server-rendering framework for HTML-first sites with selective
interactive islands. LUT Builder is already a client-side React/TypeScript
application whose main job is a stateful editor and on-device LUT generation.
Moving it would require a framework and language rewrite, a hosting change, and
retaining or rebuilding browser JavaScript for capabilities Proa's current RSJS
surface does not expose. The reported server-rendering performance does not
address those costs or establish an advantage for this app.

Consider Proa for a separate, mostly static documentation or marketing surface,
or revisit if the product gains a concrete need for server rendering and a
server-hosted deployment. A small spike would then need to prove worker-based
generation, browser-side file handling, accessibility, bundle and runtime
behavior before any migration decision.

## What Proa is

Proa describes itself as a Rust web-interface framework combining compiled
server-rendered templates, routing, data loading, streaming and RSJS interactive
islands. Its normal project scaffold includes an Axum-backed app and Rust route
handlers; `proa dev` builds assets and starts the server. The project also
provides a Rust CLI, Tailwind integration and a Proa-specific component catalog.
[Proa README](https://github.com/Proa-Labs/proa#readme),
[Quickstart](https://proa.so/docs)

RSJS compiles Rust-authored components to server-rendered HTML and planned
JavaScript. Its README calls the client language intentionally smaller than
general Rust and says the feature surface is actively developed. The browser API
guide lists typed events, node refs, storage, queries and mutations, but
explicitly puts Web Workers, Canvas, WebGL, IndexedDB and several other browser
capabilities outside the current analyzed surface. Those capabilities would
need application-owned JavaScript until Proa adds typed support.
[RSJS README](https://github.com/Proa-Labs/proa/tree/main/rsjs),
[RSJS browser API guide](https://proa.so/docs/rsjs/browser-apis)

The official deployment guide builds a release binary and `public/` directory;
its described deployment targets are Railway, Coolify and self-managed Docker.
This is a server deployment model. The current LUT Builder public app is a
static GitHub Pages build, so adopting Proa for the main interface would entail
either changing the hosting model or proving a supported static export path.
[Proa deployment guide](https://proa.so/docs/framework/deployment),
[Proa Quickstart](https://proa.so/docs)

## Fit against the current app

| Concern | LUT Builder today | Proa implication |
| --- | --- | --- |
| UI runtime | React 19, TypeScript, Vite 8 and Tailwind 4. The frontend is compiled into the Python package's static assets and also deployed to GitHub Pages. | Rebuild routes and components in Rust using Proa's rendering model; add Rust toolchain/CLI/build steps and likely operate a server for the main app. |
| Main interaction | Client-side configuration-first workbench: editable Stops/IRE bands, fill zones, overlap priority, palette and setup controls. | RSJS supports signals and interaction, but these become Rust-authored islands. Existing React components and TypeScript state transitions are not reusable as Proa components. |
| LUT computation | TypeScript implementation in a dedicated Web Worker, runs on-device and downloads `.cube` files. | Web Workers are explicitly outside the current RSJS surface. Keeping the worker means retaining an application-owned JavaScript boundary; rewriting the worker in Rust does not itself resolve the Proa-to-browser Worker interface. |
| Browser files and preview | JSON setup import/export and browser-local named presets. The static app deliberately does not include camera-matched media preview/verification. | Proa's documented browser APIs include typed form/file metadata but not all browser APIs. Any future file-heavy verification path needs a capability-by-capability check; no new preview scope is justified by this framework choice. |
| Numeric trust | Browser engine is already compared against Python reference fixtures within `0.000001` per channel, with deployed generation/download checks documented. | A framework rewrite should preserve the current numerical engine or repeat the parity and acceptance work. Proa does not supply LUT/color semantics. |
| Privacy and hosting | The static build processes LUTs in the browser and sends no setup, LUT, or media to a calculation service. | A server-rendered frontend need not upload those data, but the architecture must deliberately keep generation local and maintain the current deployment/privacy guarantees. |

Local evidence: [`docs/browser-support.md`](../browser-support.md),
[`docs/research/browser-app-feasibility.md`](browser-app-feasibility.md), and
[`frontend/package.json`](../../frontend/package.json). The frontend source
implements the React workbench, plain TypeScript editor/LUT engine, worker,
worker client, schema-checked setup import and preset storage. The current
browser feature list and parity measurements are summarized in browser-support.

## Maturity, maintenance and licensing signals

At review time, GitHub showed 68 repository commits, 193 stars and 8 forks. The
Releases page listed `proa-cli v0.1.3` (October 13, 2026), a newer October 17
pre-release, and `v0.1.1`; the repository README states a Rust 1.93.0 minimum.
These are useful activity signals, but the 0.1.x CLI and actively developed
RSJS surface indicate a young framework with evolving interfaces. Its README
identifies one production project, latency.so. These repository numbers and
release listings are a time-specific snapshot, not a quality judgment.
[Repository overview](https://github.com/Proa-Labs/proa),
[Releases](https://github.com/Proa-Labs/proa/releases),
[RSJS status](https://github.com/Proa-Labs/proa/blob/main/rsjs/STATUS.md)

Proa's repository README states Apache-2.0 and permits commercial use, including
inside closed-source products, without a separate agreement. The repository
also contains third-party notices, so any adoption still needs the usual
dependency/license inventory. No licensing blocker surfaced in this review.
[Proa README license section](https://github.com/Proa-Labs/proa#license),
[Third-party notices](https://github.com/Proa-Labs/proa/blob/main/THIRD_PARTY_NOTICES.md)

## Bottom line

Proa's strongest fit is server-rendered, content-heavy pages where sending less
JavaScript matters. LUT Builder's interface is already a static, interactive
editor with a worker-backed numeric core; its main constraints are correctness,
editing behavior and deployment simplicity. The switch would add a Rust/SSR
stack and preserve custom JavaScript seams, while replacing a working and
verified frontend. Keep the current React/Vite app. Re-evaluate Proa only against
a concrete SSR requirement or as a distinct documentation/marketing site.
