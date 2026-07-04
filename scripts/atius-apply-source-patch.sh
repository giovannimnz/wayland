#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="$ROOT/patches/atius-webui-workspace-visible.patch"
cd "$ROOT"
if [[ ! -f "$PATCH" ]]; then
  echo "[atius-patch] patch file not found: $PATCH" >&2
  exit 1
fi
if git apply --reverse --check --recount "$PATCH" >/dev/null 2>&1; then
  echo "[atius-patch] source patch already applied"
  exit 0
fi
if git apply --check --recount "$PATCH" >/dev/null 2>&1; then
  git apply --recount "$PATCH"
  echo "[atius-patch] source patch applied"
  exit 0
fi
echo "[atius-patch] patch no longer applies cleanly. Refresh it from the customized tree with scripts/atius-refresh-source-patch.sh" >&2
exit 1
