#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

npm ci
bash scripts/ci/install_hooks.sh
npm run guard:gitnexus:bootstrap
