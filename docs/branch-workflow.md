# Git workflow

This is the canonical collaboration and promotion policy. Version selection and
publication follow [the release policy](releasing.md).

## Branch roles

- `development` is the ordinary working and integration branch. Sequential work
  can be committed here without a feature PR back to the same branch.
- `main` is the reviewed release-source branch and remote default. Its pushes
  deploy the website after CI passes; promotion therefore authorizes a website
  deployment as well as source integration.
- Parallel work uses temporary `codex/<scope>` branches and worktrees from current
  `development`. External contributions use PRs targeting `development`.

Keep useful checkpoints and push `development` regularly as a backup when the
task authorizes pushing. A backup is not verification or a release. Preserve
unrelated working files and existing worktrees.

## Synchronize and integrate

Start with `git status --short`, `git worktree list` and `git fetch origin`.
Commit or otherwise preserve work before switching to a different source state.
On `development`, use `git pull --ff-only` when the tracked remote is ahead.
If histories diverge, inspect both sides and merge deliberately; preserve local
commits and resolve conflicts rather than resetting or force-pushing.

Merge finished scoped work into `development` and verify the combined source.
Any subsequent feature-branch correction needs another integration and relevant
checks. Rebuild bundled browser assets after integrating frontend changes; a
source merge does not rebuild an already packaged artifact.

Use the Python and frontend check commands in [AGENTS.md](../AGENTS.md).
Frontend work also requires the [UI quality gate](testing/ui-quality.md) for
layout, controls or baseline changes. Follow
[integration acceptance](testing/integration.md) for workspace behavior and its
linked media checks when applicable. Record results and omissions against the
combined commit, rather than treating an isolated branch's results as sufficient.

## Promote a tested batch

1. Fetch and integrate any main-only fixes or release metadata into `development`
   with an ancestry-preserving merge. Resolve conflicts retaining reviewed
   behavior, then run the affected checks on the combined source.
   Done: `main` is an ancestor of the development commit being proposed.
2. Prepare a `development` → `main` PR when promotion is authorized. Record its
   source SHA, verification results, artifact identities, material changes and
   known limitations. Keep any tested artifacts that later builds would replace.
   Done: the reviewed commit and its evidence are identifiable.
3. After review and passing Python, build/browser and full UI checks, merge using
   **Create a merge commit**. Squash and rebase merging are disabled for this
   repository to preserve promotion ancestry. Done: the reviewed source is in
   `main` and the resulting Pages deployment has been checked.
4. Merge `main` back into `development` before the next batch. This also applies
   to urgent main-only fixes. Done: development contains the release merge and
   all main-only changes; rebuild affected local artifacts before using them.

PR creation, merging, deployment, tagging and package publication require scope
covering those actions. Workflow setup alone does not authorize a promotion.

## CI and publication effects

| Event | Effect |
| --- | --- |
| PR targeting `development` or `main`, or push to `main` | `deploy-pages.yml` runs Python once, frontend lint/test/build, browser/manual acceptance, and the reusable full UI gate across three parallel shards. |
| Push to `development` or a feature branch | Backup only; open/update a PR or manually dispatch Pages on that ref for validation. |
| Successful push to `main` | Pages deploys the built website and manual. |
| Manual Pages workflow | Runs the checks; deployment is allowed only when the selected ref is `main`. |
| Manual UI-quality workflow | Runs the selected UI suite; the visual-only mode does not replace the full gate. |
| Manual Python workflow | Runs Python quality/tests and browser/Python numerical parity independently when needed. |
| Version tag | No configured checks, package publication or GitHub Release automation. Validate the source through Pages before tagging. |

The workflows live in [.github/workflows](../.github/workflows). Branch protection
and rulesets are separate GitHub settings; CI triggers do not enforce PR review
or block direct pushes by themselves.

## Cleanup

Retire temporary branches/worktrees only after their changes are integrated and
uncommitted files, unmerged commits, ignored files and required artifacts have
been accounted for. Use the managed-worktree archive operation for app-managed
worktrees. Keep `development`, `main` and unrelated work. Remote deletion and
history rewriting need explicit authorization covering the operation.

## Migration record: 2026-10-23

The starting source was `f0aeb0ebc9923727b4a591a68ef84fa9665e7601`, shared by
local and remote `main`. Development starts from that source, preserving history;
the primary checkout's unfinished frontend edits travel with it and remain
outside the workflow setup commit. The four pre-existing detached worktrees are
retained. No open PRs needed retargeting at migration inspection.

`main` remains the remote default. Repository merge options were changed to allow
merge commits only. Automatic head-branch deletion remains off so promotion does
not retire `development`. No classic branch protection rules were listed, and
the existing `protect` ruleset was disabled. Those settings are retained: the
reviewed promotion route is policy, not an enforced block on direct main pushes.
