# Atius srv-3 fork/runtime guide

This guide documents the ATIUS-managed source runtime served at
`https://wayland.atius.com.br/` from the `atius-srv-3` checkout.

## What is different from upstream

The upstream project ships a packaged desktop/server workflow. The ATIUS host
runs the source checkout directly:

- repo: `/home/ubuntu/GitHub/wayland`
- service: `wayland.service`
- runtime entrypoint: `/home/ubuntu/GitHub/wayland/dist-server/server.mjs`
- HTTP port: `25725`
- HTTPS VPN port: `25750`, terminated by `wayland-https-proxy.service`
- service user: `ubuntu`

The deployment is rebuilt from source after custom patch application instead of
using the stock packaged auto-update flow.

## Source-of-truth files

Tracked ATIUS source customizations live in these files:

- `patches/atius-webui-workspace-visible.patch`
- `scripts/atius-apply-source-patch.sh`
- `scripts/atius-postinstall-hook.sh`
- `scripts/atius-sync-ubuntu-runtime.mjs`
- `scripts/atius-refresh-source-patch.sh`
- `scripts/atius-reapply-renderer-overlay.sh`
- `scripts/atius-update.sh`
- `scripts/atius-wayland-https-proxy.js`
- `scripts/install-ubuntu.sh`
- `scripts/build-server.mjs`
- `scripts/build-mcp-servers.js`
- `scripts/atius-build-renderer-overlay.sh` (CPU guardrail: max 20% por padrão)
- `src/process/agent/acp/AcpDetector.ts`
- `src/process/extensions/data/bundle-vendored/agentProfileMerge.ts`
- `src/process/extensions/resolvers/ChannelPluginResolver.ts`
- `src/process/utils/initStorage.ts`
- `src/process/utils/shellEnv.ts`
- `src/process/webserver/config/constants.ts`
- `src/process/webserver/routes/apiRoutes.ts`
- `src/process/webserver/websocket/WebSocketManager.ts`
- `src/renderer/components/layout/Layout.tsx`
- `src/renderer/components/layout/Sider/Sider.module.css`
- `src/renderer/components/layout/Sider/SiderAccordion/SiderAccordionShell.module.css`
- `src/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.module.css`
- `src/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.tsx`
- `src/renderer/components/layout/Sider/SiderFooter.tsx`
- `src/renderer/components/layout/Sider/SiderFooter/SiderFooterQuickActions.module.css`
- `src/renderer/components/layout/Sider/index.tsx`
- `src/common/adapter/ipcBridge.ts`
- `src/common/config/storage.ts`
- `src/common/types/codex/codexModes.ts`
- `src/common/types/codex/types/eventData.ts`
- `src/process/task/AcpAgentManager.ts`
- `tests/unit/AcpAgentManagerSkillInjection.test.ts`
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
- `src/renderer/pages/guid/components/GuidInputCard.tsx`
- `src/renderer/pages/guid/components/GuidModelSelector.tsx`
- `src/renderer/pages/guid/components/newChatStarter/IntentPillBar.module.css`
- `src/renderer/pages/guid/hooks/useGuidAgentSelection.ts`
- `src/renderer/pages/guid/hooks/useGuidSend.ts`
- `src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts`
- `src/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers.ts`
- `tests/unit/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.dom.test.tsx`
- `tests/unit/renderer/groupingHelpers.test.ts`
- `src/renderer/services/i18n/i18n-keys.d.ts`
- `src/renderer/services/i18n/index.ts`
- `src/renderer/services/i18n/locales/*/agentMode.json`
- `src/renderer/services/i18n/locales/*/conversation.json`
- `src/renderer/styles/layout.css`
- `src/renderer/utils/model/agentModes.ts`

`scripts/atius-refresh-source-patch.sh` captures listed new files with a temporary
`git add -N` intent-to-add and resets that intent before exit. This lets the
protected patch include new ATIUS files such as `scripts/atius-sync-ubuntu-runtime.mjs`
without leaving the git index staged.

