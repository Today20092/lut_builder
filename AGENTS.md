# Repository guidance

LUT Builder generates diagnostic false-color scene-exposure LUTs through a Python
CLI and a local browser workspace. Python implementation and bundled browser assets
live in `src/lut_builder/`; editable browser source lives in `frontend/`.

Before exploring code or changing domain behavior, read
[domain guidance](docs/agents/domain.md), including `CONTEXT.md` and relevant ADRs
when present.

### Python workflow

Use the complete Astral Python workflow for this repository:

- Use `uv` for Python versions, environments, dependencies, and commands.
- Run project commands through `uv run` and keep `uv.lock` in sync with dependency changes.
- Run `uv run ruff format --check .`, `uv run ruff check .`, and `uv run ty check` before handing off Python changes.
- Use `uv run ruff format .` to apply formatting when needed.

### Setup and verification

From the repository root, install locked Python dependencies with `uv sync --locked`.
Run `uv run pytest -q` before handing off Python changes, alongside the quality
checks above. For a focused run, use `uv run pytest -q tests/test_setup.py`, replacing
the path with the affected test file. CI's Python checks are defined in
[python.yml](.github/workflows/python.yml).

For frontend changes, run these commands from `frontend/`:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

The build checks TypeScript and regenerates `src/lut_builder/static/`; include the
rebuilt assets with frontend changes. Edit browser source in `frontend/`.

For workspace behavior or browser acceptance checks, read
[integration verification](docs/testing/integration.md) for launch commands,
browser prerequisites, and persistent-palette behavior. For still or video
verification changes, read [still verification](docs/still-verification.md) or
[video verification](docs/testing/video-verification.md), respectively. Media
verification requires local FFmpeg/FFprobe; report unavailable tools and skipped
checks explicitly.

### LUT behavior and contributions

Before changing camera profiles, diagnostic outputs, or LUT semantics, read
[Contributing.md](Contributing.md) for source evidence, numerical coverage, range
conventions, and PR requirements. Keep generated LUTs and saved setup files out of
commits, as specified by `.gitignore`.

### Issue tracker

For issue or PRD operations, follow [issue-tracker guidance](docs/agents/issue-tracker.md).
Issues are tracked in GitHub Issues; external pull requests are not a triage surface.

### Triage labels

When triaging or applying canonical role labels, use
[triage labels](docs/agents/triage-labels.md).
