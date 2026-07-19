import { describe, expect, it, vi } from 'vitest';

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => undefined) },
}));

import {
  DEFAULT_WORKSPACE_HYBRID_ROUTES,
  resolveWorkspaceComputerIdentity,
  resolveWorkspaceHybridContextFromRoutes,
} from '@/common/utils/workspaceComputer';
import { hasRemoteMountForWorkspace, parseLinuxMountInfo } from '@process/services/workspaceComputerStatus';

describe('workspace computer status', () => {
  it('resolves an NFS workspace to its owner computer', () => {
    const workspace = '/home/ubuntu/Servers/atius-srv-1/GitHub/containers/router-ai-atius';
    expect(resolveWorkspaceComputerIdentity(workspace, DEFAULT_WORKSPACE_HYBRID_ROUTES, 'atius-srv-3')).toEqual({
      hostId: 'atius-srv-1',
      computerName: 'ATIUS-SRV-1',
      remote: true,
    });
  });

  it('labels local workspaces with the local short hostname', () => {
    expect(resolveWorkspaceComputerIdentity('/home/ubuntu/GitHub/wayland', [], 'atius-srv-3.atius.test')).toEqual({
      hostId: 'atius-srv-3',
      computerName: 'ATIUS-SRV-3',
      remote: false,
    });
  });

  it('uses the longest matching route for nested mounts', () => {
    const resolved = resolveWorkspaceHybridContextFromRoutes('/mnt/repos/private/app', [
      { hostId: 'outer', mountPath: '/mnt/repos', remoteRoot: '/repos' },
      { hostId: 'inner', mountPath: '/mnt/repos/private', remoteRoot: '/private' },
    ]);
    expect(resolved?.hostId).toBe('inner');
    expect(resolved?.remoteWorkspace).toBe('/private/app');
  });

  it('marks only active remote filesystems as connected, never autofs placeholders', () => {
    const mountInfo = [
      '41 29 0:42 / /home/ubuntu/Servers/atius-srv-1/GitHub rw,relatime - autofs systemd-1 rw',
      '52 41 0:55 / /home/ubuntu/Servers/atius-srv-2/GitHub rw,relatime - nfs4 10.12.1.12:/home/ubuntu/GitHub rw',
      '53 41 0:56 / /home/ubuntu/Servers/horistic-srv/GitHub\\040Projects rw,relatime - nfs4 host:/exports rw',
    ].join('\n');
    const mounts = parseLinuxMountInfo(mountInfo);

    expect(hasRemoteMountForWorkspace('/home/ubuntu/Servers/atius-srv-1/GitHub/app', mounts)).toBe(false);
    expect(hasRemoteMountForWorkspace('/home/ubuntu/Servers/atius-srv-2/GitHub/app', mounts)).toBe(true);
    expect(hasRemoteMountForWorkspace('/home/ubuntu/Servers/horistic-srv/GitHub Projects/app', mounts)).toBe(true);
  });
});
