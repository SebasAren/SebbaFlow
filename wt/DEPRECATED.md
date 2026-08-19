# Deprecated: Worktrunk (wt) Package

This stow package is deprecated. The project uses plain git.

- The `wt` CLI is no longer used
- Git worktrees are no longer used for parallel work
- Commits use plain `git commit` with conventional messages; the pre-commit hook at `.githooks/pre-commit` runs `mise run pre-commit`

This directory is kept for reference only. Do not `stow wt`.
