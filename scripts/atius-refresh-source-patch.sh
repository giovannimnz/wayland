#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="${PATCH:-$ROOT/patches/atius-webui-workspace-visible.patch}"
BASE_REF="${BASE_REF:-upstream/main}"
COMMIT_IF_CHANGED=0
if [[ "${1:-}" == "--commit-if-changed" ]]; then
  COMMIT_IF_CHANGED=1
  shift
fi
if [[ $# -gt 0 ]]; then
  BASE_REF="$1"
fi
FILES=(
  package.json
  scripts/install-ubuntu.sh
  src/process/webserver/websocket/WebSocketManager.ts
  src/renderer/components/settings/DirectorySelectionModal.tsx
  src/renderer/hooks/file/useDirectorySelection.tsx
  src/renderer/pages/guid/components/GuidActionRow.tsx
  tests/unit/WebSocketManager.test.ts
  tests/unit/renderer/GuidActionRow.dom.test.tsx
)
cd "$ROOT"
git rev-parse --verify "$BASE_REF" >/dev/null 2>&1 || {
  echo "[atius-refresh] base ref not found: $BASE_REF" >&2
  exit 1
}
mkdir -p "$(dirname "$PATCH")"
tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT
git diff --no-ext-diff --binary "$BASE_REF" -- "${FILES[@]}" > "$tmp"
if [[ -f "$PATCH" ]] && cmp -s "$tmp" "$PATCH"; then
  echo "[atius-refresh] patch already up to date"
  exit 0
fi
mv "$tmp" "$PATCH"
trap - EXIT
chmod 0644 "$PATCH"
echo "[atius-refresh] patch updated: $PATCH"
if [[ $COMMIT_IF_CHANGED -eq 1 ]]; then
  git add "$PATCH"
  if ! git diff --cached --quiet -- "$PATCH"; then
    git commit -m "chore(atius): refresh workspace patch context" -- "$PATCH"
  else
    echo "[atius-refresh] no staged patch changes to commit"
  fi
fi
