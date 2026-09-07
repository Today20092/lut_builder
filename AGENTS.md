## Agent skills

### Python workflow

Use the complete Astral Python workflow for this repository:

- Use `uv` for Python versions, environments, dependencies, and commands.
- Run project commands through `uv run` and keep `uv.lock` in sync with dependency changes.
- Run `uv run ruff format --check .`, `uv run ruff check .`, and `uv run ty check` before handing off Python changes.
- Use `uv run ruff format .` to apply formatting when needed.

### Issue tracker

Issues are tracked in GitHub Issues; external pull requests are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels use their default names. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context layout. See `docs/agents/domain.md`.
