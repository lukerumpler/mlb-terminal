import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  // Vitest globals are off, so Testing Library does not unmount between tests on its own.
  afterEach(() => cleanup());

  it('renders the overview metric inputs and source attribution', () => {
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getByText('Salary-to-WAR Efficiency')).toBeTruthy();
    expect(screen.getByText('$200.0M')).toBeTruthy();
    expect(screen.getByText('$5.0M/WAR')).toBeTruthy();
    expect(screen.getByLabelText(/FanGraphs source Live/i)).toBeTruthy();
    expect(screen.getByText(/Payroll: Spotrac/)).toBeTruthy();
  });

  it('shows the offensive/pitching split with its provider, or says it is unavailable', () => {
    const { unmount } = render(<TeamEfficiencyOverviewPanel record={{ ...record, war: { ...record.war, offensive: 22.1, pitching: 14.3, splitProvider: 'Baseball-Reference' } }} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Off 22\.1 · Pit 14\.3 \(Baseball-Reference\)/).length).toBeGreaterThan(0);
    unmount();
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Offensive\/pitching split unavailable/).length).toBeGreaterThan(0);
  });

  it('shows crowd agreement, the cross-source efficiency range and per-component providers', () => {
    const crowd = {
      ...record,
      war: {
        ...record.war,
        total: 38,
        consensus: {
          agreement: 'moderate',
          agreementLabel: 'Sources differ (spread 4.0 WAR)',
          providerCount: 2,
          total: { value: 38, min: 36, max: 40, spread: 4, n: 2, providers: ['FanGraphs', 'Baseball-Reference'] },
          batting: { value: 25, n: 1, providers: ['FanGraphs'] },
          pitching: { value: 14, n: 2, providers: ['FanGraphs', 'Baseball-Reference'] },
          defensive: null,
        },
      },
      efficiency: { ...record.efficiency, range: { warPer100mLow: 18, warPer100mHigh: 20 } },
    };
    render(<TeamEfficiencyOverviewPanel record={crowd} teamName="San Diego Padres" />);
    expect(screen.getAllByText(/Sources differ \(spread 4\.0 WAR\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WAR\/\$100M 18\.00–20\.00 across sources/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Off 25\.0 \(FanGraphs\) · Pit 14\.0 \(FanGraphs \+ Baseball-Reference\)/).length).toBeGreaterThan(0);
  });

  it('puts the agreement note in the comparison table tooltip', () => {
    render(<TeamEfficiencyComparisonView rows={[
      { team: 'San Diego Padres', teamAbbreviation: 'SD', found: true, status: 'live', payroll: { amountUsd: 200_000_000 }, war: { total: 38, fWAR: 40, bWAR: 36, provider: 'FanGraphs + Baseball-Reference', consensus: { agreementLabel: 'Sources differ (spread 4.0 WAR)' } }, efficiency: { dollarsPerWar: 5_000_000, warPer100m: 20 } },
    ]} season={2026} />);
    expect(screen.getAllByTitle(/Sources differ \(spread 4\.0 WAR\)/).length).toBeGreaterThan(0);
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
