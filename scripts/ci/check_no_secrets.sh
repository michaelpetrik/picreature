#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

changed_files=()
while IFS= read -r file; do
  changed_files+=("$file")
done < <(
  {
    git diff --cached --name-only --diff-filter=ACM
    git diff --name-only --diff-filter=ACM
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo "No changed files to scan for secrets."
  exit 0
fi

disallowed_files='(^|/)\.env($|[.])|(^|/)\.env\.local$|\.pem$|\.p12$|\.key$'
for file in "${changed_files[@]}"; do
  if printf '%s\n' "$file" | grep -Eq "$disallowed_files"; then
    echo "Secret-like file is present in the working tree diff: $file"
    exit 1
  fi
done

pattern='AIza[0-9A-Za-z_-]{35}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{20,}|sk-[A-Za-z0-9]{20,}|GEMINI_API_KEY=[A-Za-z0-9_-]{20,}|-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----'
if rg -n --hidden --no-ignore-vcs "$pattern" "${changed_files[@]}"; then
  echo "Potential secret detected in changed files."
  exit 1
fi

echo "No secret patterns detected in changed files."
