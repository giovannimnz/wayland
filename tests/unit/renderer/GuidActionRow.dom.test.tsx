import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const acpConfigSelectorSpy = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    loading: _loading,
    ...props
  }: React.ComponentProps<'button'> & { icon?: React.ReactNode; loading?: boolean }) => (
    <button {...props}>{icon ?? children}</button>
  ),
  Dropdown: ({ children, droplist }: React.PropsWithChildren & { droplist?: React.ReactNode }) => (
    <>
      {droplist}
      {children}
    </>
  ),
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    Item: ({ children, onClick }: React.PropsWithChildren & { onClick?: (e: any) => void }) => (
      <div onClick={onClick}>{children}</div>
    ),
    SubMenu: ({ children, title }: React.PropsWithChildren & { title?: React.ReactNode }) => (
      <div>
        {title}
        {children}
      </div>
    ),
  }),
  Checkbox: ({
    children,
    checked,
    onChange,
  }: React.PropsWithChildren & { checked?: boolean; onChange?: () => void }) => (
    <label>
      <input type='checkbox' checked={checked} onChange={onChange} />
      {children}
    </label>
  ),
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => <span>ArrowUp</span>,
  Brain: () => <span>Brain</span>,
  FolderOpen: () => <span>FolderOpen</span>,
  Lightning: () => <span>Lightning</span>,
  Plus: () => <span>Plus</span>,
  Shield: () => <span>Shield</span>,
  UploadOne: () => <span>UploadOne</span>,
}));

vi.mock('lucide-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('lucide-react')>()),
  ArrowUp: () => <span>ArrowUp</span>,
  Brain: () => <span>Brain</span>,
  FolderOpen: () => <span>FolderOpen</span>,
  Zap: () => <span>Lightning</span>,
  Plus: () => <span>Plus</span>,
  Shield: () => <span>Shield</span>,
  Upload: () => <span>UploadOne</span>,
}));

vi.mock('@/renderer/components/settings/DirectorySelectionModal', () => ({
  default: ({
    visible,
    initialPath,
    onConfirm,
  }: {
    visible: boolean;
    initialPath?: string;
    onConfirm: (paths: string[] | undefined) => void;
  }) =>
    visible ? (
      <button
        data-testid='web-workspace-modal'
        data-initial-path={initialPath}
        onClick={() => onConfirm(['/web/chosen/path'])}
      >
        WebWorkspaceModal
      </button>
    ) : null,
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div>AgentModeSelector</div>,
}));

vi.mock('@/renderer/components/agent/AcpConfigSelector', () => ({
  default: (props: unknown) => {
    acpConfigSelectorSpy(props);
    return null;
  },
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/services/FileService', () => ({
  FileService: {
    processDroppedFiles: vi.fn(),
  },
  getCleanFileNames: (files: string[]) => files,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    primary: '#000',
    secondary: '#666',
  },
}));

const mockIsElectronDesktop = vi.fn(() => true);
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mockIsElectronDesktop(),
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  getAgentModes: () => [{ label: 'Default', value: 'default' }],
  supportsModeSwitch: () => false,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: vi.fn(),
      },
    },
  },
}));

import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';
import { FileService } from '@/renderer/services/FileService';

