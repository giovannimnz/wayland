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
    const dot = screen.getByTestId('workspace-computer-connected');
    expect(dot).toHaveAttribute('width', '8');
    expect(dot).toHaveAttribute('height', '8');
    expect(dot).toHaveAttribute('stroke', 'var(--success, #34d399)');
    expect(dot).toHaveAttribute('fill', 'var(--success, #34d399)');
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
