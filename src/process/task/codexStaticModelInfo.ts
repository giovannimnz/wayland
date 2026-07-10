import type { AcpModelInfo } from '@/common/types/acpTypes';
import { getDatabase } from '@process/services/database';
import { selectMirrorModelIds } from '@process/providers/legacyModelConfigBridge';
import { CliAgentSource } from '@process/providers/sources/CliAgentSource';
import { ProviderRepository } from '@process/providers/storage/ProviderRepository';

type StaticModelOption = { id: string; label: string };

function labelForModel(models: StaticModelOption[], modelId: string | null): string | null {
  if (!modelId) return null;
  return models.find((model) => model.id === modelId)?.label ?? modelId;
}

function finalizeStaticModelInfo(
  availableModels: StaticModelOption[],
  currentModelId: string | null,
  sourceDetail: AcpModelInfo['sourceDetail']
): AcpModelInfo | null {
  if (availableModels.length === 0) return null;
  const activeModelId =
    currentModelId && availableModels.some((model) => model.id === currentModelId)
      ? currentModelId
      : availableModels[0].id;
  return {
    currentModelId: activeModelId,
    currentModelLabel: labelForModel(availableModels, activeModelId),
    availableModels,
    canSwitch: availableModels.length > 1,
    source: 'models',
    sourceDetail,
  };
}

export function preferEnabledDiscoveredModels<T extends { id: string }>(
  discovered: T[],
  enabledIds: ReadonlySet<string>
): T[] {
  if (discovered.length === 0 || enabledIds.size === 0) return discovered;
  const filtered = discovered.filter((model) => enabledIds.has(model.id));
  return filtered.length > 0 ? filtered : discovered;
}

export async function listEnabledRegistryModelIds(): Promise<Set<string>> {
  const db = await getDatabase();
  const repo = new ProviderRepository(db.getDriver());
  const enabled = new Set<string>();

  for (const provider of repo.listRegistryProviders()) {
    if (provider.state !== 'connected') continue;
    const ids = selectMirrorModelIds(
      repo.getRegistryCatalog(provider.providerId),
      repo.listRegistryOverrides(provider.providerId)
    );
    for (const id of ids) {
      enabled.add(id);
    }
  }

  return enabled;
}

export async function readCodexStaticModelInfo(): Promise<AcpModelInfo | null> {
  const discovered = await new CliAgentSource('codex').listModels();
  const availableModels = discovered.map((model) => ({
    id: model.id,
    label: model.rawName || model.id,
  }));
  const enabledIds = await listEnabledRegistryModelIds().catch(() => new Set<string>());
  const effectiveModels = preferEnabledDiscoveredModels(availableModels, enabledIds);
  return finalizeStaticModelInfo(effectiveModels, null, 'codex-stream');
}
