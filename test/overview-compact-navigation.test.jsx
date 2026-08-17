import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});
