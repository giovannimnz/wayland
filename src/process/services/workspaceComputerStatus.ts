import fs from 'node:fs/promises';
import os from 'node:os';
import { ProcessConfig } from '@process/utils/initStorage';
import {
  DEFAULT_WORKSPACE_HYBRID_ROUTES,
  WORKSPACE_HYBRID_ROUTES_CONFIG_KEY,
  mergeWorkspaceHybridRoutes,
  normalizeWorkspacePath,
  resolveWorkspaceComputerIdentity,
  toWorkspaceHybridRoute,
  type WorkspaceComputerStatus,
  type WorkspaceHybridRoute,
} from '@/common/utils/workspaceComputer';

export type MountedFilesystem = { mountPoint: string; fsType: string };

const REMOTE_FILESYSTEMS = new Set(['nfs', 'nfs4', 'cifs', 'smb3', 'fuse.sshfs']);

function unescapeMountInfoPath(value: string): string {
  return value.replace(/\\(040|011|012|134)/g, (_match, code: string) => {
    if (code === '040') return ' ';
    if (code === '011') return '\t';
    if (code === '012') return '\n';
    return '\\';
  });
}

export function parseLinuxMountInfo(contents: string): MountedFilesystem[] {
  const mounts: MountedFilesystem[] = [];
  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    const separator = line.indexOf(' - ');
    if (separator < 0) continue;
    const left = line.slice(0, separator).split(' ');
    const right = line.slice(separator + 3).split(' ');
    if (left.length < 5 || !right[0]) continue;
    mounts.push({ mountPoint: normalizeWorkspacePath(unescapeMountInfoPath(left[4])), fsType: right[0] });
  }
  return mounts;
}

export function hasRemoteMountForWorkspace(workspace: string, mounts: MountedFilesystem[]): boolean {
  const normalizedWorkspace = normalizeWorkspacePath(workspace);
  return mounts.some(({ mountPoint, fsType }) => {
    if (!REMOTE_FILESYSTEMS.has(fsType.toLowerCase())) return false;
    return normalizedWorkspace === mountPoint || normalizedWorkspace.startsWith(`${mountPoint}/`);
  });
}

async function loadWorkspaceHybridRoutes(): Promise<WorkspaceHybridRoute[]> {
  try {
    const raw = await (ProcessConfig as unknown as { get: (key: string) => Promise<unknown> }).get(
      WORKSPACE_HYBRID_ROUTES_CONFIG_KEY
    );
    const configuredRoutes = Array.isArray(raw)
      ? raw.map(toWorkspaceHybridRoute).filter((route): route is WorkspaceHybridRoute => route !== null)
      : [];
    return mergeWorkspaceHybridRoutes(configuredRoutes);
  } catch {
    return [...DEFAULT_WORKSPACE_HYBRID_ROUTES];
  }
}

async function localWorkspaceExists(workspace: string): Promise<boolean> {
  try {
    await fs.access(workspace);
    return true;
  } catch {
    return false;
  }
}

export async function getWorkspaceComputerStatuses(workspaces: string[]): Promise<WorkspaceComputerStatus[]> {
  const uniqueWorkspaces = Array.from(
    new Set(
      workspaces.filter((workspace) => typeof workspace === 'string' && workspace.trim()).map(normalizeWorkspacePath)
    )
  ).slice(0, 250);
  if (uniqueWorkspaces.length === 0) return [];

  const [routes, mountInfo] = await Promise.all([
    loadWorkspaceHybridRoutes(),
    fs.readFile('/proc/self/mountinfo', 'utf8').catch(() => ''),
  ]);
  const mounts = parseLinuxMountInfo(mountInfo);
  const localHostname = os.hostname();
  const checkedAt = Date.now();

  return Promise.all(
    uniqueWorkspaces.map(async (workspace) => {
      const identity = resolveWorkspaceComputerIdentity(workspace, routes, localHostname);
      const connected = identity.remote
        ? hasRemoteMountForWorkspace(workspace, mounts)
        : await localWorkspaceExists(workspace);
      return { workspace, computerName: identity.computerName, connected, checkedAt };
    })
  );
}
