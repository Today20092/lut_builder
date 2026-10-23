# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Prefer the connected GitHub
tools for supported operations. Use the `gh` CLI when the connector lacks the
required operation or is unavailable; the examples below describe that route.

Before using the CLI, check `gh --version` and `gh auth status`. It requires an
installed GitHub CLI authenticated for this repository. If neither route is
available, report the blocked operation and preserve any prepared draft locally.
Tool availability does not authorize posting or changing issues by itself.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: use `gh issue list` with suitable state and label filters
- **Comment**: `gh issue comment <number> --body "..."`
- **Apply/remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; pass its owner/name to connector tools.
The CLI infers it automatically inside the clone. Keep multiline bodies in a
structured connector argument or a UTF-8 file passed with `--body-file`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill conventions

- “Publish to the issue tracker” means create a GitHub issue.
- “Fetch the relevant ticket” means read the issue and its comments through the
  connector or `gh issue view <number> --comments`.

## Wayfinding operations

A wayfinder map is one GitHub issue with child issues as tickets.

- Label maps `wayfinder:map`.
- Label child tickets `wayfinder:<type>`.
- Represent blocking with GitHub issue dependencies, falling back to a `Blocked by:` line.
- Claim work with `gh issue edit <number> --add-assignee @me`.
- Resolve by commenting with the answer, closing the issue, and updating the map.
