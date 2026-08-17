import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('Team Overview compact navigation', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
});
