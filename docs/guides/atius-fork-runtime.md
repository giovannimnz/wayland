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
- `scripts/atius-refresh-source-patch.sh`
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
- `src/process/webserver/websocket/WebSocketManager.ts`
- `src/renderer/components/layout/Layout.tsx`
- `src/renderer/components/layout/Sider/Sider.module.css`
- `src/renderer/components/layout/Sider/SiderAccordion/SiderAccordionShell.module.css`
- `src/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.module.css`
- `src/renderer/components/layout/Sider/SiderFooter.tsx`
- `src/renderer/components/layout/Sider/SiderFooter/SiderFooterQuickActions.module.css`
- `src/renderer/components/layout/Sider/index.tsx`
- `src/common/adapter/ipcBridge.ts`
- `src/common/config/storage.ts`
- `src/common/types/codex/codexModes.ts`
- `src/common/types/codex/types/eventData.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/task/WCoreManager.ts`
- `src/process/task/claudeConfig.ts`
- `src/process/task/codexConfig.ts`
- `src/process/task/hermesConfig.ts`
- `src/renderer/components/agent/AgentModeSelector.tsx`
- `src/renderer/components/model/modelSelector/EffortSubRow.tsx`
- `src/renderer/components/model/modelSelector/modelSelectorTypes.ts`
- `src/renderer/components/settings/DirectorySelectionModal.tsx`
- `src/renderer/hooks/file/useDirectorySelection.tsx`
- `src/renderer/pages/guid/GuidPage.tsx`
- `src/renderer/pages/guid/index.module.css`
- `src/renderer/pages/guid/components/AgentPillBar.tsx`
- `src/renderer/pages/guid/components/GuidActionRow.tsx`
- `src/renderer/pages/guid/components/GuidModelSelector.tsx`
- `src/renderer/pages/guid/components/newChatStarter/IntentPillBar.module.css`
- `src/renderer/pages/guid/hooks/useGuidAgentSelection.ts`
- `src/renderer/pages/guid/hooks/useGuidSend.ts`
- `src/renderer/services/i18n/i18n-keys.d.ts`
- `src/renderer/services/i18n/index.ts`
- `src/renderer/services/i18n/locales/*/agentMode.json`
- `src/renderer/services/i18n/locales/*/conversation.json`
- `src/renderer/styles/layout.css`
- `src/renderer/utils/model/agentModes.ts`

Generated artifacts are intentionally not tracked:

- `.atius-overlay/`
- `out/renderer/`
- `dist-server/`

## Current ATIUS behaviors to preserve

- `Conversar na pasta` stays visible on the WebUI, defaults to `/home/ubuntu/GitHub`, and opens the browser directory picker.
- The login screen defaults to `pt-BR` when no saved language exists.
- Standalone build output includes the MCP stdio scripts required by the server startup canary.
- Service-shell env loading skips non-interactive login shells like `/usr/sbin/nologin`.
- ACP detection stays quiet for missing optional CLIs while detecting Codex and Hermes Agent.
- The GUID model picker keeps the selected Codex label even before `acp.cachedModels` exists.
- Codex and Hermes display model and reasoning effort as separate adjacent controls; model menus do not duplicate effort variants.
- Codex permission mode includes `Custom (config.toml)` / `Personalizado(config.toml)` to delegate sandbox defaults back to the service user's Codex config.
- The GUID agent pill bar exposes collapsed agents by accessible name so Hermes/Codex can be selected by keyboard and automation.
- Mobile GUID controls wrap visibly instead of hiding later model/effort/permission or intent options behind horizontal overflow.
- The left sidebar never exposes a bottom horizontal scrollbar; long recents and footer controls truncate or compact inside the available width.
- The desktop left sidebar divider is a real resize handle: drag persists `wayland:sidebar-width` while preserving the rail snap behavior below the collapse threshold.

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
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run tests/unit/AgentPillBar.dom.test.tsx tests/unit/renderer/guidModelSelector.dom.test.tsx tests/unit/useGuidSend.dom.test.ts tests/unit/process/task/codexNativeSandbox.test.ts tests/unit/process/task/codexConfigEffort.test.ts
npm run typecheck
bash scripts/atius-build-renderer-overlay.sh
sudo systemctl restart wayland.service
systemctl is-active wayland.service
curl -fsS -o /dev/null -w "http=%{http_code}\n" http://127.0.0.1:25808/
journalctl -u wayland.service --since "5 minutes ago" --no-pager | grep -E "AgentRegistry|found 4 agents|Serving renderer|WebUI running"
```

Expected runtime signals:

- `wayland.service` is `active`
- local HTTP on `127.0.0.1:25808` returns `200`
- startup logs include `found 4 agents: Wayland Core, Gemini CLI, Codex, Hermes Agent`

## Git/GitHub note

This checkout is intended to become the ATIUS fork lane for upstream sync. Do
not push ATIUS changes to `FerroxLabs/wayland`. Reserve upstream for fetch/merge
and publish ATIUS history to the Giovanni fork once that remote exists.


## 2026-07-05 GUID UI QA

Validated on `https://wayland.atius.com.br/#/guid` with Playwright/Chromium at
`1980x1080`, `1440x900`, `1024x768`, and `390x844`.

Confirmed behaviors:

- no horizontal page overflow at any tested viewport;
- `Conversar na pasta` opens the WebUI directory picker at `/home/ubuntu/GitHub`;
- Codex model menu shows base models only, while effort is selected separately;
- Hermes Agent shows the same separate effort selector;
- Codex permission menu includes `Custom (config.toml)`;
- Hermes/Codex agent pills are accessible by name for keyboard/automation;
- mobile composer controls and intent pills wrap visibly.

## 2026-07-06 left sidebar responsiveness QA

Validated on `http://127.0.0.1:25808/#/guid` with Playwright/Chromium on
`atius-srv-3`. The test session loaded only the `gsd-web-login` Vault profile
for login automation; no secret values were printed or recorded.

Viewports and states covered:

- `1365x900` desktop at the default `280px` sidebar width.
- `954x665` narrowed desktop with the sidebar expanded.
- `495x889` and `390x900` mobile drawer states.
- `1220x820` desktop with persisted sidebar width forced to `200px`.
- Drag resize path from `281px` to `371px` (`wayland:sidebar-width=370`) and
  back to `211px` (`wayland:sidebar-width=210`, not collapsed).

Measured checks:

- `200px` sidebar: content `200/200`, scroll zone `184/184`, footer `184/184`,
  footer leaks `0`, root `html/body` horizontal overflow `0`.
- `390px` mobile drawer: content `300/300`, scroll zone `284/284`, footer
  `284/284`, footer leaks `0`, root `html/body` horizontal overflow `0`.
- After drag shrink to `211px`: content `210/210`, footer `194/194`, footer
  leaks `0`.

Screenshots from the validated run were written to
`out/atius-qa/sidebar-responsive-final/`.
