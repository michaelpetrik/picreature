#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

npm run guard:gitnexus:status
npm run typecheck
npm test
npm run build
npm run changelog:check
