import { ipcBridge } from '@/common';
import type { WorkspaceComputerStatus } from '@/common/utils/workspaceComputer';
import { useEffect, useMemo, useState } from 'react';

const REFRESH_INTERVAL_MS = 15_000;

export function useWorkspaceComputerStatuses(workspaces: readonly (string | undefined)[]) {
  const workspaceKey = useMemo(
    () =>
      Array.from(new Set(workspaces.filter((workspace): workspace is string => Boolean(workspace?.trim()))))
        .toSorted()
        .join('\n'),
    [workspaces]
  );
  const [statuses, setStatuses] = useState<Record<string, WorkspaceComputerStatus>>({});

  useEffect(() => {
    const requestedWorkspaces = workspaceKey ? workspaceKey.split('\n') : [];
    if (requestedWorkspaces.length === 0) {
      setStatuses({});
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const nextStatuses = await ipcBridge.project.getComputerStatuses.invoke({ workspaces: requestedWorkspaces });
        if (!active) return;
        setStatuses(Object.fromEntries(nextStatuses.map((status) => [status.workspace, status])));
      } catch (error) {
        console.warn('[workspace-computer-status] refresh failed', error);
      }
    };

    void refresh();
    const timer = window.setInterval((): void => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [workspaceKey]);

  return statuses;
}
