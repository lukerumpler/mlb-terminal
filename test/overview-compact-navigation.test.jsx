import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OverviewPage, { getTeamLeaderHitterPaMinimum } from '../client/src/pages/OverviewPage.jsx';
import { __resetFanGraphsLocalSnapshotForTests, __resetMlbClientStateForTests } from '../client/src/api/mlb.js';
import { __resetFeedClientStateForTests } from '../client/src/api/feed.js';
import { saveTeamAggregateCache, saveTeamPlayersCache, saveTeamSavantSummaryCache } from '../client/src/lib/teamDataCache.js';

describe('Team Overview compact navigation', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetMlbClientStateForTests();
    __resetFanGraphsLocalSnapshotForTests();
    __resetFeedClientStateForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
        text: async () => JSON.stringify({}),
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetFeedClientStateForTests();
  });

  it('opens on a concise briefing and exposes dense sections through compact view controls', async () => {
    render(<OverviewPage />);

    const briefing = await screen.findByRole('button', { name: 'Briefing' });
    expect(briefing).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Front Office Read')).toBeInTheDocument();
    expect(screen.queryByText('Divisional WAR Comparison')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Scout Insights')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    expect(screen.getByText('Divisional WAR Comparison')).toBeInTheDocument();
    expect(screen.getByText('Batted Ball Profile')).toBeInTheDocument();
    expect(screen.getByText('Front Office Read')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roster' }));
    expect(screen.getByText('AI Scout Insights')).toBeInTheDocument();
    expect(screen.queryByText('Batted Ball Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
    expect(screen.getByText('Ballpark Environment')).toBeInTheDocument();
    expect(screen.getByText('Franchise CBT Trend')).toBeInTheDocument();
    expect(screen.queryByText('AI Scout Insights')).not.toBeInTheDocument();
  });

  it('derives the Team Leaders batting minimum from one third of an everyday player workload', () => {
    expect(getTeamLeaderHitterPaMinimum({ w:77, l:51 })).toBe(148);
    expect(getTeamLeaderHitterPaMinimum({ w:0, l:0 })).toBeNull();
  });

  it('keeps the compact executive briefing ahead of the detailed card workspace on first load', async () => {
    render(<OverviewPage />);

    const briefing = await screen.findByRole('region', { name: 'Front Office Read' });
    const detailedCardsHeading = screen.getByRole('heading', { name: 'Detailed team cards' });
    const teamLeaders = screen.getByText(/Team Leaders/);

    expect(briefing.compareDocumentPosition(detailedCardsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detailedCardsHeading.compareDocumentPosition(teamLeaders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses stable cached roster IDs for Team Leader portraits while keeping the visible player name as context', async () => {
    window.localStorage.clear();
    const onOpenPlayer = vi.fn();
    window.addEventListener('skip-open-player', onOpenPlayer);
    saveTeamPlayersCache(135, 2026, {
      hitting: [{ id: 518692, name: 'Verified Hitter', position: 'OF', stat: { plateAppearances: 500, homeRuns: 24, avg: .300, ops: .950, rbi: 74, stolenBases: 18 } }],
      pitching: [{ id: 605483, name: 'Verified Pitcher', position: 'SP', stat: { inningsPitched: '180.0', era: 2.75, strikeOuts: 190, whip: 1.01, wins: 16, saves: 0 } }],
      recentByDays: {
        7: {
          hitting: [{ id: 518692, name: 'Verified Hitter', position: 'OF', stat: { plateAppearances: 12, homeRuns: 3, ops: .998 } }],
          pitching: [{ id: 605483, name: 'Verified Pitcher', position: 'SP', stat: { inningsPitched: '4.0', era: 1.50, strikeOuts: 7 } }],
        },
        15: {
          hitting: [{ id: 518692, name: 'Verified Hitter', position: 'OF', stat: { plateAppearances: 28, homeRuns: 5, ops: .998 } }],
          pitching: [{ id: 605483, name: 'Verified Pitcher', position: 'SP', stat: { inningsPitched: '8.0', era: 1.50, strikeOuts: 12 } }],
        },
        30: {
          hitting: [{ id: 518692, name: 'Verified Hitter', position: 'OF', stat: { plateAppearances: 44, homeRuns: 8, ops: .960 } }],
          pitching: [{ id: 605483, name: 'Verified Pitcher', position: 'SP', stat: { inningsPitched: '14.0', era: 1.80, strikeOuts: 21 } }],
        },
      },
    });
    const { container } = render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    expect(screen.getAllByText('Verified Hitter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Verified Pitcher').length).toBeGreaterThan(0);
    expect(screen.getByText(/AVG · \d+ PA\+/)).toBeInTheDocument();
    expect(screen.getByText(/Team Leaders · \d+ PA min/)).toBeInTheDocument();
    expect(screen.getByText('ERA · 10 IP+')).toBeInTheDocument();
    expect(screen.getByText('15-day hot streak')).toBeInTheDocument();
    expect(screen.getByText('OPS · 20 PA+')).toBeInTheDocument();
    expect(screen.getByText('ERA · 5 IP+')).toBeInTheDocument();
    const rangeSelect = screen.getByLabelText('Select hot-streak date range');
    expect(rangeSelect).toHaveValue('15');
    fireEvent.change(rangeSelect, { target: { value: '7' } });
    expect(await screen.findByText('7-day hot streak')).toBeInTheDocument();
    expect(screen.getByText('OPS · 10 PA+')).toBeInTheDocument();
    expect(screen.getByText('ERA · 3 IP+')).toBeInTheDocument();
    fireEvent.change(rangeSelect, { target: { value: '30' } });
    expect(await screen.findByText('30-day hot streak')).toBeInTheDocument();
    expect(screen.getByText('OPS · 40 PA+')).toBeInTheDocument();
    expect(screen.getAllByText('ERA · 10 IP+').length).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Verified Hitter player profile from season batting leaders' })[0]);
    expect(onOpenPlayer).toHaveBeenCalledWith(expect.objectContaining({ detail: { id: 518692, fullName: 'Verified Hitter' } }));
    expect(container.querySelector('img[src*="/people/518692/headshot/67/current"]')).toBeInTheDocument();
    expect(container.querySelector('img[src*="/people/605483/headshot/67/current"]')).toBeInTheDocument();
    window.removeEventListener('skip-open-player', onOpenPlayer);
    window.localStorage.clear();
  });

  it('keeps all compact Executive Briefing items as direct workspace shortcuts across views', async () => {
    const onNavigate = vi.fn();
    window.addEventListener('skip-navigate', onNavigate);
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    fireEvent.click(screen.getByRole('button', { name: /open performance: posture/i }));
    expect(screen.getByText('Offensive Profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open performance: signal/i }));
    expect(screen.getByText('Run Differential — 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open prospects: next/i }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ detail: { tab: 'prospects' } }));
    window.removeEventListener('skip-navigate', onNavigate);
  });

  it('defers FanGraphs model requests until Performance is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/fangraphs-models'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await waitFor(() => {
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/fangraphs-models'))).toBe(true);
    });
  });

  it('defers the official club-news request until Team News is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    const teamNewsCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/api/news?team=SD&n=8'));
    expect(teamNewsCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Team News' }));
    await waitFor(() => expect(teamNewsCalls()).toHaveLength(1));
    expect(screen.getByRole('tabpanel', { name: 'San Diego Padres headlines' })).toBeInTheDocument();
  });

  it('loads one cached/coalesced calculated-intelligence result for the briefing WAR proxy without requesting FanGraphs', async () => {
    window.localStorage.clear();
    const teamSnapshot = {
      standings: { w: 75, l: 51, pct: 0.595, rs: 627, ra: 485, diff: 142 },
      hitting: { ops: 0.765, obp: 0.337, slg: 0.428, avg: 0.259, homeRuns: 156, stolenBases: 47 },
      pitching: { era: 3.69, whip: 1.16, strikeOuts: 1088 },
    };
    saveTeamAggregateCache({ byAbbr: { SD: teamSnapshot }, byId: { 135: teamSnapshot } }, 2026);
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    await waitFor(() => {
      expect(fetch.mock.calls.filter(([url]) => String(url).includes('/api/intelligence-calculations'))).toHaveLength(1);
    });
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/fangraphs-models'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await waitFor(() => {
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/intelligence-calculations'))).toBe(true);
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/fangraphs-models'))).toBe(true);
    });
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/api/intelligence-calculations'))).toHaveLength(1);
    window.localStorage.clear();
  });

  it('defers multi-window completed-game split requests until Operations is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    const completedGameSplitCalls = () => fetch.mock.calls.filter(([url]) => {
      const value = String(url);
      return value.includes('path=%2Fschedule') && value.includes('teamId=135') && value.includes('startDate=');
    });
    expect(completedGameSplitCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
    await waitFor(() => {
      expect(completedGameSplitCalls().length).toBeGreaterThan(0);
    });
  });

  it('defers official ballpark metadata until Operations is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    const venueCalls = () => fetch.mock.calls.filter(([url]) => {
      const value = String(url);
      return value.includes('path=%2Fteams%2F135') && value.includes('hydrate=venue');
    });
    expect(venueCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
    await waitFor(() => {
      expect(venueCalls().length).toBeGreaterThan(0);
    });
  });

  it('defers heavyweight team Statcast rollups until Performance is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    const teamStatcastCalls = () => fetch.mock.calls.filter(([url]) => {
      const value = String(url);
      return value.includes('endpoint=team_exit_velocity') || value.includes('endpoint=team_batted_balls');
    });
    expect(teamStatcastCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await waitFor(() => {
      expect(teamStatcastCalls().length).toBeGreaterThan(0);
    });
  });

  it('defers the optional AI roster request until the Roster workspace opens while local roster analysis stays available', async () => {
    window.localStorage.clear();
    const teamSnapshot = {
      standings: { w: 75, l: 51, pct: 0.595, rs: 627, ra: 485, diff: 142 },
      hitting: { ops: 0.765, obp: 0.337, slg: 0.428, avg: 0.259, homeRuns: 156, stolenBases: 47 },
      pitching: { era: 3.69, whip: 1.16, strikeOuts: 1088 },
    };
    saveTeamAggregateCache({ byAbbr: { SD: teamSnapshot }, byId: { 135: teamSnapshot } }, 2026);
    saveTeamPlayersCache(135, 2026, {
      hitting: [{ id: 1, name: 'Verified Hitter', position: 'OF', stat: { ops: 0.9, plateAppearances: 200 } }],
      pitching: [{ id: 2, name: 'Verified Pitcher', position: 'SP', stat: { era: 3, inningsPitched: 50 } }],
    });
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    const aiCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/api/trpc/ai.rosterInsights'));
    expect(aiCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Roster' }));
    await waitFor(() => {
      expect(aiCalls().length).toBeGreaterThan(0);
      expect(screen.getByText('AI Scout Insights')).toBeInTheDocument();
    });
    window.localStorage.clear();
  });

  it('keeps a single canonical team rating by routing Performance to Front Office Evaluation instead of rendering a second grade grid', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    expect(screen.queryByText('Overall Team Rating')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open canonical Front Office Evaluation' }));

    expect(await screen.findByText('Front Office Read')).toBeInTheDocument();
    expect(screen.getByLabelText('Front Office Evaluation')).toBeInTheDocument();
  });

  it('clears a prior club’s Performance Statcast summary before the newly selected club can load', async () => {
    window.localStorage.clear();
    saveTeamSavantSummaryCache('SD', 2026, {
      status: 'live',
      source: 'Baseball Savant · verified team summary',
      expectedWOBA: 0.456,
      exitVelocity: 91.2,
      retrievedAt: new Date().toISOString(),
    });
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await screen.findByText('0.456');

    window.dispatchEvent(new CustomEvent('skip-select-team', { detail: { abbr: 'SF' } }));
    await screen.findAllByAltText('San Francisco Giants logo');
    await waitFor(() => {
      const xwobaLabel = screen.getByText('xwOBA');
      const xwobaCard = xwobaLabel.parentElement?.parentElement;
      expect(within(xwobaCard).queryByText('0.456')).not.toBeInTheDocument();
      expect(within(xwobaCard).getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  it('uses Statcast OAA only when available and opens a closable Future Value depth modal', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    fireEvent.click(screen.getByRole('button', { name: /defense/i }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/comparable Baseball Savant OAA and verified roster coverage are required/i);
    expect(document.querySelector('[data-selected-grade="Defense"]')).toHaveTextContent(/comparable Baseball Savant OAA/i);

    fireEvent.click(screen.getByRole('button', { name: 'Open organization prospect depth chart' }));
    const dialog = screen.getByRole('dialog', { name: /organization depth/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByText(/SKIP prospect snapshot/i).length).toBeGreaterThan(0);

    const onOpenPlayer = vi.fn();
    window.addEventListener('skip-open-player', onOpenPlayer);
    const profileLink = within(dialog).getAllByRole('link', { name: /open .* detailed player profile/i })[0];
    expect(profileLink).toHaveAttribute('href', '#players');
    fireEvent.click(profileLink);
    expect(onOpenPlayer).toHaveBeenCalledTimes(1);
    expect(onOpenPlayer.mock.calls[0][0].detail).toMatchObject({ id: expect.any(Number), fullName: expect.any(String) });
    expect(screen.queryByRole('dialog', { name: /organization depth/i })).not.toBeInTheDocument();
    window.removeEventListener('skip-open-player', onOpenPlayer);
  });
});
