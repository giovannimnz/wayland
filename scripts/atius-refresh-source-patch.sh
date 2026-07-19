#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="${PATCH:-$ROOT/patches/atius-webui-workspace-visible.patch}"
BASE_REF="${BASE_REF:-upstream/main}"
COMMIT_IF_CHANGED=0
if [[ "${1:-}" == "--commit-if-changed" ]]; then
  COMMIT_IF_CHANGED=1
  shift
fi
if [[ $# -gt 0 ]]; then
  BASE_REF="$1"
fi
FILES=(
  AGENTS.md
  package.json
  THIRD-PARTY-NOTICES.md
  atius-overlay.json
  codex-acp/
  scripts/install-ubuntu.sh
  scripts/build-server.mjs
  scripts/build-mcp-servers.js
  scripts/atius-apply-source-patch.sh
  scripts/atius-build-codex-acp.sh
  scripts/atius-verify-codex-acp.sh
  scripts/atius-build-renderer-overlay.sh
  scripts/atius-postinstall-hook.sh
  scripts/atius-refresh-source-patch.sh
  scripts/atius-sync-ubuntu-runtime.mjs
  scripts/atius-reapply-renderer-overlay.sh
  scripts/atius-update.sh
  scripts/atius-wayland-https-proxy.js
  src/common/adapter/ipcBridge.ts
  src/common/config/storage.ts
  src/common/types/acpTypes.ts
  src/common/types/codex/codexModes.ts
  src/common/types/codex/types/eventData.ts
  src/process/agent/acp/AcpDetector.ts
  src/process/agent/acp/acpConnectors.ts
  src/process/agent/remote/RemoteAgentCore.ts
  src/process/acp/compat/typeBridge.ts
  src/process/bridge/remoteAgentBridge.ts
  src/process/extensions/data/bundle-vendored/agentProfileMerge.ts
  src/process/extensions/resolvers/ChannelPluginResolver.ts
  src/process/task/AcpAgentManager.ts
  src/process/task/WCoreManager.ts
  src/process/task/claudeConfig.ts
  src/process/task/codexConfig.ts
  src/process/task/codexStaticModelInfo.ts
  src/process/task/hermesConfig.ts
  src/process/utils/initStorage.ts
  src/process/utils/shellEnv.ts
  src/process/webserver/config/constants.ts
  src/process/webserver/routes/apiRoutes.ts
  src/process/webserver/websocket/WebSocketManager.ts
  src/renderer/components/layout/Layout.tsx
  src/renderer/components/layout/Sider/Sider.module.css
  src/renderer/components/layout/Sider/SiderAccordion/SiderAccordionShell.module.css
  src/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.module.css
  src/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.tsx
  src/renderer/components/layout/Sider/SiderFooter.tsx
  src/renderer/components/layout/Sider/SiderFooter/SiderFooterQuickActions.module.css
  src/renderer/components/layout/Sider/index.tsx
  src/renderer/components/agent/AgentModeSelector.tsx
  src/renderer/components/agent/MarqueePillLabel.tsx
  src/renderer/components/model/modelSelector/EffortSubRow.tsx
  src/renderer/components/model/modelSelector/modelSelectorTypes.ts
  src/renderer/components/settings/DirectorySelectionModal.tsx
  src/renderer/hooks/file/useDirectorySelection.tsx
  src/renderer/pages/guid/GuidPage.tsx
  src/renderer/pages/guid/index.module.css
  src/renderer/pages/guid/components/AgentPillBar.tsx
  src/renderer/pages/guid/components/GuidActionRow.tsx
  src/renderer/pages/guid/components/GuidInputCard.tsx
  src/renderer/pages/guid/components/GuidModelSelector.tsx
  src/renderer/pages/guid/components/newChatStarter/IntentPillBar.module.css
  src/renderer/pages/guid/hooks/useGuidAgentSelection.ts
  src/renderer/pages/guid/hooks/useGuidSend.ts
  src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts
  src/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers.ts
  src/renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx
  src/renderer/services/i18n/i18n-keys.d.ts
  src/renderer/services/i18n/index.ts
  src/renderer/utils/model/agentModes.ts
  src/renderer/services/i18n/locales/de-DE/agentMode.json
  src/renderer/services/i18n/locales/en-US/agentMode.json
  src/renderer/services/i18n/locales/es-ES/agentMode.json
  src/renderer/services/i18n/locales/fr-FR/agentMode.json
  src/renderer/services/i18n/locales/ja-JP/agentMode.json
  src/renderer/services/i18n/locales/ko-KR/agentMode.json
  src/renderer/services/i18n/locales/pt-BR/agentMode.json
  src/renderer/services/i18n/locales/ru-RU/agentMode.json
  src/renderer/services/i18n/locales/tr-TR/agentMode.json
  src/renderer/services/i18n/locales/uk-UA/agentMode.json
  src/renderer/services/i18n/locales/zh-CN/agentMode.json
  src/renderer/services/i18n/locales/zh-TW/agentMode.json
  src/renderer/services/i18n/locales/de-DE/conversation.json
  src/renderer/services/i18n/locales/en-US/conversation.json
  src/renderer/services/i18n/locales/es-ES/conversation.json
  src/renderer/services/i18n/locales/fr-FR/conversation.json
  src/renderer/services/i18n/locales/ja-JP/conversation.json
  src/renderer/services/i18n/locales/ko-KR/conversation.json
  src/renderer/services/i18n/locales/pt-BR/conversation.json
  src/renderer/services/i18n/locales/en-US/settings.json
  src/renderer/services/i18n/locales/pt-BR/settings.json
  src/renderer/services/i18n/locales/ru-RU/conversation.json
  src/renderer/services/i18n/locales/tr-TR/conversation.json
  src/renderer/services/i18n/locales/uk-UA/conversation.json
  src/renderer/services/i18n/locales/zh-CN/conversation.json
  src/renderer/services/i18n/locales/zh-TW/conversation.json
  src/renderer/styles/layout.css
  tests/unit/WebSocketManager.test.ts
  tests/unit/AgentPillBar.dom.test.tsx
  tests/unit/atiusCodexAcpRuntime.test.ts
  tests/unit/AcpAgentManagerSkillInjection.test.ts
  tests/unit/acpConnectors.test.ts
  tests/unit/RemoteAgentCore.test.ts
  tests/unit/RemoteAgentManagement.dom.test.tsx
  tests/unit/remoteAgentBridge.test.ts
  tests/unit/process/task/codexConfigEffort.test.ts
  tests/unit/process/task/codexNativeSandbox.test.ts
  tests/unit/renderer/AcpConfigSelector.dom.test.tsx
  tests/unit/renderer/components/layout/Sider/SiderAccordion/SiderRecentChatsSection.dom.test.tsx
  tests/unit/renderer/groupingHelpers.test.ts
  tests/unit/renderer/GuidActionRow.dom.test.tsx
  tests/unit/renderer/guid/firstSafeCuratedModel.test.ts
  tests/unit/renderer/guidModelSelector.dom.test.tsx
  tests/unit/useGuidSend.dom.test.ts
  tests/unit/webserver/cookieOptions.test.ts
  tests/unit/webserver/detectNetworkContext.test.ts
  docs/README.md
  docs/legal/THIRD-PARTY-NOTICES.md
  docs/guides/atius-codex-acp.md
  docs/guides/atius-fork-runtime.md
)
cd "$ROOT"
git rev-parse --verify "$BASE_REF" >/dev/null 2>&1 || {
  echo "[atius-refresh] base ref not found: $BASE_REF" >&2
  exit 1
}

# Re-apply ATIUS package.json customizations on top of the exact upstream file,
# so dependency and version bumps from upstream are never frozen by our fork.
upstream_pkg_tmp="$(mktemp)"
patch_tmp="$(mktemp)"
INTENT_TO_ADD=()
reset_intent_to_add() {
  if [[ ${#INTENT_TO_ADD[@]} -gt 0 ]]; then
    git reset -q -- "${INTENT_TO_ADD[@]}" >/dev/null 2>&1 || true
  fi
}
cleanup() {
  reset_intent_to_add
  rm -f "$upstream_pkg_tmp" "$patch_tmp"
}
trap cleanup EXIT
git show "$BASE_REF:package.json" > "$upstream_pkg_tmp"
node - "$upstream_pkg_tmp" "$ROOT/package.json" <<'NODE'
const fs = require('fs');
const upstreamPath = process.argv[2];
const currentPath = process.argv[3];
const upstream = JSON.parse(fs.readFileSync(upstreamPath, 'utf8'));
upstream.scripts = {
  ...(upstream.scripts || {}),
  'atius:apply-patch': 'bash scripts/atius-apply-source-patch.sh',
  'atius:build-overlay': 'bash scripts/atius-build-renderer-overlay.sh',
  'atius:build-codex-acp': 'bash scripts/atius-build-codex-acp.sh',
  'atius:verify-codex-acp': 'bash scripts/atius-verify-codex-acp.sh',
  'atius:reapply-overlay': 'bash scripts/atius-reapply-renderer-overlay.sh',
  'atius:postinstall-hook': 'bash scripts/atius-postinstall-hook.sh',
  'atius:update': 'bash scripts/atius-update.sh',
};
fs.writeFileSync(currentPath, JSON.stringify(upstream, null, 2) + '\n');
NODE

for file in "${FILES[@]}"; do
  if [[ -e "$file" ]] && ! git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
    git add -N -- "$file"
    INTENT_TO_ADD+=("$file")
  fi
done

mkdir -p "$(dirname "$PATCH")"
git diff --no-ext-diff --binary "$BASE_REF" -- "${FILES[@]}" > "$patch_tmp"
perl -pi -e 's/[ \t]+$//' "$patch_tmp"
if [[ -f "$PATCH" ]] && cmp -s "$patch_tmp" "$PATCH"; then
  echo "[atius-refresh] patch already up to date"
  exit 0
fi
mv "$patch_tmp" "$PATCH"
cleanup
trap - EXIT
chmod 0644 "$PATCH"
echo "[atius-refresh] patch updated: $PATCH"
if [[ $COMMIT_IF_CHANGED -eq 1 ]]; then
  git add package.json "$PATCH"
  if ! git diff --cached --quiet -- package.json "$PATCH"; then
    git commit -m "chore(atius): refresh workspace patch context" -- package.json "$PATCH"
  else
    echo "[atius-refresh] no staged package/patch changes to commit"
  fi
fi
