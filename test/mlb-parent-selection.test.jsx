import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('MLB parent team selection routing', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
});
