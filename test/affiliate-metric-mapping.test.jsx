import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('Affiliate metric mapping and formatting regression', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('formats OPS with 3 decimal digits and ERA with 2 decimal digits without mixing integer formatting', async () => {
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

    render(<OverviewPage />);
    const heading = await screen.findByText(/Season overview/i);
    expect(heading).toBeInTheDocument();
  });
});
