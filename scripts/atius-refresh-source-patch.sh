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

# Re-apply ATIUS package.json customizations on top of the exact upstream file,
# so dependency and version bumps from upstream are never frozen by our fork.
upstream_pkg_tmp="$(mktemp)"
patch_tmp="$(mktemp)"
cleanup() { rm -f "$upstream_pkg_tmp" "$patch_tmp"; }
trap cleanup EXIT
git show "$BASE_REF:package.json" > "$upstream_pkg_tmp"
node - "$upstream_pkg_tmp" "$ROOT/package.json" <<'NODE'
const fs = require('fs');
const upstreamPath = process.argv[2];
const currentPath = process.argv[3];
const upstream = JSON.parse(fs.readFileSync(upstreamPath, 'utf8'));
upstream.scripts = {
  ...(upstream.scripts || {}),
  'atius:apply-patch': 'bash scripts/atius-apply-source-patch.sh',
  'atius:build-overlay': 'bash scripts/atius-build-renderer-overlay.sh',
  'atius:reapply-overlay': 'bash scripts/atius-reapply-renderer-overlay.sh',
  'atius:postinstall-hook': 'bash scripts/atius-postinstall-hook.sh',
  'atius:update': 'bash scripts/atius-update.sh',
};
fs.writeFileSync(currentPath, JSON.stringify(upstream, null, 2) + '\n');
NODE

mkdir -p "$(dirname "$PATCH")"
git diff --no-ext-diff --binary "$BASE_REF" -- "${FILES[@]}" > "$patch_tmp"
perl -pi -e 's/[ \t]+$//' "$patch_tmp"
if [[ -f "$PATCH" ]] && cmp -s "$patch_tmp" "$PATCH"; then
  echo "[atius-refresh] patch already up to date"
  exit 0
fi
mv "$patch_tmp" "$PATCH"
trap - EXIT
chmod 0644 "$PATCH"
echo "[atius-refresh] patch updated: $PATCH"
if [[ $COMMIT_IF_CHANGED -eq 1 ]]; then
  git add package.json "$PATCH"
  if ! git diff --cached --quiet -- package.json "$PATCH"; then
    git commit -m "chore(atius): refresh workspace patch context" -- package.json "$PATCH"
  else
    echo "[atius-refresh] no staged package/patch changes to commit"
  fi
fi
