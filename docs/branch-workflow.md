# Git workflow

`main` is the only long-lived branch and the remote default. Each task gets its
own branch and pull request into `main`; there is no integration branch and no
stacked PRs. Version selection and publication follow
[the release policy](releasing.md).

## Work on a task

1. Work in a worktree the host manages, based on current `origin/main`. A T3
   Code thread on the main checkout moves itself with `t3_worktree_handoff`
   before editing; the project's worktree scripts run `uv sync` and
   `pnpm --dir frontend install --frozen-lockfile`. Without host worktree tools,
   use `git worktree add` and run both. Agent branches use `codex/<scope>`.
2. Commit work in progress instead of using `git stash`: stashes are shared by
   every worktree.
3. Make the change and run the Python and frontend checks in
   [AGENTS.md](../AGENTS.md). Frontend work also requires the
   [UI quality review](testing/ui-quality.md) for layout or control changes;
   follow [integration acceptance](testing/integration.md) for workspace
   behavior. Rebuild bundled browser assets after frontend changes.
4. End every code task with a commit and a pull request to `main`, without
   being asked. Opening a PR is safe; only a merge deploys.
5. Watch the PR's checks and fix failures until **CI checks** passes.
6. Merge only when the user asks, with a merge commit (the only method
   enabled). To merge without waiting, queue it with
   `gh pr merge --auto --merge`; GitHub merges once **CI checks** passes.

Fetch before choosing a base. Use `git pull --ff-only` to advance a local
`main`; inspect divergent histories and merge deliberately, preserving local
commits. Never force-push `main`.

Several PRs at once: `main` does not require a PR to be current with it, so
each PR merges once its own checks pass. The push to `main` reruns the full
gate before Pages deploys; a failure there stops the deploy, and the fix goes
forward in a new PR.

## CI and publication effects

| Event | Effect |
| --- | --- |
| PR targeting `main` | `deploy-pages.yml` selects checks for affected Python, frontend, published manual and shared boundaries, with a stable aggregate `CI checks` status. Configuration/dependency/unknown changes select the full suite. |
| Push to `main` | Runs Python once, frontend lint/test/build and browser/manual acceptance, then Pages deploys the built website and manual. |
| Push to a feature branch | Backup only; open/update a PR or manually dispatch Pages on that ref for validation. |
| Manual Pages workflow | Runs the checks; deployment is allowed only when the selected ref is `main`. |
| Manual Python workflow | Runs Python quality/tests and browser/Python numerical parity independently when needed. |
| Monthly Dependabot | One grouped minor-and-patch PR per ecosystem (uv, frontend npm, Actions), majors one PR each, 7-day cooldown. [Auto-merge](../.github/workflows/dependabot-auto-merge.yml) merges minor and patch PRs once `CI checks` passes, then dispatches Pages on `main`, since a bot merge creates no push event. Majors wait for a person. |
| Version tag | No configured checks, package publication or GitHub Release automation. Validate the source through Pages before tagging. |

See [CI selection](testing/ci.md) for the mapping, conservative fallback and
required-status guidance.

## Repository controls

`main` requires a pull request, the `CI checks` status and resolved
conversations; rules apply to administrators, and force pushes and deletion are
blocked. It does not require branches to be up to date: Pages deploys only
after the full gate passes on the merged commit. Auto-merge is allowed and
merged branches are deleted automatically. The `development` branch was
retired on 2026-11-21 with no commits that `main` lacked.

## Cleanup

GitHub deletes a merged PR's branch. Remove the task's worktree through the host
(or `git worktree remove`) once it has no uncommitted or unmerged work.
