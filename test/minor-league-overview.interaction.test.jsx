import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const affiliateOverview = {
  id: 6141,
  name: 'Sacramento River Cats',
  abbr: 'SAC',
  level: 'Triple-A',
  league: 'Pacific Coast League',
  venue: 'Sutter Health Park',
  hitting: { ops: 0.742, homeRuns: 88 },
  pitching: { era: 4.12, strikeOuts: 711 },
  retrievedAt: '2026-08-14T02:00:00.000Z',
};

let affiliateMode = 'ready';
let resolveAffiliateOverview = null;
const getTeamAffiliates = vi.fn(async teamId => teamId === 137
  ? [{ id: 6141, name: 'Sacramento River Cats', abbr: 'SAC', level: 'Triple-A', levelId: 11, league: 'Pacific Coast League' }]
  : [{ id: 6080, name: 'Oklahoma City Comets', abbr: 'OKC', level: 'Triple-A', levelId: 11, league: 'Pacific Coast League' }]);
const getMinorLeagueTeamStandings = vi.fn(async () => ({ retrievedAt: '2026-08-14T02:00:00.000Z', rows: [{ id: 6141, name: 'Sacramento River Cats', w: 63, l: 49, pct: 0.563, gb: '-' }] }));
const getMinorLeagueTeamSchedule = vi.fn(async () => ({ retrievedAt: '2026-08-14T02:00:00.000Z', games: [{ gamePk: 1, time: '2026-08-15T19:00:00.000Z', away: { name: 'Sacramento River Cats' }, home: { name: 'Reno Aces' }, status: 'Scheduled' }] }));
const getTeamSavantMetrics = vi.fn(async () => ({ status: 'live', retrievedAt: '2026-08-14T02:00:00.000Z', expectedWOBA: 0.342, exitVelocity: 89.4 }));
const getMinorLeagueTeamOverview = vi.fn(async () => {
  if (affiliateMode === 'error') throw new Error('affiliate unavailable');
  if (affiliateMode === 'loading') return new Promise(resolve => { resolveAffiliateOverview = () => resolve(affiliateOverview); });
  return affiliateOverview;
});

vi.mock('../client/src/api/mlb.js', async () => {
  const actual = await vi.importActual('../client/src/api/mlb.js');
  return {
    ...actual,
    getTodaysGames: vi.fn().mockResolvedValue([]),
    getStandings: vi.fn().mockResolvedValue({}),
    getAllTeamStats: vi.fn().mockResolvedValue({}),
    getTeamPlayerStats: vi.fn().mockResolvedValue([]),
    fetchTeamFinancials: vi.fn().mockResolvedValue(null),
    getTeamModelSources: vi.fn().mockResolvedValue({ found: false, retrievedAt: '2026-08-14T02:00:00.000Z', source: 'FanGraphs', statuses: { playoffOdds: 'source-gap', teamWar: 'source-gap' } }),
    getTeamAffiliates,
    getMinorLeagueTeamOverview,
    getMinorLeagueTeamStandings,
    getMinorLeagueTeamSchedule,
    getTeamSavantMetrics,
  };
});

const { default: OverviewPage } = await import('../client/src/pages/OverviewPage.jsx');

describe('Team Overview minor-league affiliate interaction', () => {
  beforeEach(() => {
    cleanup();
    affiliateMode = 'ready';
    resolveAffiliateOverview = null;
    getTeamAffiliates.mockClear();
    getMinorLeagueTeamOverview.mockClear();
    getTeamSavantMetrics.mockClear();
  });

  it('selects the Giants and displays the Sacramento River Cats affiliate overview while keeping MLB context visible', async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);

    const teamSelect = screen.getByRole('combobox', { name: 'Select team' });
    await user.selectOptions(teamSelect, 'sf');
    const affiliateSelect = await screen.findByRole('combobox', { name: 'Select minor league affiliate' });
    await user.selectOptions(affiliateSelect, '6141');

    expect(await screen.findByText('Season overview')).toBeInTheDocument();
    expect(await screen.findByText('Minor-League Affiliate Overview')).toBeInTheDocument();
    expect(await screen.findByText('Sacramento River Cats')).toBeInTheDocument();
    expect(screen.getByText(/Affiliated with San Francisco Giants/)).toBeInTheDocument();
    expect(screen.getByText('0.742')).toBeInTheDocument();
    expect(screen.getByText('4.12')).toBeInTheDocument();
    expect(getTeamSavantMetrics).toHaveBeenCalledWith('SAC', 2026);
  });

  it('shows the affiliate loading state before the live overview resolves', async () => {
    affiliateMode = 'loading';
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select team' }), 'sf');
    const affiliateSelect = await screen.findByRole('combobox', { name: 'Select minor league affiliate' });
    await user.selectOptions(affiliateSelect, '6141');
    expect(screen.getByText(/Live MLB identity · stats loading/)).toBeInTheDocument();
    resolveAffiliateOverview();
    expect(await screen.findByText('Sacramento River Cats')).toBeInTheDocument();
  });

  it('switches between affiliate standings and schedule views and reports Savant freshness', async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select team' }), 'sf');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Select minor league affiliate' }), '6141');
    await user.click(screen.getByRole('button', { name: 'Standings' }));
    expect(await screen.findByText(/Triple-A standings/)).toBeInTheDocument();
    expect(screen.getByText('63–49')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText(/Next 14 days/)).toBeInTheDocument();
    expect(screen.getByText(/Sacramento River Cats @ Reno Aces/)).toBeInTheDocument();
  });

  it('shows an explicit source-unavailable state without hiding the MLB parent overview', async () => {
    affiliateMode = 'error';
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select team' }), 'sf');
    const affiliateSelect = await screen.findByRole('combobox', { name: 'Select minor league affiliate' });
    await user.selectOptions(affiliateSelect, '6141');

    await waitFor(() => expect(screen.getByText('Source unavailable')).toBeInTheDocument());
    expect(screen.getByText('Season overview')).toBeInTheDocument();
    expect(screen.getByText(/The selected affiliate’s live overview is unavailable right now/)).toBeInTheDocument();
  });
});
