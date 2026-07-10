import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@process/utils/safeExec', () => ({
  safeExecFile: vi.fn(),
  safeExec: vi.fn(),
}));

const { mockGetDatabase, repoState } = vi.hoisted(() => ({
  mockGetDatabase: vi.fn(),
  repoState: {
    providers: [] as Array<{ providerId: string; state: string }>,
    catalogs: {} as Record<
      string,
      Array<{
        id: string;
        displayName?: string;
        providerId: string;
        family?: string;
        kind?: string;
        enriched?: boolean;
        tags?: string[];
        recommended?: boolean;
        enabled?: boolean;
      }>
    >,
    overrides: {} as Record<string, Array<{ modelId: string; enabled: boolean }>>,
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: mockGetDatabase,
}));

vi.mock('@process/providers/storage/ProviderRepository', () => ({
  ProviderRepository: class {
    listRegistryProviders() {
      return repoState.providers;
    }
    getRegistryCatalog(providerId: string) {
      return repoState.catalogs[providerId] ?? [];
    }
    listRegistryOverrides(providerId: string) {
      return repoState.overrides[providerId] ?? [];
    }
  },
}));

import { safeExecFile } from '@process/utils/safeExec';
import {
  preferEnabledDiscoveredModels,
  readCodexStaticModelInfo,
} from '@process/task/codexStaticModelInfo';

const execFileMock = vi.mocked(safeExecFile);

function catalogModel(id: string, providerId = 'chatgpt-subscription') {
  return {
    id,
    providerId,
    displayName: id,
    family: 'gpt-5',
    kind: 'text' as const,
    enriched: true,
    releaseDate: id === 'gpt-5.5' ? '2026-06-24' : '2026-05-01',
    tags: ['chat'],
  };
}

describe('codexStaticModelInfo', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockGetDatabase.mockReset();
    mockGetDatabase.mockResolvedValue({ getDriver: () => ({}) } as never);
    repoState.providers = [];
    repoState.catalogs = {};
    repoState.overrides = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps only discovered models that are enabled in the registry when overlap exists', async () => {
    execFileMock.mockResolvedValue({
      stdout: JSON.stringify({
        models: [
          { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list' },
          { slug: 'gpt-5.4', display_name: 'GPT-5.4', visibility: 'list' },
          { slug: 'gpt-5.2', display_name: 'GPT-5.2', visibility: 'list' },
        ],
      }),
      stderr: '',
    });
    repoState.providers = [{ providerId: 'chatgpt-subscription', state: 'connected' }];
    repoState.catalogs['chatgpt-subscription'] = [catalogModel('gpt-5.5'), catalogModel('gpt-5.4')];

    const info = await readCodexStaticModelInfo();

    expect(info?.availableModels.map((model) => model.id)).toEqual(['gpt-5.5', 'gpt-5.4']);
    expect(info?.currentModelId).toBe('gpt-5.5');
  });

  it('falls back to the discovered catalog when the enabled registry set has no overlap', async () => {
    execFileMock.mockResolvedValue({
      stdout: JSON.stringify({
        models: [
          { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list' },
          { slug: 'gpt-5.4', display_name: 'GPT-5.4', visibility: 'list' },
        ],
      }),
      stderr: '',
    });
    repoState.providers = [{ providerId: 'chatgpt-subscription', state: 'connected' }];
    repoState.catalogs['chatgpt-subscription'] = [catalogModel('gpt-4.1')];

    const info = await readCodexStaticModelInfo();

    expect(info?.availableModels.map((model) => model.id)).toEqual(['gpt-5.5', 'gpt-5.4']);
  });

  it('filters a discovered list against enabled ids without blanking it when nothing matches', () => {
    const discovered = [{ id: 'gpt-5.5' }, { id: 'gpt-5.2' }];

    expect(preferEnabledDiscoveredModels(discovered, new Set(['gpt-5.5']))).toEqual([{ id: 'gpt-5.5' }]);
    expect(preferEnabledDiscoveredModels(discovered, new Set(['gpt-4.1']))).toEqual(discovered);
  });
});
