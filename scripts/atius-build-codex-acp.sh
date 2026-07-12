#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACP_ROOT="${ROOT}/codex-acp"
CARGO_BIN="${CARGO_BIN:-/home/ubuntu/.cargo/bin/cargo}"
INSTALL_ROOT="${ATIUS_CODEX_ACP_INSTALL_ROOT:-/home/ubuntu/.local}"
INSTALL_BIN="${INSTALL_ROOT}/bin/codex-acp"
STAMP_FILE="${ATIUS_CODEX_ACP_STAMP:-/home/ubuntu/.cache/wayland/codex-acp-tree}"
BUILD_USER="${ATIUS_BUILD_USER:-ubuntu}"
ORIGINAL_ARGS=("$@")
FORCE=0
RUN_TESTS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1 ;;
    --test) RUN_TESTS=1 ;;
    *) echo "[atius-codex-acp] unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[[ -f "${ACP_ROOT}/Cargo.toml" ]] || {
  echo "[atius-codex-acp] embedded source not found: ${ACP_ROOT}" >&2
  exit 1
}
[[ ! -e "${ACP_ROOT}/.git" ]] || {
  echo "[atius-codex-acp] nested Git metadata is forbidden: ${ACP_ROOT}/.git" >&2
  exit 1
}
[[ -x "$CARGO_BIN" ]] || {
  echo "[atius-codex-acp] cargo not found: ${CARGO_BIN}" >&2
  exit 1
}

TREE_HASH="$(git -C "$ROOT" rev-parse HEAD:codex-acp)"
CURRENT_STAMP="$(cat "$STAMP_FILE" 2>/dev/null || true)"
if [[ $FORCE -eq 0 && $RUN_TESTS -eq 0 && -x "$INSTALL_BIN" && "$CURRENT_STAMP" == "$TREE_HASH" ]]; then
  echo "[atius-codex-acp] installed binary already matches embedded tree ${TREE_HASH:0:12}"
  exit 0
fi

if [[ "${ATIUS_BUILD_CPU_LIMITED:-0}" != "1" ]]; then
  CPU_TOTAL="$(nproc 2>/dev/null || echo 1)"
  if ! [[ "$CPU_TOTAL" =~ ^[0-9]+$ ]] || [[ "$CPU_TOTAL" -lt 1 ]]; then
    CPU_TOTAL=1
  fi
  CPU_QUOTA=$((CPU_TOTAL * 20))
  CPUSET_COUNT=$(((CPU_QUOTA + 99) / 100))
  CPUSET_END=$((CPUSET_COUNT - 1))
  WORKERS=$((CPU_TOTAL * 20 / 100))
  [[ $WORKERS -ge 1 ]] || WORKERS=1
  if ! command -v systemd-run >/dev/null 2>&1; then
    echo "[atius-codex-acp] systemd-run is required to enforce the 20% CPU ceiling" >&2
    exit 1
  fi
  SCOPE=(systemd-run)
  if [[ $EUID -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || {
      echo "[atius-codex-acp] sudo is required to create the CPU-capped build scope" >&2
      exit 1
    }
    SCOPE=(sudo systemd-run)
  fi
  echo "[atius-codex-acp] entering CPU-capped scope: quota=${CPU_QUOTA}% cpus=0-${CPUSET_END} workers=${WORKERS}/${CPU_TOTAL}"
  exec "${SCOPE[@]}" --scope --quiet \
    -p "CPUQuota=${CPU_QUOTA}%" \
    -p "AllowedCPUs=0-${CPUSET_END}" \
    --uid="$BUILD_USER" \
    --gid="$BUILD_USER" \
    env \
      HOME="/home/${BUILD_USER}" \
      CARGO_HOME="/home/${BUILD_USER}/.cargo" \
      CARGO_BUILD_JOBS="$WORKERS" \
      ATIUS_BUILD_CPU_LIMITED=1 \
      "$0" "${ORIGINAL_ARGS[@]}"
fi

CPU_TOTAL="$(nproc 2>/dev/null || echo 1)"
WORKERS=$((CPU_TOTAL * 20 / 100))
[[ $WORKERS -ge 1 ]] || WORKERS=1
export CARGO_BUILD_JOBS="$WORKERS"
export CARGO_INCREMENTAL=1

if [[ $RUN_TESTS -eq 1 ]]; then
  echo "[atius-codex-acp] running Rust tests from embedded source"
  "$CARGO_BIN" test --release --locked --manifest-path "${ACP_ROOT}/Cargo.toml"
fi

echo "[atius-codex-acp] building embedded adapter ${TREE_HASH:0:12}"
"$CARGO_BIN" build --release --locked --manifest-path "${ACP_ROOT}/Cargo.toml"

install -d -m 0755 "$(dirname "$INSTALL_BIN")"
TEMP_BIN="${INSTALL_BIN}.new.$$"
install -m 0755 "${ACP_ROOT}/target/release/codex-acp" "$TEMP_BIN"
mv -f "$TEMP_BIN" "$INSTALL_BIN"
install -d -m 0755 "$(dirname "$STAMP_FILE")"
printf '%s\n' "$TREE_HASH" > "$STAMP_FILE"

echo "[atius-codex-acp] installed ${INSTALL_BIN}"
"$INSTALL_BIN" --version
