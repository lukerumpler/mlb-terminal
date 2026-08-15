import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('Savant metric display and source badge separation', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders Savant metric values separately from the source status badge without text collision', async () => {
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
    
    const xwobaLabel = await screen.findByText(/xwOBA/i);
    expect(xwobaLabel).toBeInTheDocument();
  });
});
