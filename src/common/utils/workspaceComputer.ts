import { posix } from 'node:path';

export type WorkspaceHybridRoute = {
  hostId: string;
  mountPath: string;
  remoteRoot: string;
  sshTarget?: string;
};

export type ResolvedWorkspaceHybridContext = WorkspaceHybridRoute & {
  sshTarget: string;
  localWorkspace: string;
  remoteWorkspace: string;
};

export type WorkspaceComputerStatus = {
  workspace: string;
  computerName: string;
  connected: boolean;
  checkedAt: number;
};

export const WORKSPACE_HYBRID_ROUTES_CONFIG_KEY = 'atius.workspaceHybridRoutes' as const;

export const DEFAULT_WORKSPACE_HYBRID_ROUTES: WorkspaceHybridRoute[] = [
  {
    hostId: 'atius-srv-1',
    mountPath: '/home/ubuntu/Servers/atius-srv-1/GitHub',
    remoteRoot: '/home/ubuntu/GitHub',
    sshTarget: 'atius-srv-1',
  },
  {
    hostId: 'atius-srv-2',
    mountPath: '/home/ubuntu/Servers/atius-srv-2/GitHub',
    remoteRoot: '/home/ubuntu/GitHub',
    sshTarget: 'atius-srv-2',
  },
  {
    hostId: 'horistic-srv',
    mountPath: '/home/ubuntu/Servers/horistic-srv/GitHub',
    remoteRoot: '/home/horistic/GitHub',
    sshTarget: 'horistic-srv',
  },
];

export function normalizeWorkspacePath(value: string): string {
  const normalized = posix.normalize(value.trim());
  if (!normalized || normalized === '.') return '/';
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export function toWorkspaceHybridRoute(value: unknown): WorkspaceHybridRoute | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const hostId = typeof record.hostId === 'string' ? record.hostId.trim() : '';
  const mountPath = typeof record.mountPath === 'string' ? record.mountPath.trim() : '';
  const remoteRoot = typeof record.remoteRoot === 'string' ? record.remoteRoot.trim() : '';
  const sshTarget = typeof record.sshTarget === 'string' ? record.sshTarget.trim() : '';
  if (!hostId || !mountPath || !remoteRoot) return null;
  return {
    hostId,
    mountPath: normalizeWorkspacePath(mountPath),
    remoteRoot: normalizeWorkspacePath(remoteRoot),
    ...(sshTarget ? { sshTarget } : {}),
  };
}

export function mergeWorkspaceHybridRoutes(configuredRoutes: WorkspaceHybridRoute[]): WorkspaceHybridRoute[] {
  const byMountPath = new Map<string, WorkspaceHybridRoute>();
  for (const route of DEFAULT_WORKSPACE_HYBRID_ROUTES) byMountPath.set(route.mountPath, route);
  for (const route of configuredRoutes) byMountPath.set(route.mountPath, route);
  return Array.from(byMountPath.values());
}

export function resolveWorkspaceHybridContextFromRoutes(
  workspace: string | undefined,
  routes: WorkspaceHybridRoute[]
): ResolvedWorkspaceHybridContext | null {
  const normalizedWorkspace = typeof workspace === 'string' ? normalizeWorkspacePath(workspace) : '';
  if (!normalizedWorkspace || normalizedWorkspace === '/') return null;

  for (const route of routes.toSorted((a, b) => b.mountPath.length - a.mountPath.length)) {
    const mountPath = normalizeWorkspacePath(route.mountPath);
    if (normalizedWorkspace !== mountPath && !normalizedWorkspace.startsWith(`${mountPath}/`)) continue;

    const relativePath = posix.relative(mountPath, normalizedWorkspace);
    const remoteWorkspace =
      !relativePath || relativePath === '.' ? route.remoteRoot : posix.join(route.remoteRoot, relativePath);
    return {
      ...route,
      sshTarget: route.sshTarget?.trim() || route.hostId,
      localWorkspace: normalizedWorkspace,
      remoteWorkspace: normalizeWorkspacePath(remoteWorkspace),
    };
  }

  return null;
}

export function resolveWorkspaceComputerIdentity(
  workspace: string,
  routes: WorkspaceHybridRoute[],
  localHostname: string
): { hostId: string; computerName: string; remote: boolean } {
  const route = resolveWorkspaceHybridContextFromRoutes(workspace, routes);
  const normalizedWorkspace = normalizeWorkspacePath(workspace);
  const mountedHost = normalizedWorkspace.match(/\/Servers\/([^/]+)(?:\/|$)/)?.[1];
  const hostId = route?.hostId || mountedHost || localHostname.split('.')[0] || localHostname;
  return {
    hostId,
    computerName: hostId.toUpperCase(),
    remote: Boolean(route || mountedHost),
  };
}
