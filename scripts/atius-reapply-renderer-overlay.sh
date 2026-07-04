#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT/scripts/atius-refresh-source-patch.sh"
bash "$ROOT/scripts/atius-build-renderer-overlay.sh"