Generated artifacts are intentionally not tracked:

- `.atius-overlay/`
- `out/renderer/`
- `dist-server/`

## Current ATIUS behaviors to preserve

- `Conversar na pasta` stays visible on the WebUI, defaults to `/home/ubuntu/Servers` (`~/Servers` for the `ubuntu` runtime user), and opens the browser directory picker.
- The login screen defaults to `pt-BR` when no saved language exists.
- Standalone build output includes the MCP stdio scripts required by the server startup canary.
- Service-shell env loading skips non-interactive login shells like `/usr/sbin/nologin`.
- ACP detection stays quiet for missing optional CLIs while detecting Codex and Hermes Agent.
- The GUID model picker keeps the selected Codex label even before `acp.cachedModels` exists.
- Codex and Hermes display model and reasoning effort as separate adjacent controls; model menus do not duplicate effort variants.
- Codex and Hermes display a separate speed selector beside model/effort. `Padrão` maps to `service_tier=normal`; `Rápido` maps to Codex's `service_tier=priority` Fast tier.
- The GUID runtime agent selector is only for executable runtime agents/CLIs. Codex and Hermes Agent are the canonical ATIUS choices; Gemini CLI stays hidden/disabled for this deployment. GSD/SDD entries such as `$gsd-plan-phase` are commands/skills, not ACP runtime agents, and must never be generated as `codex-agent-profile-*` rows in `acp.customAgents`.
- Codex and Hermes GUID model menus use ACP-reported/static bridge catalogs only. They must not fall back to the generic curated provider registry, because that can expose models the ACP adapter does not support.
- The GUID composer uses the shared slash command controller. Typing `/gsd-plan`, `/gsd-debug`, or another generated Codex skill command opens the command menu in the composer; selecting the item inserts the matching `$gsd-*` invocation text and does not create or select a runtime agent.
- Codex permission mode includes `Custom (config.toml)` / `Personalizado(config.toml)` to delegate sandbox defaults back to the service user's Codex config.
- Direct VPN HTTP access uses `http://10.100.100.3:25725/`. Even with `SERVER_BASE_URL=https://wayland.atius.com.br` for the public entrypoint, request-scoped cookie options must not mark the session cookie as `Secure` on direct HTTP/VPN requests, otherwise login succeeds in JSON but the WebSocket reconnect has no `wayland-session` cookie and the GUID falls back to `wcore` / no model.
- Direct VPN HTTPS access uses `https://10.100.100.3:25750/`. Port `25725` is plain HTTP, so `https://10.100.100.3:25725/` is expected to fail TLS. The `25750` listener is a local Node HTTPS reverse proxy with WebSocket upgrade support that forwards to `127.0.0.1:25725`.
- The `25750` certificate lives under `/etc/wayland/tls/wayland-10.100.100.3.crt` and must include `IP:10.100.100.3` in SAN. On `GIOVANNI-W11-PC`, the public certificate was imported into the current user's trusted root store so Brave/Schannel can validate the direct IP URL without `-k`.
- The GUID agent pill bar exposes collapsed agents by accessible name so Hermes/Codex can be selected by keyboard and automation.
- Mobile GUID controls wrap visibly instead of hiding later model/effort/permission or intent options behind horizontal overflow.
- The left sidebar never exposes a bottom horizontal scrollbar; long recents and footer controls truncate or compact inside the available width.
- Project conversations remain visible and counted in global Recent Chats, grouped under the Project name even when the Project workspace chat has `customWorkspace=false`; team conversations and health checks stay on their owning/internal surfaces.
- The desktop left sidebar divider is a real resize handle: drag persists `wayland:sidebar-width` while preserving the rail snap behavior below the collapse threshold.

## IJFW Memory (Ferrox Labs)

Install and configure IJFW Memory on this checkout with:

Run this first:
- npx -y @ijfw/install@latest

