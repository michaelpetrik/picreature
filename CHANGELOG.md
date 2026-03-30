# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-03-30

### Added
- Scaffolded the application as a `Next.js + TypeScript` project.
- Added a Gemini-backed portrait job pipeline with upload validation, temporary job storage, model fallback, diagnostics, and human-readable error handling.
- Added a minimalist portrait studio UI with drag and drop upload, input preview, prompt controls, setup overlay, retry/setup status badges, and result polling.
- Added Docker packaging, a health endpoint, an environment template, reference image placeholders, and Czech setup instructions for Gemini API and billing.

### Commits
- `a366cf3` `chore(app): scaffold next.js typescript project`
- `2604d64` `feat(api): add Gemini portrait job pipeline`
- `99d6b8a` `feat(ui): add minimalist portrait studio interface`
- `d71c5e1` `chore(deploy): add docker packaging and setup docs`
- `24691fc` `docs(changelog): add initial release summary`
