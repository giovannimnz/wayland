# Atius srv-3 fork/runtime guide

This guide documents the ATIUS-managed source runtime served at
`https://wayland.atius.com.br/` from the `atius-srv-3` checkout.

## What is different from upstream

The upstream project ships a packaged desktop/server workflow. The ATIUS host
runs the source checkout directly:

- repo: `/home/ubuntu/GitHub/wayland`
- service: `wayland.service`
- runtime entrypoint: `/home/ubuntu/GitHub/wayland/dist-server/server.mjs`
- port: `25808`
- service user: `wayland`

The deployment is rebuilt from source after custom patch application instead of
using the stock packaged auto-update flow.

## Source-of-truth files

Tracked ATIUS source customizations live in these files:

- `patches/atius-webui-workspace-visible.patch`
- `scripts/atius-apply-source-patch.sh`
- `scripts/atius-build-renderer-overlay.sh`
- `scripts/atius-postinstall-hook.sh`
- `scripts/atius-reapply-renderer-overlay.sh`
- `scripts/atius-update.sh`
- `scripts/install-ubuntu.sh`
- `scripts/build-server.mjs`
- `scripts/build-mcp-servers.js`
- `src/process/agent/acp/AcpDetector.ts`
- `src/process/extensions/data/bundle-vendored/agentProfileMerge.ts`
- `src/process/extensions/resolvers/ChannelPluginResolver.ts`
- `src/process/utils/initStorage.ts`
- `src/process/utils/shellEnv.ts`
- `src/process/webserver/routes/apiRoutes.ts`
- `src/renderer/components/settings/DirectorySelectionModal.tsx`
- `src/renderer/hooks/file/useDirectorySelection.tsx`
- `src/renderer/pages/guid/components/GuidActionRow.tsx`
- `src/renderer/pages/guid/components/GuidModelSelector.tsx`
- `src/renderer/services/i18n/index.ts`

Generated artifacts are intentionally not tracked:

- `.atius-overlay/`
- `out/renderer/`
- `dist-server/`

## Current ATIUS behaviors to preserve

- `Conversar na pasta` stays visible on the WebUI and defaults to `/home/ubuntu/GitHub`.
- The login screen defaults to `pt-BR` when no saved language exists.
- Standalone build output includes the MCP stdio scripts required by the server startup canary.
- Service-shell env loading skips non-interactive login shells like `/usr/sbin/nologin`.
- ACP detection stays quiet for missing optional CLIs while still detecting Codex.
- The GUID model picker keeps the selected Codex label even before `acp.cachedModels` exists.

## Rebuild/update flow

Apply the tracked source patch and rebuild the source runtime:

```bash
bash scripts/atius-build-renderer-overlay.sh
```

Rebuild and restart the live service with the canonical ATIUS hook:

```bash
bash scripts/atius-update.sh
```

`scripts/atius-postinstall-hook.sh` is the authoritative systemd/runtime wiring hook. It:

- grants the `wayland` service user access to the checkout,
- writes `/etc/systemd/system/wayland.service.d/atius-overlay.conf`,
- rebuilds the source runtime,
- restarts `wayland.service`.

## Validation

```bash
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run tests/unit/renderer/guid/firstSafeCuratedModel.test.ts
npm run typecheck
bash scripts/atius-build-renderer-overlay.sh
sudo systemctl restart wayland.service
systemctl is-active wayland.service
curl -fsS -o /dev/null -w "http=%{http_code}\n" http://127.0.0.1:25808/
journalctl -u wayland.service --since "5 minutes ago" --no-pager | grep -E "AgentRegistry|found 3 agents|Serving renderer|WebUI running"
```

Expected runtime signals:

- `wayland.service` is `active`
- local HTTP on `127.0.0.1:25808` returns `200`
- startup logs include `found 3 agents: Wayland Core, Gemini CLI, Codex`

## Git/GitHub note

This checkout is intended to become the ATIUS fork lane for upstream sync. Do
not push ATIUS changes to `FerroxLabs/wayland`. Reserve upstream for fetch/merge
and publish ATIUS history to the Giovanni fork once that remote exists.
