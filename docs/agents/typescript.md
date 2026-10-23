# TypeScript and Effect conventions

Use these conventions for maintained application code in `frontend/src/`.
The frontend verification commands remain in [AGENTS.md](../../AGENTS.md).

Use Effect 4.0.5 as the standard. Consult current Effect 4 documentation before
using its APIs; Effect 3 examples are not a substitute.

- Use `Schema` at untrusted JSON boundaries and `Data.TaggedError` for failures
  shown to users.
- Wrap Promise APIs with `Effect.tryPromise` and callback APIs, including workers
  and `FileReader`, with `Effect.callback`.
- Run effects at the React/browser boundary and connect cancellation with
  `AbortSignal`.
- Keep `editor.ts` state transitions, LUT/color calculations and data, and
  presentational components as plain TypeScript; they stay pure or describe
  React/DOM rendering.
- Use `Context.Service` and `Layer` when dependencies need shared provisioning or
  replacement; keep one-off browser APIs at their Effect boundary.
