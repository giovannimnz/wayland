#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="${ATIUS_CODEX_HOME:-/home/ubuntu/.codex}"
export HERMES_HOME="${ATIUS_HERMES_HOME:-/home/ubuntu/.hermes}"

exec /home/ubuntu/.local/bin/codex-acp "$@"
