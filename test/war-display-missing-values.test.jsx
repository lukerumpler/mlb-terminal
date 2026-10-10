import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  TeamEfficiencyComparisonView,
  TeamEfficiencyOverviewPanel,
  formatWar,
} from '../client/src/components/TeamEfficiencyPanels.jsx';

const baseRecord = {
  found: true,
  status: 'live',
  season: 2026,
  team: 'San Diego Padres',
  teamAbbreviation: 'SD',
  payroll: { amountUsd: 200_000_000, basis: 'payroll', source: 'Spotrac' },
  war: { total: 40, fWAR: 41, bWAR: 39, provider: 'FanGraphs + Baseball-Reference', methodology: 'Blended fWAR/bWAR average' },
  efficiency: { dollarsPerWar: 5_000_000, warPer100m: 20 },
  retrievedAt: '2026-09-23T00:00:00.000Z',
  warnings: [],
};

describe('formatWar: missing is unavailable, never zero', () => {
  it.each([[null], [undefined], [''], ['   '], ['n/a'], [NaN]])('renders %j as an em dash', value => {
    expect(formatWar(value)).toBe('—');
  });

  it('keeps real zero and real negative values', () => {
    expect(formatWar(0)).toBe('0.0');
    expect(formatWar('0')).toBe('0.0');
    expect(formatWar(-1.2)).toBe('-1.2');
    expect(formatWar('-2.4')).toBe('-2.4');
    expect(formatWar(12.34)).toBe('12.3');
  });

  it('does not print a negative zero', () => {
    expect(formatWar(-0.04)).toBe('0.0');
  });
});

describe('overview panel with missing WAR parts', () => {
  it('says the defensive blend is unavailable when the server sends null', () => {
    render(<TeamEfficiencyOverviewPanel record={{ ...baseRecord, war: { ...baseRecord.war, defensive: null } }} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Comparable defensive blend unavailable/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Defensive blend 0\.0/)).toBeNull();
  });

  it('shows a dash, not 0.0, for the side of the split that is missing', () => {
    render(<TeamEfficiencyOverviewPanel record={{ ...baseRecord, war: { ...baseRecord.war, offensive: 20, pitching: null, splitProvider: 'FanGraphs' } }} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Off 20\.0 · Pit — \(FanGraphs\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pit 0\.0/)).toBeNull();
  });

  it('still shows a real negative offensive or pitching value', () => {
    render(<TeamEfficiencyOverviewPanel record={{ ...baseRecord, war: { ...baseRecord.war, offensive: -1.5, pitching: 3, splitProvider: 'FanGraphs' } }} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Off -1\.5 · Pit 3\.0 \(FanGraphs\)/).length).toBeGreaterThan(0);
  });
});

describe('comparison table with a source-gap row', () => {
  it('shows dashes for WAR and WAR/$100M instead of 0.0 and 0.00', () => {
    render(
      <TeamEfficiencyComparisonView
        rows={[
          { ...baseRecord },
          {
            team: 'New York Yankees',
            teamAbbreviation: 'NYY',
            found: false,
            status: 'source-gap',
            payroll: { amountUsd: null },
            war: { total: null, fWAR: null, bWAR: null, defensive: null, provider: 'Unavailable' },
            efficiency: { dollarsPerWar: null, warPer100m: null },
          },
        ]}
        season={2026}
      />
    );
    const row = screen.getByRole('row', { name: /New York Yankees/ });
    expect(within(row).queryByText('0.0')).toBeNull();
    expect(within(row).queryByText('0.00')).toBeNull();
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    const title = row.querySelector('td[title]')?.getAttribute('title') || '';
    expect(title).not.toMatch(/defensive blend/i);
    expect(title).toMatch(/fWAR — · bWAR —/);
  });
});
