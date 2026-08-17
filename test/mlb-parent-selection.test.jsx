import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OverviewPage, { normalizeMinorLeagueAffiliates } from '../client/src/pages/OverviewPage.jsx';
import { __resetMlbClientStateForTests } from '../client/src/api/mlb.js';

describe('MLB parent team selection routing', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetMlbClientStateForTests();
  });

  it('does not render the Minor-League Affiliate Overview panel when parent team is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ teams: [{ id: 119, name: 'Oklahoma City Comets', abbreviation: 'OKC', sport: { name: 'Triple-A' } }] }),
        text: async () => JSON.stringify({}),
      }))
    );

    render(<OverviewPage />);
    const heading = await screen.findByText(/Season overview/i);
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText(/Minor-League Affiliate Overview/i)).not.toBeInTheDocument();
  });

  it('normalizes affiliate inputs by removing the parent, major-league rows, and duplicate records', () => {
    expect(normalizeMinorLeagueAffiliates([
      { id: 119, name: 'Los Angeles Dodgers', level: 'Major League Baseball', levelId: 1 },
      { id: 9999, name: 'Oklahoma City Comets', level: 'Triple-A', levelId: 11 },
      { id: 9999, name: 'Oklahoma City Duplicate', level: 'Triple-A', levelId: 11 },
      { id: 8888, name: 'Tulsa Drillers', level: 'Double-A', levelId: 12 },
    ], 119)).toEqual([
      { id: 9999, name: 'Oklahoma City Comets', level: 'Triple-A', levelId: 11 },
      { id: 8888, name: 'Tulsa Drillers', level: 'Double-A', levelId: 12 },
    ]);
  });

  it('keeps the MLB parent selected and clears any affiliate choice when the team changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ teams: [] }),
        text: async () => JSON.stringify({}),
      }))
    );

    render(<OverviewPage />);
    const teamSelect = await screen.findByRole('combobox', { name: 'Select team' });
    const minorLeagueButton = screen.getByRole('button', { name: /minor league/i });

    expect(teamSelect).toHaveValue('lad');
    expect(minorLeagueButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'Select minor league affiliate' })).not.toBeInTheDocument();

    fireEvent.click(minorLeagueButton);
    const affiliateSelect = await screen.findByRole('combobox', { name: 'Select minor league affiliate' });
    expect(affiliateSelect).toHaveValue('');

    fireEvent.change(teamSelect, { target: { value: 'sd' } });
    expect(teamSelect).toHaveValue('sd');
    expect(screen.queryByRole('combobox', { name: 'Select minor league affiliate' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Minor-League Affiliate Overview/i)).not.toBeInTheDocument();
  });

  it('opens the affiliate control only after an explicit affiliate navigation event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          teams: [{
            id: 9999,
            name: 'Oklahoma City Comets',
            abbreviation: 'OKC',
            sport: { id: 11, name: 'Triple-A' },
            league: { name: 'Pacific Coast League' },
          }],
        }),
        text: async () => JSON.stringify({}),
      }))
    );

    render(<OverviewPage />);
    await screen.findByRole('button', { name: /minor league/i });
    expect(screen.queryByRole('combobox', { name: 'Select minor league affiliate' })).not.toBeInTheDocument();

    fireEvent(window, new CustomEvent('skip-select-affiliate', {
      detail: { parentAbbr: 'LAD', affiliateId: 9999, levelId: 11 },
    }));

    const affiliateSelect = await screen.findByRole('combobox', { name: 'Select minor league affiliate' });
    await waitFor(() => expect(affiliateSelect).toHaveValue('9999'));
    expect(screen.getByRole('button', { name: /minor league/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('treats a stale MLB-parent affiliate event as a safe return to the parent overview', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ teams: [] }),
      text: async () => JSON.stringify({}),
    })));
    render(<OverviewPage />);
    await screen.findByRole('button', { name: /minor league/i });

    fireEvent(window, new CustomEvent('skip-select-affiliate', {
      detail: { parentAbbr: 'LAD', affiliateId: 119, levelId: 1 },
    }));

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Select team' })).toHaveValue('lad'));
    expect(screen.getByRole('button', { name: /minor league/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'Select minor league affiliate' })).not.toBeInTheDocument();
  });
});
