import type { WorkspaceComputerStatus } from '@/common/utils/workspaceComputer';
import { Circle } from 'lucide-react';
import React from 'react';

type WorkspaceComputerIndicatorProps = {
  status?: WorkspaceComputerStatus;
};

const WorkspaceComputerIndicator: React.FC<WorkspaceComputerIndicatorProps> = ({ status }) => {
  if (!status) return null;

  const statusLabel = status.connected ? 'connected' : 'disconnected';
  const connectedColor = 'var(--success, #34d399)';
  return (
    <span
      className='flex items-center gap-6px shrink-0 text-11px font-500 leading-16px text-t-tertiary'
      title={`${status.computerName} — ${statusLabel}`}
      aria-label={`${status.computerName} ${statusLabel}`}
    >
      <span>{status.computerName}</span>
      {status.connected && (
        <Circle
          aria-hidden='true'
          data-testid='workspace-computer-connected'
          size={8}
          strokeWidth={0}
          color={connectedColor}
          fill={connectedColor}
          className='shrink-0'
        />
      )}
    </span>
  );
};

export default WorkspaceComputerIndicator;
