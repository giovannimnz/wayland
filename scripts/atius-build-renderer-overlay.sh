#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="${BUN_BIN:-}"
if [[ -z "$BUN_BIN" ]]; then
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
  elif [[ -x /opt/Wayland/resources/bundled-bun/linux-arm64/bun ]]; then
    BUN_BIN="/opt/Wayland/resources/bundled-bun/linux-arm64/bun"
  else
    echo "[atius-build] bun not found" >&2
    exit 1
  fi
fi
cd "$ROOT"
bash scripts/atius-apply-source-patch.sh
"$BUN_BIN" install --frozen-lockfile --ignore-scripts
"$BUN_BIN" x vite build --config vite.renderer.config.ts
node scripts/build-server.mjs
python3 - <<'PY'
import json, pathlib, subprocess, time
root = pathlib.Path('.').resolve()
version = json.load(open(root / 'package.json'))['version']
try:
    git_sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=root, text=True).strip()
except Exception:
    git_sha = 'nogit'
meta = {
    'mode': 'standalone-source',
    'version': version,
    'git_sha': git_sha,
    'built_at_epoch': int(time.time()),
}
(pathlib.Path(root / '.atius-overlay')).mkdir(exist_ok=True)
(pathlib.Path(root / '.atius-overlay' / 'meta.json')).write_text(json.dumps(meta, indent=2) + '\n')
print('[atius-build] built', json.dumps(meta))
PY
