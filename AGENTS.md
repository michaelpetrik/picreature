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

## Repository Overview

- `picreature` is a local internal studio for converting a single uploaded portrait into a unified branded portrait set using the Gemini image editing API.
- The app returns 4 portrait candidates, preserves subject identity, and keeps jobs only temporarily under `.cache/picreature/jobs`.
- This is intentionally a local tool without auth, persistent gallery, or multi-user workflow.

## Stack

- Framework: Next.js 16 App Router with React 19 and TypeScript.
- Gemini client: `@google/genai`.
- Validation/utilities: `zod`, custom server helpers in `lib/server`.
- Tests: `vitest`.
- Main commands:
  - `npm run dev`
  - `npm test`
  - `npm run build`
  - `docker compose up --build`

## Environment And Runtime

- The critical environment variable is `GEMINI_API_KEY`.
- The home page passes `envFileHint=".env.local"` and expects local development setup through `.env.local`.
- Style references live in `references/` as:
  - `style-reference-1.jpg`
  - `style-reference-2.jpg`
  - `style-reference-3.jpg`
- The app can run without those reference images, but generation consistency becomes weaker and the UI/server will emit warnings.

## Product Behavior

- Upload flow starts in the single-page studio UI at `app/page.tsx` and `components/studio.tsx`.
- Portrait generation uses a locked preset from `lib/config/portrait-preset.ts`.
- The current preset is `brand-portrait-v1` with:
  - `4:5` aspect ratio
  - 4 output candidates
  - identity-preserving prompt and visual guardrails
  - brand background and wardrobe normalization rules
- Model fallback order is:
  - `gemini-3-pro-image-preview` (`Nano Banana Pro`)
  - `gemini-3.1-flash-image-preview` (`Nano Banana 2`)
  - `gemini-2.5-flash-image` (`Nano Banana`)

## Architecture Map

- `components/studio.tsx`: main client UI, upload form, polling, localStorage restore of active jobs, and status rendering.
- `app/api/portrait/jobs/route.ts`: creates a job from uploaded form data.
- `app/api/portrait/jobs/[jobId]/route.ts`: reads job status and re-schedules unfinished jobs.
- `app/api/portrait/jobs/[jobId]/regenerate/route.ts`: clones a previous source upload into a new job.
- `app/api/portrait/files/[jobId]/[variantId]/route.ts`: serves generated image previews/downloads.
- `app/api/diagnostics/models/route.ts`: Gemini model self-check endpoint.
- `lib/server/portrait-job-runner.ts`: executes generation, writes variants, marks `completed` or `failed`, and deduplicates concurrent scheduling.
- `lib/server/portrait-job-store.ts`: persisted job JSON records, TTL cleanup, mapping records to API responses.
- `lib/server/portrait-gemini.ts`: Gemini integration, prompt construction, fallback chain, self-check, and generated image extraction.
- `lib/server/portrait-errors.ts`: normalized retryability and UI-facing error information.
- `lib/server/portrait-storage.ts`: `.cache` job directories and file IO helpers.
- `lib/server/portrait-utils.ts`: upload validation, dimensions, IDs, and filename sanitization.

## Job System Notes

- Jobs are persisted on disk, not in a database.
- Background work is intentionally resumed via server-side scheduling when jobs are created or polled.
- The UI stores the active `jobId` in browser storage so refresh restores in-progress or completed output.
- `Regenerate` must create a brand new job from the previous source image instead of mutating the old job.
- When changing job lifecycle code, preserve:
  - `queued -> running -> completed/failed` transitions
  - restore-after-refresh behavior
  - safe re-scheduling of unfinished jobs
  - deduplication so the same job is not generated twice concurrently

## Refactoring Plan

- Aktuální refactoring checklist je v [`docs/refactoring-plan.md`](docs/refactoring-plan.md).
- Před implementací libovolného bodu z plánu si přečti celý dokument pro kontext.
- Po dokončení bodu zaškrtni příslušný checkbox v checklistu.

## Editing Guidance

- Keep the single-studio workflow simple; this repo currently assumes one primary UI at `/`.
- Preserve the locked preset/product intent unless the task explicitly asks to change portrait style rules.
- Do not introduce persistent storage, auth, or background infrastructure unless the task explicitly requires it.
- Keep API keys server-side only.
- If you change model fallback behavior, also update user-facing diagnostics and warnings so setup failures remain understandable.
- If you change job or polling behavior, verify both `npm test` and `npm run build`.

## Testing And Verification

- Existing tests cover prompt/preset assumptions, upload validation, job-store cleanup, and job-runner scheduling.
- Run `npm test` for unit coverage.
- Run `npm run build` after touching route handlers, TypeScript types, or client/server integration.
- `CHANGELOG.md` is generated by `scripts/generate-changelog.mjs`; use:
  - `npm run changelog`
  - `npm run changelog:check`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **picreature** (334 symbols, 742 relationships, 26 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/picreature/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/picreature/context` | Codebase overview, check index freshness |
| `gitnexus://repo/picreature/clusters` | All functional areas |
| `gitnexus://repo/picreature/processes` | All execution flows |
| `gitnexus://repo/picreature/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
