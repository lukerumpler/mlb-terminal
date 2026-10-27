/*
Our goal is to make sure the team efficiency screens never show a made-up zero when a WAR number is missing. A missing value
should read as a dash, because "0.0" would claim the team's WAR really is zero. The old code turned a missing value into a zero
because JavaScript's Number(null) is 0, so a team with no data could show "0.0" WAR and "0.00" WAR per $100M.

To solve this we are going to:
  1. Check formatWar on every kind of missing value (null, undefined, blank, text, NaN) and on real values (zero and negatives)
  2. Draw the overview panel with a missing defensive blend and with only one side of the offense/pitching split
  3. Draw the comparison table with a team that has no data at all (a "source gap") and look at its row
  4. Cross-check that real negative values still show their minus sign and that "-0.0" is printed as "0.0"
*/
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  TeamEfficiencyComparisonView,
  TeamEfficiencyOverviewPanel,
  formatWar,
} from '../client/src/components/TeamEfficiencyPanels.jsx';

// Section A: Inputs

const baseRecord = {                                       // A team with everything present, we remove pieces from this one
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


// Section B: The formatting function

describe('formatWar: missing is unavailable, never zero', () => {
  it.each([[null], [undefined], [''], ['   '], ['n/a'], [NaN]])('renders %j as an em dash', value => {
    expect(formatWar(value)).toBe('—');                    // Every kind of "missing" becomes a dash
  });

  it('keeps real zero and real negative values', () => {
    expect(formatWar(0)).toBe('0.0');                      // A real zero stays a zero
    expect(formatWar('0')).toBe('0.0');
    expect(formatWar(-1.2)).toBe('-1.2');                  // A real negative keeps its minus sign
    expect(formatWar('-2.4')).toBe('-2.4');
    expect(formatWar(12.34)).toBe('12.3');                 // One decimal place
  });

  it('does not print a negative zero', () => {
    expect(formatWar(-0.04)).toBe('0.0');                  // This would round to "-0.0", which looks odd, so we print "0.0"
  });
});


// Section C: The overview panel

describe('overview panel with missing WAR parts', () => {
  it('says the defensive blend is unavailable when the server sends null', () => {
    const record = { ...baseRecord, war: { ...baseRecord.war, defensive: null } };      // Take away the defensive number
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Comparable defensive blend unavailable/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Defensive blend 0\.0/)).toBeNull();                      // It must not claim a zero
  });

  it('shows a dash, not 0.0, for the side of the split that is missing', () => {
    const record = { ...baseRecord, war: { ...baseRecord.war, offensive: 20, pitching: null, splitProvider: 'FanGraphs' } };   // Offense but no pitching
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Off 20\.0 · Pit — \(FanGraphs\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pit 0\.0/)).toBeNull();
  });

  it('still shows a real negative offensive or pitching value', () => {
    const record = { ...baseRecord, war: { ...baseRecord.war, offensive: -1.5, pitching: 3, splitProvider: 'FanGraphs' } };    // A real negative offense
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Off -1\.5 · Pit 3\.0 \(FanGraphs\)/).length).toBeGreaterThan(0);
  });
});


// Section D: The comparison table

describe('comparison table with a source-gap row', () => {
  it('shows dashes for WAR and WAR/$100M instead of 0.0 and 0.00', () => {
    const yankees = {                                      // A team where every source came back empty
      team: 'New York Yankees',
      teamAbbreviation: 'NYY',
      found: false,
      status: 'source-gap',
      payroll: { amountUsd: null },
      war: { total: null, fWAR: null, bWAR: null, defensive: null, provider: 'Unavailable' },
      efficiency: { dollarsPerWar: null, warPer100m: null },
    };
    render(<TeamEfficiencyComparisonView rows={[{ ...baseRecord }, yankees]} season={2026} />);

    const row = screen.getByRole('row', { name: /New York Yankees/ });
    expect(within(row).queryByText('0.0')).toBeNull();                                  // No made-up zero for WAR
    expect(within(row).queryByText('0.00')).toBeNull();                                 // Or for WAR per $100M
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2);             // Dashes instead

    const title = row.querySelector('td[title]')?.getAttribute('title') || '';          // The hover text on the WAR cell
    expect(title).not.toMatch(/defensive blend/i);
    expect(title).toMatch(/fWAR — · bWAR —/);
  });
});
