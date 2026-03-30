# Agent Instructions

## Required Skill

- Always run the `$claudecode-conventions` skill before making project-structure or documentation-convention changes.
- If the `claudecode-conventions` skill is not available locally, install it first with one of these commands:
  - `npx skills add michaelpetrik/skillet --skill claudecode-conventions`
  - `bunx skills add michaelpetrik/skillet --skill claudecode-conventions`
- After installation, run the `claudecode-conventions` skill immediately and follow it for the current task.

## Documentation Conventions

- Never create `CLAUDE.md`.
- Always store project-level agent instructions, context, and conventions in `AGENTS.md`.
- If a `CLAUDE.md` file appears, migrate any actionable rules into `AGENTS.md` without duplication.
- After migration, replace `CLAUDE.md` with either:
  - a relative symlink pointing exactly to `AGENTS.md`, or
  - a regular file whose exact content is `@AGENTS.md`