If that command fails in this environment (could not determine executable to run), use:
- cd /home/ubuntu/GitHub/wayland
- npm exec --yes --package @ijfw/install@latest -- ijfw-install

Operational notes:

- IJFW installs into ~/.ijfw by default; this checkout keeps a local .ijfw/ metadata dir for project context.
- Keep heavy build/test commands under the 20% CPU default (see scripts/atius-build-renderer-overlay.sh).
- Track rollout changes in Obsidian and GBrain with the same initiative slug:
  - Obsidian: infrastructure/wayland/ijfw-memory.md
  - GBrain: wayland/ijfw-memory
- In production incidents, validate memory load behavior before restarting wayland.service to avoid session churn while the adapter loads.

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

- runs Wayland as Linux user `ubuntu`, not `wayland`;
- wires `HOME=/home/ubuntu`, `CODEX_HOME=/home/ubuntu/.codex`, and `HERMES_HOME=/home/ubuntu/.hermes`;
- builds the full-history embedded Codex ACP subtree from `<wayland>/codex-acp` under the 20% CPU ceiling;
- exposes the ATIUS Codex ACP fork through `/home/ubuntu/.local/bin/codex-acp-atius`;
- removes the runtime dependency on the former sibling checkout `/home/ubuntu/GitHub/codex-acp`;
- syncs the live Wayland storage into `/home/ubuntu/.config/Wayland/config/wayland-config.txt`;
- regenerates `model.config` from the `ubuntu` Codex runtime;
- stores `atius.workspaceHybridRoutes` and defaults NFS GitHub mounts to hybrid execution guidance (edit on the mount, validate on the owner host via SSH alias);
- prunes generated `codex-agent-profile-*` rows from `acp.customAgents` while preserving user-owned custom ACP agents;
- mirrors `/home/ubuntu/.codex/skills/*/SKILL.md` into `/home/ubuntu/.config/Wayland/config/skills/` as symlinks;
- generates `slash.customCommands` entries that insert `$skill-name` for Codex skills, including GSD/SDD commands;
- pins Codex skills in `skills.preferences`, enables `skills.cliDiscovery.enabled`, and ensures `agents.hidden` contains `gemini`;
- writes `/etc/systemd/system/wayland.service.d/atius-overlay.conf`;
- rebuilds the source runtime and restarts the services.

The adapter architecture, subtree update process, rollback and validation are
documented in [ATIUS embedded Codex ACP runtime](atius-codex-acp.md).

## Validation

```bash
bash scripts/atius-build-codex-acp.sh --test --force
bash scripts/atius-verify-codex-acp.sh --live
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run tests/unit/renderer/guid/firstSafeCuratedModel.test.ts
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run tests/unit/AcpAgentManagerSkillInjection.test.ts tests/unit/AgentPillBar.dom.test.tsx tests/unit/renderer/guidModelSelector.dom.test.tsx tests/unit/useGuidSend.dom.test.ts tests/unit/process/task/codexNativeSandbox.test.ts tests/unit/process/task/codexConfigEffort.test.ts
bun test tests/unit/webserver/cookieOptions.test.ts tests/unit/webserver/detectNetworkContext.test.ts
npm run typecheck
bash scripts/atius-build-renderer-overlay.sh
sudo systemctl restart wayland.service
systemctl is-active wayland.service
systemctl is-active wayland-https-proxy.service
curl -fsS -o /dev/null -w "http=%{http_code}\n" http://127.0.0.1:25725/
curl -fsS -o /dev/null -w "https=%{http_code}\n" https://10.13.1.13:25750/
journalctl -u wayland.service --since "5 minutes ago" --no-pager | grep -E "AgentRegistry|Serving renderer|WebUI running"
node -e 'const fs=require("fs");const p="/home/ubuntu/.config/Wayland/config/wayland-config.txt";const c=JSON.parse(decodeURIComponent(Buffer.from(fs.readFileSync(p,"utf8").trim(),"base64").toString("utf8")));const slash=c["slash.customCommands"]||[];const agents=c["acp.customAgents"]||[];console.log({customAgents:agents.length, generatedCustomAgents:agents.filter(a=>String(a.id||"").startsWith("codex-agent-profile-")).length, slashCommands:slash.length, gsdPlanPhase:slash.some(x=>x.name==="gsd-plan-phase"), geminiHidden:(c["agents.hidden"]||[]).includes("gemini")})'
```

