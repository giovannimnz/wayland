#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="/opt/Wayland/resources/bundled-bun/linux-arm64/bun"
NODE_BIN="/usr/local/bin/node"
CARGO_BIN="/home/ubuntu/.cargo/bin/cargo"
UBUNTU_HOME="/home/ubuntu"
UBUNTU_DATA_DIR="${UBUNTU_HOME}/.config/Wayland"
UBUNTU_LOGS_DIR="${UBUNTU_DATA_DIR}/logs"
UBUNTU_CODEX_HOME="${UBUNTU_HOME}/.codex"
UBUNTU_HERMES_HOME="${UBUNTU_HOME}/.hermes"
CODEX_ACP_ROOT="/home/ubuntu/GitHub/codex-acp"
CODEX_ACP_BIN="${UBUNTU_HOME}/.local/bin/codex-acp-atius"
WAYLAND_HTTP_PORT=25725
WAYLAND_HTTPS_PORT=25750
WAYLAND_TLS_CERT="/etc/wayland/tls/wayland-10.13.1.13.crt"
WAYLAND_TLS_KEY="/etc/wayland/tls/wayland-10.13.1.13.key"
sudo install -d -m 0750 -o ubuntu -g ubuntu "${UBUNTU_HOME}/.config"
sudo install -d -m 0750 -o ubuntu -g ubuntu "${UBUNTU_DATA_DIR}"
sudo install -d -m 0750 -o ubuntu -g ubuntu "${UBUNTU_DATA_DIR}/config"
sudo install -d -m 0750 -o ubuntu -g ubuntu "${UBUNTU_LOGS_DIR}"
if [[ -d /var/lib/wayland/.config/Wayland ]]; then
  sudo cp -a /var/lib/wayland/.config/Wayland/. "${UBUNTU_DATA_DIR}/"
  sudo chown -R ubuntu:ubuntu "${UBUNTU_DATA_DIR}"
fi
sudo install -d -m 0750 -o ubuntu -g ubuntu "${UBUNTU_HOME}/.local/bin"
sudo install -m 0755 -o ubuntu -g ubuntu "${CODEX_ACP_ROOT}/scripts/codex-acp-atius-wrapper.sh" "${CODEX_ACP_BIN}"
sudo mkdir -p /etc/systemd/system/wayland.service.d
sudo tee /etc/systemd/system/wayland.service.d/atius-overlay.conf >/dev/null <<CONF
[Service]
ExecStart=
ExecStartPre=
User=ubuntu
Group=ubuntu
WorkingDirectory=${ROOT}
ExecStartPre=${NODE_BIN} ${ROOT}/scripts/atius-sync-ubuntu-runtime.mjs
Environment=HOME=${UBUNTU_HOME}
Environment=WAYLAND_WORKDIR=${UBUNTU_HOME}
Environment=DATA_DIR=${UBUNTU_DATA_DIR}
Environment=LOGS_DIR=${UBUNTU_LOGS_DIR}
Environment=CODEX_HOME=${UBUNTU_CODEX_HOME}
Environment=HERMES_HOME=${UBUNTU_HERMES_HOME}
Environment=WAYLAND_LOCAL_AGENT_BACKENDS=codex,hermes
Environment=WAYLAND_CODEX_ACP_CLI=${CODEX_ACP_BIN}
Environment=NODE_ENV=production
Environment=ALLOW_REMOTE=true
Environment=PORT=${WAYLAND_HTTP_PORT}
Environment=SERVER_BASE_URL=https://wayland.atius.com.br
Environment=WAYLAND_ALLOWED_ORIGINS=https://wayland.atius.com.br,http://10.13.1.13:${WAYLAND_HTTP_PORT},https://10.13.1.13:${WAYLAND_HTTPS_PORT}
Environment=WAYLAND_OPERATOR_CIDRS=10.11.1.11/32
Environment=WAYLAND_DISABLE_AUTO_UPDATE=1
Environment=PATH=/opt/Wayland/resources/bundled-bun/linux-arm64:${UBUNTU_HOME}/.local/bin:${UBUNTU_HOME}/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin
ExecStart=${BUN_BIN} ${ROOT}/dist-server/server.mjs
TimeoutStartSec=180
CONF
sudo install -d -m 0750 -o root -g ubuntu /etc/wayland/tls
if [[ ! -f "$WAYLAND_TLS_CERT" ]] || ! sudo openssl x509 -in "$WAYLAND_TLS_CERT" -noout -ext subjectAltName 2>/dev/null | grep -q 'IP Address:10.13.1.13'; then
  sudo openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$WAYLAND_TLS_KEY" \
    -out "$WAYLAND_TLS_CERT" \
    -subj '/CN=10.13.1.13' \
    -addext 'subjectAltName=IP:10.13.1.13,DNS:atius-srv-3.atius.internal,DNS:wayland.atius.com.br' \
    -addext 'basicConstraints=critical,CA:false' \
    -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
    -addext 'extendedKeyUsage=serverAuth'
fi
sudo chown root:ubuntu "$WAYLAND_TLS_KEY" "$WAYLAND_TLS_CERT"
sudo chmod 0640 "$WAYLAND_TLS_KEY"
sudo chmod 0644 "$WAYLAND_TLS_CERT"
sudo install -m 0755 -o root -g root "$ROOT/scripts/atius-wayland-https-proxy.js" /usr/local/lib/wayland-https-proxy.js
sudo tee /etc/systemd/system/wayland-https-proxy.service >/dev/null <<CONF
[Unit]
Description=Wayland HTTPS reverse proxy for OCI/DRG access
After=network-online.target wayland.service
Wants=network-online.target
Requires=wayland.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
Environment=NODE_ENV=production
Environment=WAYLAND_HTTPS_HOST=10.13.1.13
Environment=WAYLAND_HTTPS_PORT=${WAYLAND_HTTPS_PORT}
Environment=WAYLAND_HTTP_HOST=127.0.0.1
Environment=WAYLAND_HTTP_PORT=${WAYLAND_HTTP_PORT}
Environment=WAYLAND_TLS_CERT=${WAYLAND_TLS_CERT}
Environment=WAYLAND_TLS_KEY=${WAYLAND_TLS_KEY}
ExecStart=${NODE_BIN} /usr/local/lib/wayland-https-proxy.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
CONF
sudo systemctl disable --now wayland-atius-overlay.path wayland-atius-overlay.service >/dev/null 2>&1 || true
sudo systemctl daemon-reload
bash "$ROOT/scripts/atius-build-renderer-overlay.sh"
sudo systemctl stop wayland-https-proxy.service >/dev/null 2>&1 || true
sudo systemctl restart wayland.service
sudo systemctl enable --now wayland-https-proxy.service
sudo systemctl restart wayland-https-proxy.service
