#!/bin/sh
# One command for every fast check. Use `scripts/check.sh --full` to add tests and the build.
set -e
cd "$(dirname "$0")/.."
uv run ruff format --check .
uv run ruff check .
uv run ty check
(cd frontend && pnpm format:check && pnpm lint && pnpm exec tsc -b)
if [ "$1" = "--full" ]; then
  uv run pytest -q
  (cd frontend && pnpm test && pnpm build)
fi
