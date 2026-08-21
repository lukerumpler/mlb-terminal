import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';
import { __resetFanGraphsLocalSnapshotForTests, __resetMlbClientStateForTests } from '../client/src/api/mlb.js';
import { saveTeamAggregateCache, saveTeamPlayersCache } from '../client/src/lib/teamDataCache.js';

describe('Team Overview compact navigation', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetMlbClientStateForTests();
    __resetFanGraphsLocalSnapshotForTests();
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
    expect(screen.queryByText('Front Office Read')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roster' }));
    expect(screen.getByText('AI Scout Insights')).toBeInTheDocument();
    expect(screen.queryByText('Batted Ball Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
    expect(screen.getByText('Ballpark Environment')).toBeInTheDocument();
    expect(screen.getByText('Franchise CBT Trend')).toBeInTheDocument();
    expect(screen.queryByText('AI Scout Insights')).not.toBeInTheDocument();
  });

  it('keeps the executive briefing ahead of the detailed card workspace on first load', async () => {
    render(<OverviewPage />);

    const briefing = await screen.findByRole('tabpanel', { name: 'Front Office Read' });
    const continueLink = screen.getByRole('link', { name: /continue to detailed team cards/i });
    const detailedCardsHeading = screen.getByRole('heading', { name: 'Detailed team cards' });
    const teamLeaders = screen.getByText('Team Leaders');

    expect(briefing).toContainElement(continueLink);
    expect(continueLink).toHaveAttribute('href', '#team-overview-detailed-analysis');
    expect(briefing.compareDocumentPosition(detailedCardsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detailedCardsHeading.compareDocumentPosition(teamLeaders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses stable cached roster IDs for Team Leader portraits while keeping the visible player name as context', async () => {
    window.localStorage.clear();
    saveTeamPlayersCache(119, 2026, {
      hitting: [{ id: 518692, name: 'Verified Hitter', position: 'OF', stat: { plateAppearances: 500, homeRuns: 24, avg: .300, ops: .950, rbi: 74, stolenBases: 18 } }],
      pitching: [{ id: 605483, name: 'Verified Pitcher', position: 'SP', stat: { inningsPitched: '180.0', era: 2.75, strikeOuts: 190, whip: 1.01, wins: 16, saves: 0 } }],
    });
    const { container } = render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    expect(screen.getAllByText('Verified Hitter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Verified Pitcher').length).toBeGreaterThan(0);
    expect(container.querySelector('img[src*="/people/518692/headshot/67/current"]')).toBeInTheDocument();
    expect(container.querySelector('img[src*="/people/605483/headshot/67/current"]')).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('uses all Executive Briefing items as direct workspace shortcuts', async () => {
    const onNavigate = vi.fn();
    window.addEventListener('skip-navigate', onNavigate);
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    fireEvent.click(screen.getByRole('button', { name: /open performance workspace: current posture/i }));
    expect(screen.getByText('Offensive Profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Briefing' }));
    fireEvent.click(screen.getByRole('button', { name: /open performance workspace: best signal/i }));
    expect(screen.getByText('Run Differential — 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Briefing' }));
    fireEvent.click(screen.getByRole('button', { name: /open organization depth: next question/i }));
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

  it('defers calculated-intelligence standings work until Performance is explicitly opened', async () => {
    window.localStorage.clear();
    const teamSnapshot = {
      standings: { w: 75, l: 51, pct: 0.595, rs: 627, ra: 485, diff: 142 },
      hitting: { ops: 0.765, obp: 0.337, slg: 0.428, avg: 0.259, homeRuns: 156, stolenBases: 47 },
      pitching: { era: 3.69, whip: 1.16, strikeOuts: 1088 },
    };
    saveTeamAggregateCache({ byAbbr: { LAD: teamSnapshot }, byId: { 119: teamSnapshot } }, 2026);
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/intelligence-calculations'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await waitFor(() => {
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/intelligence-calculations'))).toBe(true);
    });
    window.localStorage.clear();
  });

  it('defers multi-window completed-game split requests until Operations is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    const completedGameSplitCalls = () => fetch.mock.calls.filter(([url]) => {
      const value = String(url);
      return value.includes('path=%2Fschedule') && value.includes('teamId=119') && value.includes('startDate=');
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
      return value.includes('path=%2Fteams%2F119') && value.includes('hydrate=venue');
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
    saveTeamAggregateCache({ byAbbr: { LAD: teamSnapshot }, byId: { 119: teamSnapshot } }, 2026);
    saveTeamPlayersCache(119, 2026, {
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
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      if (url.includes('endpoint=expected_statistics')) {
        const rows = [{ player_id: 1, team_abbr: 'LAD', est_woba: 0.456, est_ba: 0.333, est_slg: 0.678 }];
        return {
          ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(rows), json: async () => rows,
        };
      }
      if (url.includes('endpoint=statcast_leaderboard')) {
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => '[]', json: async () => [] };
      }
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{}', json: async () => ({}) };
    }));
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
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Unavailable: verified roster coverage is not available/i);
    expect(screen.getByText(/Defense uses roster coverage and, when available, Statcast OAA/i)).toBeInTheDocument();

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
