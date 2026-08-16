import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('Overview page section reordering for unavailable data', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(async () => {
    await new Promise(resolve => setImmediate(resolve));
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders core season overview metrics above the Advanced Models and Divisional WAR panels', async () => {
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
    
    const seasonOverviewHeading = await screen.findByText(/Season overview/i);
    const advancedModelsPanel = screen.getByText(/Advanced Models & Savant/i);
    const divisionalWarPanel = screen.getByText(/Divisional WAR Comparison/i);

    expect(seasonOverviewHeading).toBeInTheDocument();
    expect(advancedModelsPanel).toBeInTheDocument();
    expect(divisionalWarPanel).toBeInTheDocument();

    const seasonPosition = seasonOverviewHeading.compareDocumentPosition(advancedModelsPanel);
    expect(seasonPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
