const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');

const LISTEN_HOST = process.env.WAYLAND_HTTPS_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.WAYLAND_HTTPS_PORT || '25750');
const TARGET_HOST = process.env.WAYLAND_HTTP_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.WAYLAND_HTTP_PORT || '25725');
const CERT_PATH = process.env.WAYLAND_TLS_CERT || '/etc/wayland/tls/wayland-10.100.100.3.crt';
const KEY_PATH = process.env.WAYLAND_TLS_KEY || '/etc/wayland/tls/wayland-10.100.100.3.key';

function proxyRequest(clientReq, clientRes) {
  const headers = {
    ...clientReq.headers,
    host: clientReq.headers.host || `10.100.100.3:${LISTEN_PORT}`,
    'x-forwarded-for': clientReq.socket.remoteAddress || '',
    'x-forwarded-host': clientReq.headers.host || '',
    'x-forwarded-proto': 'https',
  };

  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: clientReq.method,
      path: clientReq.url,
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    }
  );

  upstream.on('error', (error) => {
    console.error('[wayland-https-proxy] upstream error', error);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    clientRes.end('Bad Gateway');
  });

  clientReq.pipe(upstream);
}

function proxyUpgrade(clientReq, clientSocket, head) {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const headers = {
      ...clientReq.headers,
      host: clientReq.headers.host || `10.100.100.3:${LISTEN_PORT}`,
      'x-forwarded-for': clientReq.socket.remoteAddress || '',
      'x-forwarded-host': clientReq.headers.host || '',
      'x-forwarded-proto': 'https',
    };

    const requestLine = `${clientReq.method} ${clientReq.url} HTTP/${clientReq.httpVersion}\r\n`;
    const headerLines = Object.entries(headers)
      .flatMap(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((item) => `${key}: ${item}`);
        }
        return value === undefined ? [] : [`${key}: ${value}`];
      })
      .join('\r\n');

    upstream.write(`${requestLine}${headerLines}\r\n\r\n`);
    if (head && head.length) {
      upstream.write(head);
    }
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.on('error', (error) => {
    console.error('[wayland-https-proxy] websocket upstream error', error);
    clientSocket.destroy();
  });
}

const server = https.createServer(
  {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
  },
  proxyRequest
);

server.on('upgrade', proxyUpgrade);
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[wayland-https-proxy] listening on https://${LISTEN_HOST}:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`
  );
});
