import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeamEfficiencyComparisonView, TeamEfficiencyOverviewPanel } from '../client/src/components/TeamEfficiencyPanels.jsx';

const record = {
  found: true,
  status: 'live',
  season: 2026,
  team: 'San Diego Padres',
  teamAbbreviation: 'SD',
  payroll: { amountUsd: 200_000_000, basis: 'payroll', source: 'Spotrac' },
  war: { total: 40, provider: 'FanGraphs', methodology: 'fWAR' },
  efficiency: { dollarsPerWar: 5_000_000, warPer100m: 20 },
  retrievedAt: '2026-09-23T00:00:00.000Z',
  warnings: [],
};

describe('team efficiency panels', () => {
  it('renders the overview metric inputs and source attribution', () => {
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getByText('Salary-to-WAR Efficiency')).toBeTruthy();
    expect(screen.getByText('$200.0M')).toBeTruthy();
    expect(screen.getByText('$5.0M/WAR')).toBeTruthy();
    expect(screen.getByLabelText(/FanGraphs source Live/i)).toBeTruthy();
    expect(screen.getByText(/Payroll: Spotrac/)).toBeTruthy();
  });

  it('renders an honest unavailable state without inventing a ratio', () => {
    render(<TeamEfficiencyOverviewPanel record={{ status: 'source-gap', warnings: ['No verified team WAR row matched the requested team'] }} teamName="Unknown Team" />);
    expect(screen.getByText(/No verified team WAR row matched/)).toBeTruthy();
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
  });

  it('sorts complete comparison rows while leaving incomplete rows visible', () => {
    render(<TeamEfficiencyComparisonView rows={[
      { team: 'San Diego Padres', teamAbbreviation: 'SD', found: true, status: 'live', payroll: { amountUsd: 200_000_000 }, war: { total: 40, provider: 'FanGraphs' }, efficiency: { dollarsPerWar: 5_000_000, warPer100m: 20 } },
      { team: 'New York Yankees', teamAbbreviation: 'NYY', found: false, status: 'source-gap', payroll: { amountUsd: null }, war: { total: null, provider: 'Unavailable' }, efficiency: { dollarsPerWar: null, warPer100m: null } },
    ]} season={2026} />);
    expect(screen.getByRole('row', { name: /San Diego Padres/ })).toBeTruthy();
    expect(screen.getByRole('row', { name: /New York Yankees/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /WAR \/ \$100M/ }));
    expect(screen.getAllByText('20.00').length).toBeGreaterThan(0);
  });
});
