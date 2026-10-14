/*
Our goal is to make sure the team efficiency panel tells the truth when some of its numbers are missing. It should name what
the headline number really is (a blend of two websites, or just one), keep showing the WAR it does have when the payroll is
missing, and say "unavailable" for a missing piece instead of hiding it or showing a zero.

To solve this we are going to:
  1. Draw the panel with both websites, only FanGraphs and only Baseball-Reference, and check the headline label each time
  2. Draw it with the payroll missing and check the WAR is still shown next to the payroll warning (negative values too)
  3. Draw it with only the offense side or only the pitching side of the split, and check the missing side says "unavailable"
  4. Cross-check the case where there is no WAR at all: we must not invent a WAR line
*/
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TeamEfficiencyOverviewPanel } from '../client/src/components/TeamEfficiencyPanels.jsx';

afterEach(cleanup);                                         // Clear the screen between tests so one test cannot see another's panel

// Section A: Inputs

const complete = {                                          // A team with everything present, we remove pieces from this one
  found: true,
  status: 'live',
  season: 2026,
  team: 'San Diego Padres',
  teamAbbreviation: 'SD',
  payroll: { amountUsd: 200_000_000, basis: 'payroll', source: 'Spotrac' },
  war: { total: 38, fWAR: 40, bWAR: 36, provider: 'FanGraphs + Baseball-Reference', methodology: 'Blended fWAR/bWAR average' },
  efficiency: { dollarsPerWar: 5_263_158, warPer100m: 19 },
  retrievedAt: '2026-09-23T00:00:00.000Z',
  warnings: [],
};


// Section B: The headline label

describe('headline WAR label names what the number is', () => {
  it('says Blended WAR only when both providers contributed', () => {
    render(<TeamEfficiencyOverviewPanel record={complete} teamName="San Diego Padres" />);
    expect(screen.getByText('Blended WAR')).toBeTruthy();
  });

  it('calls a FanGraphs-only value fWAR, not blended', () => {
    const record = { ...complete, war: { ...complete.war, total: 40, bWAR: null, provider: 'FanGraphs', methodology: 'fWAR' } };   // Baseball-Reference is missing
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.queryByText('Blended WAR')).toBeNull();                       // One website is not a blend
    expect(screen.getByText('fWAR')).toBeTruthy();
  });

  it('calls a Baseball-Reference-only value bWAR, not blended', () => {
    const record = { ...complete, war: { ...complete.war, total: 36, fWAR: null, provider: 'Baseball-Reference', methodology: 'bWAR/rWAR' } };   // FanGraphs is missing
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.queryByText('Blended WAR')).toBeNull();
    expect(screen.getByText('bWAR')).toBeTruthy();
  });
});


// Section C: WAR stays visible when the payroll is missing

describe('WAR stays visible when payroll is what is missing', () => {
  const noPayroll = {                                       // The same team, but with no payroll so we cannot compute dollars per WAR
    ...complete,
    found: false,
    status: 'source-gap',
    payroll: { amountUsd: null, basis: 'payroll', source: 'Spotrac' },
    efficiency: { dollarsPerWar: null, warPer100m: null },
    warnings: ['Spotrac payroll unavailable', 'No verified team payroll matched the requested team'],
  };

  it('shows the available WAR next to the payroll warning, with no invented ratio', () => {
    render(<TeamEfficiencyOverviewPanel record={noPayroll} teamName="San Diego Padres" />);
    expect(screen.getByText(/WAR is available without an efficiency ratio/)).toBeTruthy();
    expect(screen.getByText(/fWAR 40\.0/)).toBeTruthy();
    expect(screen.getByText(/bWAR 36\.0/)).toBeTruthy();
    expect(screen.getByText(/Spotrac payroll unavailable/)).toBeTruthy();       // The warning is still there too
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();                      // And no broken math leaks onto the screen
  });

  it('keeps a negative WAR value signed', () => {
    const record = { ...noPayroll, war: { ...noPayroll.war, total: -1.5, fWAR: -2, bWAR: -1, provider: 'FanGraphs + Baseball-Reference' } };
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getByText(/fWAR -2\.0/)).toBeTruthy();
    expect(screen.getByText(/bWAR -1\.0/)).toBeTruthy();
  });

  it('does not add a WAR line when there is no WAR at all', () => {
    const record = {
      status: 'source-gap',
      war: { total: null, fWAR: null, bWAR: null, offensive: null, pitching: null },     // Nothing to show
      warnings: ['No verified team WAR row matched the requested team'],
    };
    render(<TeamEfficiencyOverviewPanel record={record} teamName="Unknown Team" />);
    expect(screen.queryByText(/WAR is available without an efficiency ratio/)).toBeNull();
    expect(screen.getByText(/No verified team WAR row matched/)).toBeTruthy();          // Only the warning is shown
  });
});


// Section D: A missing offense or pitching side

describe('a missing consensus component is labeled unavailable, not silently dropped', () => {
  function summary(value, providers) {
    // The "crowd view" of one number: the average, the lowest and highest, and who said what (here every website agrees exactly)
    return {
      value,
      median: value,
      min: value,
      max: value,
      spread: 0,
      n: providers.length,
      providers,
      sources: providers.map(provider => ({ provider, value })),
    };
  }

  function withConsensus(consensus) {
    // The complete team, but with the crowd view changed to the pieces we pass in
    return {
      ...complete,
      war: {
        ...complete.war,
        offensive: consensus.batting?.value ?? null,
        pitching: consensus.pitching?.value ?? null,
        consensus: {
          agreement: 'moderate',
          agreementLabel: 'Sources differ (spread 4.0 WAR)',
          providerCount: 2,
          total: summary(38, ['FanGraphs', 'Baseball-Reference']),
          defensive: null,
          batting: null,
          pitching: null,
          ...consensus,                                     // Whatever we pass in replaces the empty batting and pitching above
        },
      },
    };
  }

  it('shows Off as unavailable when only pitching has a consensus', () => {
    const record = withConsensus({ pitching: summary(14, ['FanGraphs', 'Baseball-Reference']) });
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getByText(/Off unavailable · Pit 14\.0 \(FanGraphs \+ Baseball-Reference\)/)).toBeTruthy();
  });

  it('shows Pit as unavailable when only batting has a consensus', () => {
    const record = withConsensus({ batting: summary(25, ['FanGraphs']) });
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getByText(/Off 25\.0 \(FanGraphs\) · Pit unavailable/)).toBeTruthy();
  });

  it('keeps the whole-split fallback text when neither component has a consensus', () => {
    render(<TeamEfficiencyOverviewPanel record={withConsensus({})} teamName="San Diego Padres" />);
    expect(screen.getByText(/Offensive\/pitching split unavailable/)).toBeTruthy();
  });
});
