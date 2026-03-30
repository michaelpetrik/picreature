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
