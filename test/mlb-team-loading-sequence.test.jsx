import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('MLB-first team loading sequence', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders loading badge and ensures MLB team identity is prioritized before affiliates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => {
        const urlStr = String(url);
        if (urlStr.includes('/teams/238/affiliates')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => [{ id: 501, name: 'Oklahoma City Dodgers', level: 'Triple-A', levelId: 11, league: 'PCL' }],
            text: async () => JSON.stringify([]),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({}),
          text: async () => JSON.stringify({}),
        };
      })
    );

    render(<OverviewPage />);
    expect(screen.getByText(/LOADING MLB TEAM/i)).toBeInTheDocument();
    expect(screen.queryByText('Minor-League Affiliate Overview')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select team' })).toHaveValue('lad');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Select minor league affiliate' })).toHaveValue(''));
  });
});

  it('does not restore a recent affiliate as the default MLB Overview selection', async () => {
    localStorage.setItem('skip-recent-history', JSON.stringify([
      { type: 'affiliate', affiliateId: 501, parentAbbr: 'LAD', levelId: 11, label: 'Oklahoma City Comets', secondary: 'Triple-A · Los Angeles Dodgers', viewedAt: Date.now() },
    ]));
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).includes('/teams/238/affiliates')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ id: 501, name: 'Oklahoma City Comets', level: 'Triple-A', levelId: 11, league: 'PCL' }], text: async () => '[]' };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => '{}' };
    }));
    render(<OverviewPage />);
    await waitFor(() => {
      const selectors = screen.getAllByRole('combobox', { name: 'Select minor league affiliate' });
      expect(selectors.every(select => select.value === '')).toBe(true);
    });
    expect(screen.queryByText('Minor-League Affiliate Overview')).not.toBeInTheDocument();
  });
