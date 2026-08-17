import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';
import { __resetFanGraphsLocalSnapshotForTests, __resetMlbClientStateForTests } from '../client/src/api/mlb.js';

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

  it('defers FanGraphs model requests until Performance is explicitly opened', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/fangraphs-models'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await waitFor(() => {
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/fangraphs-models'))).toBe(true);
    });
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

  it('keeps Statcast OAA distinct from calculated Defense and opens a closable Future Value depth modal', async () => {
    render(<OverviewPage />);

    await screen.findByRole('button', { name: 'Briefing' });
    expect(await screen.findByText(/OAA — · Savant/i)).toBeInTheDocument();
    expect(screen.getByText(/Statcast OAA is a separate Baseball Savant fielding signal/i)).toBeInTheDocument();

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