describe('GuidActionRow', () => {
  const defaultProps = {
    files: [],
    onFilesUploaded: vi.fn(),
    onSelectWorkspace: vi.fn(),
    modelSelectorNode: <div>ModelSelector</div>,
    selectedAgent: 'gemini',
    selectedMode: 'default',
    onModeSelect: vi.fn(),
    isPresetAgent: false,
    selectedAgentInfo: undefined,
    customAgents: [],
    localeKey: 'en-US',
    onClosePresetTag: vi.fn(),
    builtinAutoSkills: [] as Array<{ name: string; description: string }>,
    disabledBuiltinSkills: [] as string[],
    onToggleBuiltinSkill: vi.fn(),
    loading: false,
    isButtonDisabled: false,
    speechInputNode: <button aria-label='speech-input'>Mic</button>,
    onSend: vi.fn(),
  };

  it('renders the speech input control next to the send button', () => {
    render(<GuidActionRow {...defaultProps} />);
    expect(screen.getByLabelText('speech-input')).toBeInTheDocument();
    expect(screen.getByText('ArrowUp')).toBeInTheDocument();
  });

  it('keeps Codex model, effort, speed and power inside the unified selector', () => {
    acpConfigSelectorSpy.mockClear();
    render(
      <GuidActionRow
        {...defaultProps}
        cachedConfigOptions={[
          { id: 'model', category: 'model', type: 'select', currentValue: 'gpt-5.6-sol' },
          { id: 'reasoning_effort', category: 'thought_level', type: 'select', currentValue: 'high' },
          { id: 'service_tier', category: 'service_tier', type: 'select', currentValue: 'normal' },
          { id: 'power', type: 'select', currentValue: 'gpt-5.6-sol:high' },
          { id: 'vendor_option', type: 'select', currentValue: 'on' },
        ]}
      />
    );

    expect(acpConfigSelectorSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialConfigOptions: [expect.objectContaining({ id: 'vendor_option' })],
      })
    );
  });

  // NOTE: builtin-skill count + toggle moved out of GuidActionRow's inline "+"
  // menu into the shared ComposerAddMenu. That behaviour is now covered by
  // ComposerAddMenu.dom.test.tsx (count pill) and useComposerSkills.dom.test.ts
  // (builtin toggle calls onToggleBuiltinSkill).

  it('renders standalone workspace button and calls onSelectWorkspace on click', async () => {
    const { ipcBridge } = await import('@/common');
    const onSelectWorkspace = vi.fn();
    vi.mocked(ipcBridge.dialog.showOpen.invoke).mockResolvedValueOnce(['/chosen/path']);

    render(<GuidActionRow {...defaultProps} onSelectWorkspace={onSelectWorkspace} />);

    const workspaceBtn = screen.getByText('conversation.welcome.specifyWorkspace');
    fireEvent.click(workspaceBtn);

    await vi.waitFor(() => {
      expect(ipcBridge.dialog.showOpen.invoke).toHaveBeenCalledWith({
        defaultPath: '/home/ubuntu/Servers',
        properties: ['openDirectory', 'createDirectory'],
      });
      expect(onSelectWorkspace).toHaveBeenCalledWith('/chosen/path');
    });
  });


  it('opens the web directory modal instead of invoking native dialog in WebUI mode', async () => {
    mockIsElectronDesktop.mockReturnValue(false);
    const { ipcBridge } = await import('@/common');
    const onSelectWorkspace = vi.fn();
    vi.mocked(ipcBridge.dialog.showOpen.invoke).mockClear();

    render(<GuidActionRow {...defaultProps} onSelectWorkspace={onSelectWorkspace} />);

    fireEvent.click(screen.getByText('conversation.welcome.specifyWorkspace'));

    expect(ipcBridge.dialog.showOpen.invoke).not.toHaveBeenCalled();
    const workspaceModal = screen.getByTestId('web-workspace-modal');
    expect(workspaceModal).toHaveAttribute('data-initial-path', '/home/ubuntu/Servers');
    fireEvent.click(workspaceModal);

    expect(onSelectWorkspace).toHaveBeenCalledWith('/web/chosen/path');
  });

  it('shows generic error toast when file upload fails', async () => {
    mockIsElectronDesktop.mockReturnValueOnce(false); // WebUI mode so file input is rendered
    const { Message } = await import('@arco-design/web-react');
    vi.mocked(FileService.processDroppedFiles).mockRejectedValueOnce(new Error('Upload failed'));

    render(<GuidActionRow {...defaultProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);

    expect(Message.error).toHaveBeenCalledWith('common.fileAttach.failed');
  });
});
