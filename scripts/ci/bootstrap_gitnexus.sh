#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ ! -x "./node_modules/.bin/gitnexus" ]; then
  echo "gitnexus is not installed. Run npm install first."
  exit 1
fi

snapshot="$(
  {
    git diff --no-ext-diff --binary -- .
    printf '\n-- staged --\n'
    git diff --cached --no-ext-diff --binary -- .
    printf '\n-- untracked --\n'
    git ls-files --others --exclude-standard
  } | shasum -a 256 | awk '{print $1}'
)"

./node_modules/.bin/gitnexus analyze
printf '%s\n' "$snapshot" > .gitnexus/worktree.snapshot
