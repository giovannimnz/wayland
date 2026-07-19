import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WorkspaceComputerIndicator from '../../src/renderer/components/workspace/WorkspaceComputerIndicator';

describe('WorkspaceComputerIndicator', () => {
  it('shows the computer name and a green dot when connected', () => {
    render(
      <WorkspaceComputerIndicator
        status={{ workspace: '/workspace', computerName: 'ATIUS-SRV-1', connected: true, checkedAt: 1 }}
      />
    );

    expect(screen.getByText('ATIUS-SRV-1')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-computer-connected')).toHaveClass('text-[rgb(var(--success-6))]');
  });

  it('keeps the computer name but hides the green dot when disconnected', () => {
    render(
      <WorkspaceComputerIndicator
        status={{ workspace: '/workspace', computerName: 'ATIUS-SRV-2', connected: false, checkedAt: 1 }}
      />
    );

    expect(screen.getByText('ATIUS-SRV-2')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computer-connected')).not.toBeInTheDocument();
  });
});
