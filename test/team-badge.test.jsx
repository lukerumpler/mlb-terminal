import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TeamBadge from '../client/src/components/TeamBadge.jsx';
import { setLowDataMode } from '../client/src/lib/lowData.js';

describe('TeamBadge', () => {
  beforeEach(() => {
    cleanup();
    setLowDataMode(false);
  });

  afterEach(() => {
    cleanup();
    setLowDataMode(false);
  });

  it('shows an accessible abbreviation fallback when a logo fails to load', () => {
    render(<TeamBadge teamId={109} teamAbbr="ARI" />);
    fireEvent.error(screen.getByRole('img', { name: 'ARI' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByLabelText('ARI logo unavailable')).toHaveTextContent('ARI');
  });

  it('clears a previous image failure when the team changes', () => {
    const { rerender } = render(<TeamBadge teamId={109} teamAbbr="ARI" />);
    fireEvent.error(screen.getByRole('img', { name: 'ARI' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<TeamBadge teamId={139} teamAbbr="TB" />);
    expect(screen.getByRole('img', { name: 'TB' })).toBeInTheDocument();
  });
});
