import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildRosterRows } from '../client/src/pages/OverviewPage.jsx';
import { RosterInsightsTableSkeleton } from '../client/src/components/PageSkeletons.jsx';

const players = {
  hitting: [
    { id: 1, name: 'Alpha Batter', position: 'RF', stat: { ops: 0.812, plateAppearances: 190 } },
    { id: 2, name: 'Beta Batter', position: 'CF', stat: { ops: 0.945, plateAppearances: 205 } },
    { id: 3, name: 'Gamma Batter', position: '1B', stat: { ops: 0.731, plateAppearances: 170 } },
  ],
  pitching: [],
};

describe('roster insights table helpers', () => {
  it('filters player rows by name and applies an explicitly selected sort direction', () => {
    expect(buildRosterRows(players, [], 'ops', 0, 0, 'asc').map(row => row.name)).toEqual(['Gamma Batter', 'Alpha Batter', 'Beta Batter']);
    expect(buildRosterRows(players, [], 'ops', 0, 0, 'desc', 'beta').map(row => row.name)).toEqual(['Beta Batter']);
  });

  it('renders an accessible table-shaped roster loading state', () => {
    render(<RosterInsightsTableSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading roster insight table' })).toBeInTheDocument();
    expect(screen.getByText('Loading verified roster statistics and player metrics.')).toBeInTheDocument();
  });
});
