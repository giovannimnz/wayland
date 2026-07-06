#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="/opt/Wayland/resources/bundled-bun/linux-arm64/bun"
NODE_BIN="/usr/local/bin/node"
WAYLAND_HTTP_PORT=25750
WAYLAND_HTTPS_PORT=25725
WAYLAND_TLS_CERT="/etc/wayland/tls/wayland-10.100.100.3.crt"
WAYLAND_TLS_KEY="/etc/wayland/tls/wayland-10.100.100.3.key"
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
Environment=PORT=${WAYLAND_HTTP_PORT}
Environment=SERVER_BASE_URL=https://wayland.atius.com.br
Environment=WAYLAND_ALLOWED_ORIGINS=https://wayland.atius.com.br,http://10.100.100.3:${WAYLAND_HTTP_PORT},http://10.1.1.3:${WAYLAND_HTTP_PORT},http://10.1.1.7:${WAYLAND_HTTP_PORT},https://10.100.100.3:${WAYLAND_HTTPS_PORT},https://10.1.1.3:${WAYLAND_HTTPS_PORT},https://10.1.1.7:${WAYLAND_HTTPS_PORT}
Environment=WAYLAND_OPERATOR_CIDRS=10.1.1.1/32
Environment=WAYLAND_DISABLE_AUTO_UPDATE=1
Environment=PATH=/opt/Wayland/resources/bundled-bun/linux-arm64:/var/lib/wayland/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin
ExecStart=${BUN_BIN} ${ROOT}/dist-server/server.mjs
TimeoutStartSec=180
CONF
sudo install -d -m 0750 -o root -g wayland /etc/wayland/tls
if [[ ! -f "$WAYLAND_TLS_CERT" ]] || ! sudo openssl x509 -in "$WAYLAND_TLS_CERT" -noout -ext subjectAltName 2>/dev/null | grep -q 'IP Address:10.100.100.3'; then
  sudo openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$WAYLAND_TLS_KEY" \
    -out "$WAYLAND_TLS_CERT" \
    -subj '/CN=10.100.100.3' \
    -addext 'subjectAltName=IP:10.100.100.3,DNS:atius-srv-3.atius.internal,DNS:wayland.atius.com.br' \
    -addext 'basicConstraints=critical,CA:false' \
    -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
    -addext 'extendedKeyUsage=serverAuth'
fi
sudo chown root:wayland "$WAYLAND_TLS_KEY" "$WAYLAND_TLS_CERT"
sudo chmod 0640 "$WAYLAND_TLS_KEY"
sudo chmod 0644 "$WAYLAND_TLS_CERT"
sudo install -m 0755 -o root -g root "$ROOT/scripts/atius-wayland-https-proxy.js" /usr/local/lib/wayland-https-proxy.js
sudo tee /etc/systemd/system/wayland-https-proxy.service >/dev/null <<CONF
[Unit]
Description=Wayland HTTPS reverse proxy for VPN access
After=network-online.target wayland.service
Wants=network-online.target
Requires=wayland.service

[Service]
Type=simple
User=wayland
Group=wayland
Environment=NODE_ENV=production
Environment=WAYLAND_HTTPS_HOST=0.0.0.0
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
sudo systemctl restart wayland.service
sudo systemctl enable --now wayland-https-proxy.service
sudo systemctl restart wayland-https-proxy.service
