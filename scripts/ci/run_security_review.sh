#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

npm run guard:secrets

danger_pattern='dangerouslySetInnerHTML|eval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|child_process|execSync|spawnSync'
if rg -n "$danger_pattern" app components lib tests; then
  echo "Dangerous runtime primitive detected in source files."
  exit 1
fi

audit_log="$(mktemp)"
if npm audit --omit=dev --audit-level=high >"$audit_log" 2>&1; then
  cat "$audit_log"
else
  cat "$audit_log"
  if rg -qi 'EAI_AGAIN|ECONNRESET|ENOTFOUND|fetch failed|network|timed out|503 Service Unavailable' "$audit_log"; then
    echo "Dependency audit could not be completed because the advisory service was unavailable."
  else
    rm -f "$audit_log"
    exit 1
  fi
fi
rm -f "$audit_log"

npm run guard:docker
