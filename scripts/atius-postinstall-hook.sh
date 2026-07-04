#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="/opt/Wayland/resources/bundled-bun/linux-arm64/bun"
sudo setfacl -m u:wayland:rx /home/ubuntu
sudo setfacl -m u:wayland:rx /home/ubuntu/GitHub
sudo setfacl -R -m u:wayland:rx "$ROOT"
sudo setfacl -R -m u:wayland:rX "$ROOT/node_modules" 2>/dev/null || true
sudo mkdir -p /etc/systemd/system/wayland.service.d
sudo tee /etc/systemd/system/wayland.service.d/atius-overlay.conf >/dev/null <<CONF
[Service]
ExecStart=
ExecStartPre=
WorkingDirectory=${ROOT}
Environment=HOME=/var/lib/wayland
Environment=WAYLAND_WORKDIR=/var/lib/wayland
Environment=DATA_DIR=/var/lib/wayland/.config/Wayland
Environment=LOGS_DIR=/var/lib/wayland/.config/Wayland/logs
Environment=NODE_ENV=production
Environment=ALLOW_REMOTE=true
Environment=PORT=25808
Environment=SERVER_BASE_URL=https://wayland.atius.com.br
Environment=WAYLAND_ALLOWED_ORIGINS=https://wayland.atius.com.br
Environment=WAYLAND_OPERATOR_CIDRS=10.1.1.1/32
Environment=WAYLAND_DISABLE_AUTO_UPDATE=1
ExecStart=${BUN_BIN} ${ROOT}/dist-server/server.mjs
TimeoutStartSec=180
CONF
sudo systemctl disable --now wayland-atius-overlay.path wayland-atius-overlay.service >/dev/null 2>&1 || true
sudo systemctl daemon-reload
bash "$ROOT/scripts/atius-build-renderer-overlay.sh"
sudo systemctl restart wayland.service
