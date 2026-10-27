import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OrganizationRosterDirectory from '../client/src/components/OrganizationRosterDirectory.jsx';
import { getOrganizationRoster } from '../client/src/api/mlb.js';

vi.mock('../client/src/api/mlb.js', () => ({
  getAllOrganizationRosters: vi.fn(),
  getOrganizationRoster: vi.fn(),
}));

describe('OrganizationRosterDirectory', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('renders the full roster response instead of silently stopping at 150 players', async () => {
    const players = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      name: `Player ${String(index + 1).padStart(3, '0')}`,
      position: 'OF',
      age: 22,
      bats: 'R',
      throws: 'R',
      rosterStatus: 'Active',
    }));
    getOrganizationRoster.mockResolvedValue({
      players,
      source: 'MLB Stats API · fullRoster',
      retrievedAt: Date.now(),
    });

    render(<OrganizationRosterDirectory />);

    expect(await screen.findByText('Player 200')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(201);
    expect(screen.queryByText(/Showing the first 150 matches/i)).not.toBeInTheDocument();
  });
});
