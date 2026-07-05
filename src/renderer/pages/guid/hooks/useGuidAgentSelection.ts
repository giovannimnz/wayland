/**
 * @license
 * Copyright 2026 Ferrox Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendAll, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { AcpBackend, AcpBackendConfig, AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import type { GuidReasoningEffort } from '../components/GuidModelSelector';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { savePreferredMode, savePreferredModelId, getAgentKey as getAgentKeyUtil } from './agentSelectionUtils';
import { usePresetAssistantResolver } from './usePresetAssistantResolver';
import { useAgentAvailability } from './useAgentAvailability';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';

export type GuidAgentSelectionResult = {
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  /**
   * Select a preset assistant with the "Rory rule": derives the chat's
   * backend from preset.presetAgentType and sets the canonical agent key
   * via getAgentKey() - no modal, no prompt. The existing per-backend
   * preferred-model/mode chain then applies the right model automatically.
   */
  selectPresetAssistant: (preset: { id: string; presetAgentType?: string }) => void;
  defaultAgentKey: string;
  selectedAgent: string;
  selectedAgentInfo: AvailableAgent | undefined;
  isPresetAgent: boolean;
  availableAgents: AvailableAgent[] | undefined;
  customAgents: AcpBackendConfig[];
  selectedMode: string;
  setSelectedMode: React.Dispatch<React.SetStateAction<string>>;
  acpCachedModels: Record<string, AcpModelInfo>;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
  selectedAcpEffort: GuidReasoningEffort | null;
  setSelectedAcpEffort: (effort: GuidReasoningEffort) => void;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  cachedConfigOptions: AcpSessionConfigOption[];
  pendingConfigOptions: Record<string, string>;
  setPendingConfigOption: (configId: string, value: string) => void;
  getAgentKey: (agent: { backend: AcpBackend; customAgentId?: string }) => string;
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  resolvePresetRulesAndSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string;
  resolveEnabledSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  isMainAgentAvailable: (agentType: string) => boolean;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
  refreshCustomAgents: () => Promise<void>;
  customAgentAvatarMap: Map<string, string | undefined>;
};

const GUID_REASONING_EFFORTS: GuidReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
const MODEL_EFFORT_SUFFIX = /\/(low|medium|high|xhigh)$/i;

const normalizeEffort = (value: unknown): GuidReasoningEffort | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase() as GuidReasoningEffort;
  return GUID_REASONING_EFFORTS.includes(normalized) ? normalized : null;
};

const splitModelEffort = (
  modelId: string | null | undefined
): { modelId: string | null; effort: GuidReasoningEffort | null } => {
  const match = modelId?.match(MODEL_EFFORT_SUFFIX);
  if (!match) return { modelId: modelId || null, effort: null };
  return { modelId: modelId!.slice(0, -match[0].length), effort: normalizeEffort(match[1]) };
};

const effortFromConfigOptions = (options: AcpSessionConfigOption[] | undefined): GuidReasoningEffort | null => {
  const option = options?.find(
    (opt) =>
      opt.id === 'reasoning_effort' || opt.category === 'thought_level' || opt.name?.toLowerCase().includes('reasoning')
  );
  return normalizeEffort(option?.currentValue || option?.selectedValue);
};

const defaultEffortForBackend = (backend: string): GuidReasoningEffort | null =>
  backend === 'codex' || backend === 'hermes' ? 'xhigh' : null;

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  localeKey: string;
  resetAssistant?: boolean;
  /** React Router location.key - changes on every navigation, used to detect new resets. */
  locationKey?: string;
};

/**
 * Hook that manages agent selection, availability, and preset assistant logic.
 */
