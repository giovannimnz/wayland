import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track calls to prepareFirstMessageWithSkillsIndex
const { mockPrepareFirstMessage, mockAgentSendMessage } = vi.hoisted(() => ({
  mockPrepareFirstMessage: vi.fn(async (content: string) => ({ content: `[injected] ${content}`, loadedSkills: [] })),
  mockAgentSendMessage: vi.fn(async () => ({ success: true })),
}));

// --- Module mocks ---

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: vi.fn() } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
      listChanged: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    updateConversation: vi.fn(),
    getConversation: vi.fn(() => ({ success: true, data: { extra: {}, source: 'wayland' } })),
  })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        // Provide cached init results so shouldInjectTeamGuideMcp returns true for claude/gemini
        return {
          claude: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {},
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      return null;
    }),
    set: vi.fn(async () => {}),
  },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: () => [] }) },
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((e: unknown) => String(e)),
  uuid: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(),
  processCronInMessage: vi.fn(),
}));

vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((s: string) => s),
}));

vi.mock('@process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

// Mock hasNativeSkillSupport to use real logic for known backends
vi.mock('@process/utils/initAgent', () => ({
  hasNativeSkillSupport: vi.fn((backend: string | undefined) => {
    const supported = ['gemini', 'claude', 'codebuddy', 'codex', 'qwen', 'goose', 'droid', 'kimi', 'vibe', 'cursor'];
    return !!backend && supported.includes(backend);
  }),
  setupAssistantWorkspace: vi.fn(),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: mockPrepareFirstMessage,
  buildSystemInstructions: vi.fn(async () => undefined),
  buildTurnSkillContext: vi.fn(async () => ({ advert: '', autoLoaded: [] })),
  resolveCapabilitiesManifest: vi.fn(async () => undefined),
}));

// Mock AcpAgent class
vi.mock('@process/agent/acp', () => ({
  AcpAgent: vi.fn().mockImplementation(() => ({
    sendMessage: mockAgentSendMessage,
    getModelInfo: vi.fn(() => null),
    getSessionState: vi.fn(() => null),
    stop: vi.fn(),
    kill: vi.fn(),
    on: vi.fn().mockReturnThis(),
  })),
}));

import AcpAgentManager, {
  DEFAULT_WORKSPACE_HYBRID_ROUTES,
  resolveWorkspaceHybridContextFromRoutes,
} from '@process/task/AcpAgentManager';

function createManager(
  overrides: {
    backend?: string;
    customWorkspace?: boolean;
    presetContext?: string;
    enabledSkills?: string[];
    workspace?: string;
  } = {}
) {
  const data = {
    conversation_id: 'test-conv',
    backend: overrides.backend ?? 'claude',
    workspace: overrides.workspace ?? '/tmp/test-workspace',
    customWorkspace: overrides.customWorkspace,
    presetContext: overrides.presetContext,
    enabledSkills: overrides.enabledSkills,
  };
  // @ts-expect-error - backend type narrowing
  const manager = new AcpAgentManager(data);
  return manager;
}

async function sendFirstMessage(manager: InstanceType<typeof AcpAgentManager>, content = 'Hello') {
  // Stub initAgent to set up a mock agent without actual process bootstrapping
  const mockAgent = {
    sendMessage: mockAgentSendMessage,
    getModelInfo: vi.fn(() => null),
    on: vi.fn().mockReturnThis(),
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing private fields for test setup
  (manager as unknown as Record<string, unknown>).agent = mockAgent;
  (manager as unknown as Record<string, unknown>).bootstrap = Promise.resolve(mockAgent);

  // Override initAgent to just return the already-bootstrapped agent
  vi.spyOn(manager, 'initAgent').mockResolvedValue(mockAgent as never);

  return manager.sendMessage({ content, msg_id: 'msg-1' });
}

describe('AcpAgentManager - first-message skill injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it('maps mounted NFS workspaces back to their owner host paths', () => {
    const srv1 = resolveWorkspaceHybridContextFromRoutes(
      '/home/ubuntu/Servers/atius-srv-1/GitHub/router-ai-atius',
      DEFAULT_WORKSPACE_HYBRID_ROUTES
    );
    expect(srv1).toMatchObject({
      hostId: 'atius-srv-1',
      sshTarget: 'atius-srv-1',
      remoteWorkspace: '/home/ubuntu/GitHub/router-ai-atius',
    });

    const horistic = resolveWorkspaceHybridContextFromRoutes(
      '/home/ubuntu/Servers/horistic-srv/GitHub/strategy-lab',
      DEFAULT_WORKSPACE_HYBRID_ROUTES
    );
    expect(horistic).toMatchObject({
      hostId: 'horistic-srv',
      sshTarget: 'horistic-srv',
      remoteWorkspace: '/home/horistic/GitHub/strategy-lab',
    });
  });

  it('uses native skills and injects hybrid workspace rules for supported NFS mounts', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
      presetContext: 'You are helpful.',
      enabledSkills: ['pptx'],
      workspace: '/home/ubuntu/Servers/atius-srv-1/GitHub/router-ai-atius',
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    expect(sentContent).toContain('[Assistant Rules');
    expect(sentContent).toContain('You are helpful.');
    expect(sentContent).toContain('[Workspace Execution Mode]');
    expect(sentContent).toContain('ssh atius-srv-1');
    expect(sentContent).toContain('/home/ubuntu/GitHub/router-ai-atius');
    expect(sentContent).toContain('[User Request]');
  });

  it('prepends a short hybrid reminder on later turns in NFS workspaces', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
      workspace: '/home/ubuntu/Servers/atius-srv-2/GitHub/ats',
    });

    await sendFirstMessage(manager, 'Prime turn');
    await manager.sendMessage({ content: 'Run the validation command', msg_id: 'msg-2' });

    const secondTurnContent = mockAgentSendMessage.mock.calls[1][0].content as string;
    expect(secondTurnContent).toContain('[Workspace Execution Mode]');
    expect(secondTurnContent).toContain('Hybrid default for this folder');
    expect(secondTurnContent).toContain('atius-srv-2:/home/ubuntu/GitHub/ats');
  });

  it('falls back to prompt injection for supported backend WITH customWorkspace', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: true,
      presetContext: 'You are helpful.',
      enabledSkills: ['pptx'],
      workspace: '/home/ubuntu/Servers/atius-srv-1/GitHub/router-ai-atius',
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({
        enabledSkills: ['pptx'],
        enableTeamGuide: true,
        backend: 'claude',
        presetContext: expect.stringContaining('You are helpful.'),
      })
    );
    expect(mockPrepareFirstMessage.mock.calls[0][1]?.presetContext).toContain('[Workspace Execution Mode]');
    expect(mockPrepareFirstMessage.mock.calls[0][1]?.presetContext).toContain('/home/ubuntu/GitHub/router-ai-atius');
  });

  it('falls back to prompt injection for unsupported backend regardless of customWorkspace', async () => {
    const manager = createManager({
      backend: 'auggie',
      customWorkspace: false,
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).toHaveBeenCalledWith('Hello', {
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
      enableTeamGuide: false,
      backend: 'auggie',
    });
  });

  it('injects team guide prompt even when presetContext is undefined (native path, whitelisted backend)', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
    });

    await sendFirstMessage(manager, 'Test message');

    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    // claude is whitelisted for team guide → content should include team guide prompt
    expect(sentContent).toContain('[Assistant Rules');
    expect(sentContent).toContain('Team Mode');
    expect(sentContent).toContain('[User Request]');
    expect(sentContent).toContain('Test message');
  });
});
