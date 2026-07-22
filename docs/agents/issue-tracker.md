# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: use `gh issue list` with suitable state and label filters
- **Comment**: `gh issue comment <number> --body "..."`
- **Apply/remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill conventions

- “Publish to the issue tracker” means create a GitHub issue.
- “Fetch the relevant ticket” means run `gh issue view <number> --comments`.

## Wayfinding operations

A wayfinder map is one GitHub issue with child issues as tickets.

- Label maps `wayfinder:map`.
- Label child tickets `wayfinder:<type>`.
- Represent blocking with GitHub issue dependencies, falling back to a `Blocked by:` line.
- Claim work with `gh issue edit <number> --add-assignee @me`.
- Resolve by commenting with the answer, closing the issue, and updating the map.