export const useGuidAgentSelection = ({
  modelList,
  isGoogleAuth,
  localeKey,
  resetAssistant,
  locationKey,
}: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>('wcore');
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>();
  const [selectedMode, _setSelectedMode] = useState<string>('default');
  // Track whether mode was loaded from preferences to avoid overwriting during initial load
  const selectedAgentRef = useRef<string | null>(null);
  // Guard: only run the initial restore once; user selections are never overwritten
  const initialRestoreDoneRef = useRef(false);
  const [acpCachedModels, setAcpCachedModels] = useState<Record<string, AcpModelInfo>>({});
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const [selectedAcpEffort, _setSelectedAcpEffort] = useState<GuidReasoningEffort | null>(null);
  const [cachedConfigOptions, setCachedConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [pendingConfigOptions, setPendingConfigOptions] = useState<Record<string, string>>({});

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
    initialRestoreDoneRef.current = true;
    _setSelectedAgentKey(key);
    ConfigStorage.set('guid.lastSelectedAgent', key).catch((error) => {
      console.error('Failed to save selected agent:', error);
    });
  }, []);

  // Wrap setSelectedMode to also save preferred mode to the agent's own config
  const setSelectedMode = useCallback((mode: React.SetStateAction<string>) => {
    _setSelectedMode((prev) => {
      const newMode = typeof mode === 'function' ? mode(prev) : mode;
      const agentKey = selectedAgentRef.current;
      if (agentKey) {
        void savePreferredMode(agentKey, newMode);
      }
      return newMode;
    });
  }, []);

  // Update a single pending config option selection (local mode, Guid page)
  const setPendingConfigOption = useCallback((configId: string, value: string) => {
    setPendingConfigOptions((prev) => ({ ...prev, [configId]: value }));
  }, []);

  const setSelectedAcpEffort = useCallback((effort: GuidReasoningEffort) => {
    _setSelectedAcpEffort(effort);
    setPendingConfigOptions((prev) => ({ ...prev, reasoning_effort: effort }));
  }, []);

  // Wrap setSelectedAcpModel to also save preferred model to the agent's config
  const setSelectedAcpModel = useCallback((modelId: React.SetStateAction<string | null>) => {
    _setSelectedAcpModel((prev) => {
      const rawModelId = typeof modelId === 'function' ? modelId(prev) : modelId;
      const { modelId: newModelId, effort } = splitModelEffort(rawModelId);
      if (effort) _setSelectedAcpEffort(effort);
      const agentKey = selectedAgentRef.current;
      if (agentKey && agentKey !== 'gemini' && agentKey !== 'custom' && newModelId) {
        void savePreferredModelId(agentKey, newModelId);
      }
      return newModelId;
    });
  }, []);

  const availableCustomAgentIds = useMemo(() => {
    const ids = new Set<string>();
    (availableAgents || []).forEach((agent) => {
      if (agent.customAgentId) {
        ids.add(agent.customAgentId);
      }
    });
    return ids;
  }, [availableAgents]);

  const getAgentKey = getAgentKeyUtil;

  // --- Sub-hooks ---
  const { customAgents, customAgentAvatarMap, refreshCustomAgents } = useCustomAgentsLoader({
    availableCustomAgentIds,
  });

  const {
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
  } = usePresetAssistantResolver({ customAgents, localeKey });

  const { isMainAgentAvailable, getEffectiveAgentType } = useAgentAvailability({
    modelList,
    isGoogleAuth,
    availableAgents,
    resolvePresetAgentType,
  });

  /**
   * Find agent by key.
   * Supports "custom:uuid", "remote:uuid" format, and plain backend type.
   */
  const findAgentByKey = (key: string): AvailableAgent | undefined => {
    if (key.startsWith('custom:')) {
      const customAgentId = key.slice(7);
      // Built-in/specialist assistants carry a `builtin-` prefix on some surfaces
      // (the selection key) but not others (the registry record id), e.g. the key
      // `custom:builtin-book-copy-editor` vs the record id `book-copy-editor`. Match
      // all three forms - the same prefix-tolerant resolution used in GuidPage
      // (601/627) and AssistantSelectionArea (57). An exact-only match here left
      // `selectedAgentInfo` undefined, which flipped the agent to a bare `custom`
      // backend and died on spawn with "No CLI path for backend 'custom'".
      const stripped = customAgentId.replace(/^builtin-/, '');
      const idCandidates = new Set([customAgentId, `builtin-${stripped}`, stripped]);
      const foundInAvailable = availableAgents?.find(
        (a) => a.customAgentId != null && idCandidates.has(a.customAgentId)
      );
      if (foundInAvailable) return foundInAvailable;

      const assistant = customAgents.find((a) => idCandidates.has(a.id));
      if (assistant) {
        return {
          // #380: an assistant with no preset type runs on the bundled WCore
          // engine, not Gemini CLI.
          backend: assistant.presetAgentType || 'wcore',
          name: assistant.name,
          customAgentId: assistant.id,
          isPreset: true,
          context: '',
          avatar: assistant.avatar,
          presetAgentType: assistant.presetAgentType,
        };
      }
      // Defensive (#380): a `custom:` key that resolves to no known record must
      // still run on the bundled WCore engine - never fall through to a bare
      // `custom` ACP backend, which dies on spawn with "No CLI path for backend
      // 'custom'". Only synthesize once a registry has actually loaded, so a
      // transient empty list during boot doesn't strip a real assistant's
      // persona (this memo re-runs when availableAgents/customAgents arrive).
      if ((availableAgents?.length ?? 0) > 0 || customAgents.length > 0) {
        return {
          backend: 'wcore',
          name: stripped,
          customAgentId,
          isPreset: true,
          context: '',
          presetAgentType: 'wcore',
        };
      }
    }
    if (key.startsWith('remote:')) {
      const remoteId = key.slice(7);
      return availableAgents?.find((a) => a.backend === 'remote' && a.customAgentId === remoteId);
    }
    return availableAgents?.find((a) => a.backend === key);
  };

  // Derived state
  const selectedAgent: string = selectedAgentKey.startsWith('custom:')
    ? 'custom'
    : selectedAgentKey.startsWith('remote:')
      ? 'remote'
      : selectedAgentKey;
  const selectedAgentInfo = useMemo(() => {
    return findAgentByKey(selectedAgentKey);
  }, [selectedAgentKey, availableAgents, customAgents]);
  const isPresetAgent = Boolean(selectedAgentInfo?.isPreset);

  // --- SWR: Fetch detected execution engines (shared cache) ---
  const { data: availableAgentsData } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  // Fetch remote agents from DB and merge into available agents
  const { data: remoteAgentsData } = useSWR('remote-agents.list', () => ipcBridge.remoteAgent.list.invoke());

  useEffect(() => {
    if (!availableAgentsData) return;
    const remoteAsAvailable: AvailableAgent[] = (remoteAgentsData || []).map((ra) => ({
      backend: 'remote',
      name: ra.name,
      customAgentId: ra.id,
      avatar: ra.avatar,
    }));
    setAvailableAgents([...availableAgentsData, ...remoteAsAvailable]);
  }, [availableAgentsData, remoteAgentsData]);

  // Track whether the resetAssistant flag has been consumed so it only fires once
  // per navigation. Use locationKey (changes on every navigate()) to reset the guard,
  // because window.history.replaceState does NOT update React Router's location.state.
  const resetHandledRef = useRef(false);
  const prevLocationKeyRef = useRef(locationKey);
  if (locationKey !== prevLocationKeyRef.current) {
    prevLocationKeyRef.current = locationKey;
    resetHandledRef.current = false;
  }

  // Apply sidebar "new chat" resets before paint so the previous assistant
  // selection does not flash for a frame when navigating to /guid again.
  useLayoutEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;

    if (resetAssistant && !resetHandledRef.current) {
      resetHandledRef.current = true;
      const firstCliAgent = availableAgents.find((a) => !a.isPreset);
      const fallbackKey = firstCliAgent ? getAgentKey(firstCliAgent) : 'wcore';
      _setSelectedAgentKey(fallbackKey);
      ConfigStorage.set('guid.lastSelectedAgent', fallbackKey).catch((error) => {
        console.error('Failed to save reset agent key:', error);
      });
    }
  }, [availableAgents, resetAssistant, locationKey]);

  // Load last selected agent when no explicit reset was requested.
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;
    if (resetAssistant) return;

    let cancelled = false;
    initialRestoreDoneRef.current = true;

    const restoreSavedSelection = async () => {
      try {
        const savedKey = await ConfigStorage.get('guid.lastSelectedAgent');
        if (cancelled) return;

        if (savedKey) {
          // Prefixed keys - trust directly, the referenced data resolves later
          if (savedKey.startsWith('custom:') || savedKey.startsWith('remote:')) {
            _setSelectedAgentKey(savedKey);
            return;
          }
          // Plain backend key - verify it still exists in detected engines
          if (availableAgents.some((agent) => getAgentKey(agent) === savedKey)) {
            _setSelectedAgentKey(savedKey);
            return;
          }
        }

        // Fresh install (no saved selection at all): land on the Concierge
        // assistant by default. Reversible - a user who set
        // `concierge.defaultPersona` to false keeps the first-detected-engine
        // default. This NEVER overrides an explicit saved selection (handled
        // above), so existing users are unaffected. Uses the canonical preset
        // key format (`custom:builtin-concierge`) produced by getAgentKey.
        if (!savedKey) {
          const conciergeDisabled = (await ConfigStorage.get('concierge.defaultPersona')) === false;
          if (cancelled) return;
          if (!conciergeDisabled) {
            _setSelectedAgentKey('custom:builtin-concierge');
            return;
          }
        }

        // No saved preference or stale key - default to first detected engine
        const firstAgent = availableAgents[0];
        if (firstAgent) {
          _setSelectedAgentKey(getAgentKey(firstAgent));
        }
      } catch (error) {
        console.error('Failed to load last selected agent:', error);
      }
    };

    void restoreSavedSelection();

    return () => {
      cancelled = true;
    };
  }, [availableAgents, resetAssistant, locationKey]);

  // Load cached ACP model lists
  useEffect(() => {
    let isActive = true;
    ConfigStorage.get('acp.cachedModels')
      .then((cached) => {
        if (!isActive) return;
        setAcpCachedModels(cached || {});
      })
      .catch(() => {
        // Silently ignore - cached models are optional
      });
    return () => {
      isActive = false;
    };
  }, []);

  const currentEffectiveAgentInfo = useMemo(() => {
    if (!isPresetAgent) {
      const isAvailable = isMainAgentAvailable(selectedAgent as string);
      return {
        agentType: selectedAgent as string,
        isFallback: false,
        originalType: selectedAgent as string,
        isAvailable,
      };
    }
    return getEffectiveAgentType(selectedAgentInfo);
  }, [isPresetAgent, selectedAgent, selectedAgentInfo, getEffectiveAgentType, isMainAgentAvailable]);

  // Load cached ACP config options per backend
  useEffect(() => {
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    if (!backend) return;
    let isActive = true;
    ConfigStorage.get('acp.cachedConfigOptions')
      .then((cached) => {
        if (!isActive) return;
        const options = cached?.[backend];
        const typedOptions = Array.isArray(options) ? (options as AcpSessionConfigOption[]) : [];
        // Filter out model/mode categories - those are handled by AcpModelSelector / AgentModeSelector.
        // Keep reasoning_effort here so the GUID can render it as a dedicated selector.
        const filtered = typedOptions.filter((opt) => opt.category !== 'model' && opt.category !== 'mode');
        setCachedConfigOptions(filtered);
        _setSelectedAcpEffort(effortFromConfigOptions(typedOptions) ?? defaultEffortForBackend(backend));
        setPendingConfigOptions({});
      })
      .catch(() => {
        if (!isActive) return;
        setCachedConfigOptions([]);
        _setSelectedAcpEffort(defaultEffortForBackend(backend));
        setPendingConfigOptions({});
      });
    return () => {
      isActive = false;
    };
  }, [selectedAgentKey, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Reset selected ACP model when the agent changes. Precedence: explicit saved
  // pick > last cached model > (native Claude login) subscription slot > none.
  // The Claude branch is load-bearing: a fresh Claude chat must NOT be left with
  // no model, or the global "Route through Flux" toggle would silently route a
  // native-login chat through Flux. Defaulting to the subscription slot keeps it
  // native (explicit-native-pick rule in resolveFluxRouting); the user can still
  // choose Flux from the picker's Flux group. Mirrors createConversationParams
  // (the workspace-tab creation path) so both new-chat entry points agree.
  useEffect(() => {
    // For preset agents, resolve to the actual backend type for config lookup
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;

    let cancelled = false;

    const resolveAcpModel = async () => {
      // 1. Explicit per-backend pick (a native slot OR a deliberate flux-* id) wins.
      try {
        const config = await ConfigStorage.get('acp.config');
        if (cancelled) return;
        const preferred = (config?.[backend as AcpBackendAll] as Record<string, unknown>)?.preferredModelId as
          | string
          | undefined;
        if (preferred) {
          const parsed = splitModelEffort(preferred);
          _setSelectedAcpModel(parsed.modelId);
          if (parsed.effort) _setSelectedAcpEffort(parsed.effort);
          return;
        }
      } catch {
        /* fall through to cached / native default */
      }
      if (cancelled) return;

      // 2. Last model the ACP bridge cached for this backend.
      const cachedModelId = acpCachedModels[backend]?.currentModelId;
      if (cachedModelId) {
        const parsed = splitModelEffort(cachedModelId);
        _setSelectedAcpModel(parsed.modelId);
        if (parsed.effort) _setSelectedAcpEffort(parsed.effort);
        return;
      }

      // 3. Claude with a native login and no pick yet: default to the subscription
      // slot (honors ~/.claude/settings.json model, e.g. Opus) so the chat runs
      // native instead of being silently routed through Flux.
      if (backend === 'claude') {
        try {
          const nativeDefault = await ipcBridge.systemSettings.getClaudeNativeDefaultModelId.invoke();
          if (cancelled) return;
          if (nativeDefault) {
            _setSelectedAcpModel(nativeDefault);
            return;
          }
        } catch {
          /* no native Claude login — fall through to none */
        }
      }

      // 4. No signal (non-claude backend, or claude without a native login).
      if (!cancelled) {
        _setSelectedAcpModel(null);
        _setSelectedAcpEffort(defaultEffortForBackend(backend));
      }
    };

    void resolveAcpModel();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentKey, acpCachedModels, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Read preferred mode or fallback to legacy yoloMode config
  useEffect(() => {
    _setSelectedMode('default');
    // For preset agents, use the effective backend type for config lookup and mode saving
    const configKey = isPresetAgent ? currentEffectiveAgentInfo.agentType : selectedAgent;
    selectedAgentRef.current = configKey;
    if (!configKey) return;

    let cancelled = false;

    const loadPreferredMode = async () => {
      try {
        // Read preferredMode from the agent's own config, fallback to legacy yoloMode
        let preferred: string | undefined;
        let yoloMode = false;

        if (configKey === 'gemini') {
          const config = await ConfigStorage.get('gemini.config');
          preferred = config?.preferredMode;
          yoloMode = config?.yoloMode ?? false;
        } else if (configKey === 'wcore') {
          const config = await ConfigStorage.get('wcore.config');
          preferred = config?.preferredMode;
        } else {
          const config = await ConfigStorage.get('acp.config');
          const backendConfig = config?.[configKey as AcpBackendAll] as Record<string, unknown> | undefined;
          preferred = backendConfig?.preferredMode as string | undefined;
          yoloMode = (backendConfig?.yoloMode as boolean) ?? false;
        }

        if (cancelled) return;

        // 1. Use preferredMode if valid
        if (preferred) {
          const modes = getAgentModes(configKey);
          if (modes.some((m) => m.value === preferred)) {
            _setSelectedMode(preferred);
            return;
          }
        }

        // 2. Fallback: legacy yoloMode
        if (yoloMode) {
          const yoloValues: Record<string, string> = {
            claude: 'bypassPermissions',
            gemini: 'yolo',
            codex: 'yolo',
            qwen: 'yolo',
          };
          _setSelectedMode(yoloValues[configKey] || 'yolo');
        }
      } catch {
        /* silent */
      }
    };

    void loadPreferredMode();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Eagerly resolve a missing per-backend model catalog (Claude Code has no
  // acp.cachedModels entry until a session connects) via getModelInfo, which
  // falls back to local config (~/.claude / cc-switch) with no live task. Without
  // this the LAUNCH picker shows "Default Model" until the first message is sent.
  useEffect(() => {
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    if (!backend || acpCachedModels[backend]?.availableModels?.length) return;
    let active = true;
    ipcBridge.acpConversation.getModelInfo
      .invoke({ conversationId: '', backend })
      .then((res) => {
        const info = res?.success ? res.data?.modelInfo : null;
        if (!active || !info?.availableModels?.length) return;
        setAcpCachedModels((prev) => (prev[backend]?.availableModels?.length ? prev : { ...prev, [backend]: info }));
      })
      .catch(() => {
        // Offline resolve is best-effort; the picker keeps its default until connect.
      });
    return () => {
      active = false;
    };
  }, [isPresetAgent, currentEffectiveAgentInfo.agentType, selectedAgentKey, acpCachedModels]);

  const currentAcpCachedModelInfo = useMemo(() => {
    // For preset agents, resolve to the actual backend type for model list lookup
    const backend = isPresetAgent
      ? currentEffectiveAgentInfo.agentType
      : selectedAgentKey.startsWith('custom:')
        ? 'custom'
        : selectedAgentKey;
    const cached = acpCachedModels[backend];
    if (cached) return cached;

    // No cached catalog for this backend yet. Return null (no hardcoded list):
    // GuidModelSelector then sources its unified model list from the live curated
    // catalog (`curatedForAgent`), so an enumerable CLI like Codex surfaces live
    // GPT models instead of a stale fallback.
    return null;
  }, [selectedAgentKey, acpCachedModels, isPresetAgent, currentEffectiveAgentInfo.agentType]);

  // Key of the first non-preset CLI agent (used as fallback when leaving preset mode)
  const defaultAgentKey = useMemo(() => {
    const firstCliAgent = availableAgents?.find((a) => !a.isPreset);
    return firstCliAgent ? getAgentKey(firstCliAgent) : 'wcore';
  }, [availableAgents]);

  /**
   * Select a preset assistant. Routes through getAgentKey() so the resulting
   * selection format matches the codebase's convention ("custom:X" for local
   * presets, "remote:X" when the backend is "remote") instead of a hand-formatted
   * string. The existing per-backend preferred-model + mode chain (earlier in
   * this hook) then applies the right model for the assistant's recommended
   * backend - without prompting the user.
   *
   * This is the load-bearing "Rory rule" implementation for the chat-redesign
   * Phase 2/3 surfaces (intent pills + library cards): pick an assistant, the
   * backend follows. No modal, no question.
   */
  const selectPresetAssistant = useCallback(
    (preset: { id: string; presetAgentType?: string }) => {
      // #380: default a typeless preset onto the bundled WCore engine, not Gemini.
      const backend = (preset.presetAgentType ?? 'wcore') as AcpBackend;
      const key = getAgentKey({ backend, customAgentId: preset.id });
      setSelectedAgentKey(key);
    },
    [setSelectedAgentKey]
  );

  return {
    selectedAgentKey,
    setSelectedAgentKey,
    selectPresetAssistant,
    defaultAgentKey,
    selectedAgent,
    selectedAgentInfo,
    isPresetAgent,
    availableAgents,
    customAgents,
    selectedMode,
    setSelectedMode,
    acpCachedModels,
    selectedAcpModel,
    setSelectedAcpModel,
    selectedAcpEffort,
    setSelectedAcpEffort,
    currentAcpCachedModelInfo,
    currentEffectiveAgentInfo,
    cachedConfigOptions,
    pendingConfigOptions,
    setPendingConfigOption,
    getAgentKey,
    findAgentByKey,
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    isMainAgentAvailable,
    getEffectiveAgentType,
    refreshCustomAgents,
    customAgentAvatarMap,
  };
};
