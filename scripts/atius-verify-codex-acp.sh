#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACP_ROOT="${ROOT}/codex-acp"
WRAPPER_SOURCE="${ACP_ROOT}/scripts/codex-acp-atius-wrapper.sh"
WRAPPER_LIVE="/home/ubuntu/.local/bin/codex-acp-atius"
BINARY_LIVE="/home/ubuntu/.local/bin/codex-acp"
LIVE=0

if [[ "${1:-}" == "--live" ]]; then
  LIVE=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--live]" >&2
  exit 2
fi

[[ -f "${ACP_ROOT}/Cargo.toml" ]] || { echo "missing embedded Cargo.toml" >&2; exit 1; }
[[ -f "${ACP_ROOT}/Cargo.lock" ]] || { echo "missing embedded Cargo.lock" >&2; exit 1; }
[[ -f "${ACP_ROOT}/LICENSE" ]] || { echo "missing embedded Apache-2.0 license" >&2; exit 1; }
[[ ! -e "${ACP_ROOT}/.git" ]] || { echo "nested .git is forbidden" >&2; exit 1; }
[[ -x "$WRAPPER_SOURCE" ]] || { echo "embedded ATIUS wrapper is not executable" >&2; exit 1; }
grep -Fq 'CODEX_ACP_ROOT="${ROOT}/codex-acp"' "${ROOT}/scripts/atius-postinstall-hook.sh"
grep -Fq 'bash "${ROOT}/scripts/atius-build-codex-acp.sh"' "${ROOT}/scripts/atius-postinstall-hook.sh"

/home/ubuntu/.cargo/bin/cargo metadata \
  --locked \
  --no-deps \
  --format-version 1 \
  --manifest-path "${ACP_ROOT}/Cargo.toml" >/dev/null

if [[ $LIVE -eq 1 ]]; then
  [[ -x "$WRAPPER_LIVE" ]] || { echo "live wrapper missing" >&2; exit 1; }
  [[ -x "$BINARY_LIVE" ]] || { echo "live binary missing" >&2; exit 1; }
  cmp -s "$WRAPPER_SOURCE" "$WRAPPER_LIVE" || { echo "live wrapper differs from embedded source" >&2; exit 1; }
  "$WRAPPER_LIVE" --version
  systemctl is-active --quiet wayland.service
  systemctl is-active --quiet wayland-https-proxy.service
  systemctl show wayland.service -p Environment --value | grep -Fq 'WAYLAND_CODEX_ACP_CLI=/home/ubuntu/.local/bin/codex-acp-atius'
  curl -fsS -o /dev/null http://127.0.0.1:25725/api/auth/status
fi

if [[ "${ATIUS_REQUIRE_LEGACY_ACP_ABSENT:-0}" == "1" && -e /home/ubuntu/GitHub/codex-acp ]]; then
  echo "legacy checkout still exists: /home/ubuntu/GitHub/codex-acp" >&2
  exit 1
fi

TRACKED_COUNT="$(git -C "$ROOT" ls-files 'codex-acp/**' | wc -l)"
[[ "$TRACKED_COUNT" -ge 40 ]] || { echo "embedded source is incomplete: ${TRACKED_COUNT} tracked files" >&2; exit 1; }

echo "[atius-codex-acp] embedded source verified"
echo "[atius-codex-acp] root=${ACP_ROOT} tracked_files=${TRACKED_COUNT}"