Expected runtime signals:

- `wayland.service` is `active`
- `wayland-https-proxy.service` is `active`
- local HTTP on `127.0.0.1:25725` returns `200`
- direct VPN HTTPS on `10.100.100.3:25750` returns `200` from a trusted Windows client
- startup logs show the Wayland server and AgentRegistry without generated `codex-agent-profile-*` runtime agents
- `systemctl show wayland.service -p User -p Environment` reports `User=ubuntu`, `CODEX_HOME=/home/ubuntu/.codex`, and `HERMES_HOME=/home/ubuntu/.hermes`
- `/home/ubuntu/.config/Wayland/config/wayland-config.txt` contains generated `model.config`, zero generated `codex-agent-profile-*` ACP custom agents, generated `slash.customCommands` for `$gsd-*`, pinned Codex skills, and `agents.hidden=[..., "gemini"]`
- On `https://wayland.atius.com.br/#/guid`, the runtime agent selector shows executable runtimes such as Codex/Hermes Agent, not GSD subagents; typing `/gsd-plan-phase` or `/gsd-debug` in the composer opens the command path and inserts `$gsd-plan-phase` / `$gsd-debug`

## Git/GitHub note

This checkout is intended to become the ATIUS fork lane for upstream sync. Do
not push ATIUS changes to `FerroxLabs/wayland`. Reserve upstream for fetch/merge
and publish ATIUS history to the Giovanni fork once that remote exists.

## 2026-07-05 GUID UI QA

Validated on `https://wayland.atius.com.br/#/guid` with Playwright/Chromium at
`1980x1080`, `1440x900`, `1024x768`, and `390x844`.

Confirmed behaviors:

- no horizontal page overflow at any tested viewport;
- `Conversar na pasta` opens the WebUI directory picker at `/home/ubuntu/Servers` (`~/Servers`);
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

## 2026-07-10 GSD command/runtime separation

Root cause: the previous ATIUS sync briefly treated `/home/ubuntu/.codex/agents/*.toml` as ACP custom runtime agents. That made GSD subagents such as `gsd-doc-writer` appear in the GUID runtime selector, which is incorrect.

Canonical behavior:

- runtime agents are executable engines/CLIs only: Codex and Hermes Agent for ATIUS Wayland;
- Gemini CLI remains hidden/disabled for the deployment through `agents.hidden`;
- GSD/SDD stays in the programming workflow as Codex skills and slash commands, invoked as `/gsd-plan-phase`, `/gsd-debug`, or `$gsd-plan-phase`;
- `acp.customAgents` must not contain generated IDs starting with `codex-agent-profile-`;
- `/home/ubuntu/.codex/gsd-core` and `/home/ubuntu/.codex/skills/gsd-*` are part of the `ubuntu` Codex runtime consumed by Wayland;
- the sync script mirrors Codex skills into Wayland skill storage and generates `slash.customCommands` templates that insert the matching `$skill-name` token.
- `src/renderer/pages/guid/GuidPage.tsx` wires `useSlashCommandController` and `useUserSlashCommands`; `GuidInputCard.tsx` renders the slash menu with visible overflow so `/gsd-*` selection works in the GUID first-screen composer.

Latest applied storage state after sync:

- `remainingGeneratedCustomAgents=0`
- `generatedSlashCommands=112`
- `gsd-*` slash commands present: `70`
- required commands present and pinned: `gsd-plan-phase`, `gsd-debug`, `gsd-plan-review-convergence`, `gsd-graphify`
