import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TeamEfficiencyOverviewPanel } from '../client/src/components/TeamEfficiencyPanels.jsx';

afterEach(cleanup);

const complete = {
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

describe('headline WAR label names what the number is', () => {
  it('says Blended WAR only when both providers contributed', () => {
    render(<TeamEfficiencyOverviewPanel record={complete} teamName="San Diego Padres" />);
    expect(screen.getByText('Blended WAR')).toBeTruthy();
  });

  it('calls a FanGraphs-only value fWAR, not blended', () => {
    const record = { ...complete, war: { ...complete.war, total: 40, bWAR: null, provider: 'FanGraphs', methodology: 'fWAR' } };
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.queryByText('Blended WAR')).toBeNull();
    expect(screen.getByText('fWAR')).toBeTruthy();
  });

  it('calls a Baseball-Reference-only value bWAR, not blended', () => {
    const record = { ...complete, war: { ...complete.war, total: 36, fWAR: null, provider: 'Baseball-Reference', methodology: 'bWAR/rWAR' } };
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.queryByText('Blended WAR')).toBeNull();
    expect(screen.getByText('bWAR')).toBeTruthy();
  });
});

describe('WAR stays visible when payroll is what is missing', () => {
  const noPayroll = {
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
    expect(screen.getByText(/Spotrac payroll unavailable/)).toBeTruthy();
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
  });

  it('keeps a negative WAR value signed', () => {
    const record = { ...noPayroll, war: { ...noPayroll.war, total: -1.5, fWAR: -2, bWAR: -1, provider: 'FanGraphs + Baseball-Reference' } };
    render(<TeamEfficiencyOverviewPanel record={record} teamName="San Diego Padres" />);
    expect(screen.getByText(/fWAR -2\.0/)).toBeTruthy();
    expect(screen.getByText(/bWAR -1\.0/)).toBeTruthy();
  });

  it('does not add a WAR line when there is no WAR at all', () => {
    const record = { status: 'source-gap', war: { total: null, fWAR: null, bWAR: null, offensive: null, pitching: null }, warnings: ['No verified team WAR row matched the requested team'] };
    render(<TeamEfficiencyOverviewPanel record={record} teamName="Unknown Team" />);
    expect(screen.queryByText(/WAR is available without an efficiency ratio/)).toBeNull();
    expect(screen.getByText(/No verified team WAR row matched/)).toBeTruthy();
  });
});

describe('a missing consensus component is labeled unavailable, not silently dropped', () => {
  const summary = (value, providers) => ({ value, median: value, min: value, max: value, spread: 0, n: providers.length, providers, sources: providers.map(provider => ({ provider, value })) });
  const withConsensus = consensus => ({
    ...complete,
    war: { ...complete.war, offensive: consensus.batting?.value ?? null, pitching: consensus.pitching?.value ?? null, consensus: { agreement: 'moderate', agreementLabel: 'Sources differ (spread 4.0 WAR)', providerCount: 2, total: summary(38, ['FanGraphs', 'Baseball-Reference']), defensive: null, batting: null, pitching: null, ...consensus } },
  });

  it('shows Off as unavailable when only pitching has a consensus', () => {
    render(<TeamEfficiencyOverviewPanel record={withConsensus({ pitching: summary(14, ['FanGraphs', 'Baseball-Reference']) })} teamName="San Diego Padres" />);
    expect(screen.getByText(/Off unavailable · Pit 14\.0 \(FanGraphs \+ Baseball-Reference\)/)).toBeTruthy();
  });

  it('shows Pit as unavailable when only batting has a consensus', () => {
    render(<TeamEfficiencyOverviewPanel record={withConsensus({ batting: summary(25, ['FanGraphs']) })} teamName="San Diego Padres" />);
    expect(screen.getByText(/Off 25\.0 \(FanGraphs\) · Pit unavailable/)).toBeTruthy();
  });

  it('keeps the whole-split fallback text when neither component has a consensus', () => {
    render(<TeamEfficiencyOverviewPanel record={withConsensus({})} teamName="San Diego Padres" />);
    expect(screen.getByText(/Offensive\/pitching split unavailable/)).toBeTruthy();
  });
});
