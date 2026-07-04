#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ "${1:-}" == "--pull" ]]; then
  git pull --ff-only
fi
bash scripts/atius-apply-source-patch.sh
sudo bash scripts/atius-postinstall-hook.sh
echo "[atius-update] standalone source runtime rebuilt and restarted"
