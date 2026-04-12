#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ ! -x "./node_modules/.bin/gitnexus" ]; then
  echo "gitnexus is not installed. Run npm install."
  exit 1
fi

if [ ! -d ".gitnexus" ]; then
  echo "GitNexus index is missing. Run npm run guard:gitnexus:bootstrap."
  exit 1
fi

if [ ! -f ".gitnexus/worktree.snapshot" ]; then
  echo "GitNexus worktree snapshot is missing. Run npm run guard:gitnexus:bootstrap."
  exit 1
fi

current_snapshot="$(
  {
    git diff --no-ext-diff --binary -- .
    printf '\n-- staged --\n'
    git diff --cached --no-ext-diff --binary -- .
    printf '\n-- untracked --\n'
    git ls-files --others --exclude-standard
  } | shasum -a 256 | awk '{print $1}'
)"
indexed_snapshot="$(tr -d '\n' < .gitnexus/worktree.snapshot)"

if [ "$current_snapshot" != "$indexed_snapshot" ]; then
  echo "GitNexus index is stale relative to the working tree. Run npm run guard:gitnexus:bootstrap."
  exit 1
fi

./node_modules/.bin/gitnexus status
