# Changelog

## 2026-03-30

### Added
- scaffolded the application as a `Next.js + TypeScript` project
- added a Gemini-backed portrait job pipeline with upload validation, temp job storage, model fallback, diagnostics, and human-readable error handling
- added a minimalist portrait studio UI with drag and drop upload, input preview, prompt controls, setup overlay, retry/setup status badges, and result polling
- added Docker packaging, health endpoint, environment template, reference image placeholders, and Czech setup instructions for Gemini API and billing

### Commits
- `a366cf3` `chore(app): scaffold next.js typescript project`
- `2604d64` `feat(api): add Gemini portrait job pipeline`
- `99d6b8a` `feat(ui): add minimalist portrait studio interface`
- `d71c5e1` `chore(deploy): add docker packaging and setup docs`
