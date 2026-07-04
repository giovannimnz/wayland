#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="$ROOT/patches/atius-webui-workspace-visible.patch"
GUID_FILE="$ROOT/src/renderer/pages/guid/components/GuidActionRow.tsx"
PKG_FILE="$ROOT/package.json"
INSTALL_FILE="$ROOT/scripts/install-ubuntu.sh"
if grep -q '"atius:update": "bash scripts/atius-update.sh"' "$PKG_FILE" \
  && grep -q 'postinstall_hook="${script_dir}/atius-postinstall-hook.sh"' "$INSTALL_FILE" \
  && ! grep -q '!isWebUI && (' "$GUID_FILE"; then
  echo "[atius-patch] source patch already applied"
  exit 0
fi
if [[ ! -f "$PATCH" ]]; then
  echo "[atius-patch] patch file not found: $PATCH" >&2
  exit 1
fi
cd "$ROOT"
git apply "$PATCH"
echo "[atius-patch] source patch applied"
