import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let feedAttempt = 0;
let modelAttempt = 0;
let savantMode = 'pending';

vi.mock('../client/src/api/mlb.js', async () => {
  const actual = await vi.importActual('../client/src/api/mlb.js');
  return {
    ...actual,
    getTodaysGames: vi.fn().mockResolvedValue([]),
    getStandings: vi.fn(async () => feedAttempt > 0 ? { LAD: [{ id: 119, abbr: 'LAD', w: 73, l: 48, pct: .603, rs: 606, ra: 464, diff: 142 }] } : Promise.reject(new Error('MLB feed stalled'))),
    getAllTeamStats: vi.fn(async group => feedAttempt > 0 ? { 119: { teamId: 119, teamAbbr: 'LAD', teamName: 'Los Angeles Dodgers', ops: .802, homeRuns: 98, era: 2.98, whip: 1.06, strikeOuts: 628, stolenBases: 54 } } : Promise.reject(new Error(`MLB ${group} feed stalled`))),
    getTeamPlayerStats: vi.fn().mockResolvedValue([]),
    getTeamExitVelocity: vi.fn(() => savantMode === 'pending' ? new Promise(() => {}) : Promise.resolve([])),
    getTeamBattedBalls: vi.fn(() => savantMode === 'pending' ? new Promise(() => {}) : Promise.resolve(savantMode === 'empty' ? [] : [{ hc_x: 125, hc_y: 210, bb_type: 'fly_ball', launch_speed: 101.4, xwoba: 0.512 }])),
    getTeamBattedBallsAgainst: vi.fn(() => savantMode === 'pending' ? new Promise(() => {}) : Promise.resolve(savantMode === 'empty' ? [] : [{ hc_x: 118, hc_y: 205, bb_type: 'line_drive', launch_speed: 96.2, xwoba: 0.365 }])),
    getPlayerContactPoints: vi.fn().mockResolvedValue([]),
    getPitcherPitches: vi.fn().mockResolvedValue([]),
    fetchTeamFinancials: vi.fn().mockResolvedValue(null),
    getTeamModelSources: vi.fn(async () => modelAttempt > 0
      ? { found: true, retrievedAt: '2026-08-14T02:03:00.000Z', source: 'FanGraphs', playoffOdds: 72.4, teamWar: 28.6, statuses: { playoffOdds: 'live', teamWar: 'live' } }
      : { found: false, retrievedAt: '2026-08-14T02:02:00.000Z', source: 'FanGraphs', playoffOdds: null, teamWar: null, statuses: { playoffOdds: 'upstream-unavailable', teamWar: 'upstream-unavailable' } }),
  };
});

const { default: OverviewPage } = await import('../client/src/pages/OverviewPage.jsx');

describe('Team Overview model source and retry interaction', () => {
  beforeEach(() => {
    cleanup();
    feedAttempt = 0;
    modelAttempt = 0;
    savantMode = 'pending';
    localStorage.clear();
  });

  it('shows a page-shaped Team Overview skeleton during the initial aggregate fetch', async () => {
    localStorage.clear();
    render(<OverviewPage />);
    expect(screen.getByRole('status', { name: 'Loading team overview' })).toBeInTheDocument();
    expect(await screen.findByText('Season overview', { exact: false })).toBeInTheDocument();
  });

  it('opens source provenance for the current team metrics', async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.click(screen.getByRole('button', { name:'Open source provenance' }));
    expect(screen.getByRole('dialog', { name:'Source provenance' })).toBeInTheDocument();
    expect(screen.getAllByText('MLB Stats API').length).toBeGreaterThan(0);
    expect(screen.getByText(/Direct team standings and aggregate-stat fields/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name:'Close source provenance' }));
    expect(screen.queryByRole('dialog', { name:'Source provenance' })).not.toBeInTheDocument();
  });

  it('shows explicit loading states for Batted Ball Profile and Pitch Arsenal while Savant is pending', async () => {
    render(<OverviewPage />);
    expect(await screen.findByText('Loading verified batted-ball rows')).toBeInTheDocument();
    expect(await screen.findByText('Loading verified pitch rows')).toBeInTheDocument();
  });

  it('renders verified team spray and opponent contact-quality rollups when Savant returns rows', async () => {
    savantMode = 'ready';
    render(<OverviewPage />);
    expect(await screen.findByRole('img', { name: 'Verified Baseball Savant batted-ball spray coordinates' })).toBeInTheDocument();
    expect(screen.queryByText('Opponent Statcast feed unavailable')).not.toBeInTheDocument();
    expect(await screen.findByText('0.365')).toBeInTheDocument();
  });

  it('shows explicit unavailable states when Savant returns no verified rows', async () => {
    savantMode = 'empty';
    render(<OverviewPage />);
    expect(await screen.findByText('Team batted-ball feed unavailable')).toBeInTheDocument();
    expect(await screen.findByText('Team pitch arsenal feed unavailable')).toBeInTheDocument();
    expect(await screen.findByText('No verified current-season run differential was returned by the MLB Stats API.')).toBeInTheDocument();
  });

  it('shows explicit unavailable model states, exposes retry, and recovers model and MLB data after retry', async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);

    await waitFor(() => expect(document.body.textContent).toMatch(/Model source:\s*FanGraphs/));
    expect(document.body.textContent).toMatch(/Playoff odds:\s*Provider unavailable/);
    expect(document.body.textContent).toMatch(/Playoff Odds/);
    expect(document.body.textContent).toMatch(/Team WAR/);
    expect(document.body.textContent).toContain('Unavailable');
    expect(document.body.textContent).toMatch(/Team WAR:\s*Provider unavailable/);
    expect(document.body.textContent).toMatch(/Model source:\s*FanGraphs\s*·\s*retrieved\s+\d{1,2}:\d{2}/);

    await waitFor(() => expect(screen.getByRole('button', { name: 'RETRY' })).toBeInTheDocument(), { timeout: 14000, interval: 100 });
    feedAttempt = 1;
    modelAttempt = 1;
    await user.click(screen.getByRole('button', { name: 'RETRY' }));

    expect(await screen.findByText('LIVE MLB DATA')).toBeInTheDocument();
    expect((await screen.findAllByText(/MLB Stats API/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('72.4%')).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).toMatch(/28\.6/));
    expect(document.body.textContent).toMatch(/Playoff odds:\s*FanGraphs/);
    expect(document.body.textContent).toMatch(/Team WAR:\s*Live/);
    expect(document.body.textContent).toMatch(/Model source:\s*FanGraphs\s*·\s*retrieved\s+\d{1,2}:\d{2}/);
  }, 20000);
});
