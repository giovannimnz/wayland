#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

limit_build_cpu() {
  if [[ "${ATIUS_BUILD_CPU_LIMITED:-0}" == "1" ]]; then
    return
  fi
  local cpu_total cpu_limit cpu_end cpuset
  cpu_total="$(nproc 2>/dev/null || echo 1)"
  if ! [[ "$cpu_total" =~ ^[0-9]+$ ]] || [[ "$cpu_total" -lt 1 ]]; then
    cpu_total=1
  fi
  cpu_limit=$((cpu_total / 2))
  if [[ "$cpu_limit" -lt 1 ]]; then
    cpu_limit=1
  fi
  export MAKEFLAGS="-j${cpu_limit}"
  export npm_config_jobs="${cpu_limit}"
  export GOMAXPROCS="${cpu_limit}"
  export UV_THREADPOOL_SIZE="${cpu_limit}"
  if command -v taskset >/dev/null 2>&1; then
    cpu_end=$((cpu_limit - 1))
    cpuset="0-${cpu_end}"
    export ATIUS_BUILD_CPU_LIMITED=1
    echo "[atius-build] limiting build to CPU set ${cpuset} (${cpu_limit}/${cpu_total} cores)"
    local runner=(taskset -c "$cpuset")
    if command -v nice >/dev/null 2>&1; then
      runner+=(nice -n 10)
    fi
    if command -v ionice >/dev/null 2>&1; then
      runner+=(ionice -c2 -n7)
    fi
    runner+=(bash "$0" "$@")
    exec "${runner[@]}"
  fi
}
limit_build_cpu "$@"
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
