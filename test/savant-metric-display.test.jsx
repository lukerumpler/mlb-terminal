import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('Savant metric display and source badge separation', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the real Overview Savant panel cache age from a same-day cached summary', async () => {
    const retrievedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('skip-team-savant-summary-cache-v1', JSON.stringify({
      '2026:LAD': { updatedAt: Date.now() - 2 * 60 * 60 * 1000, data: { status:'cached', source:'Baseball Savant', retrievedAt, expectedWOBA:0.331, exitVelocity:89.4 } },
    }));
    localStorage.setItem('skip-team-savant-cache-v1', JSON.stringify({
      '2026:LAD': { updatedAt: Date.now() - 2 * 60 * 60 * 1000, data: { exitVelocityRows:[{ launch_speed:97 }], battedBallRows:[], pitchRows:[] } },
    }));
    localStorage.setItem('skip-team-savant-against-cache-v1', JSON.stringify({
      '2026:LAD': { updatedAt: Date.now() - 2 * 60 * 60 * 1000, data: [] },
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok:true, status:200, headers:{ get:() => null }, json:async()=>({}), text:async()=>JSON.stringify({}) })));

    render(<OverviewPage />);
    expect(await screen.findByText('cached 2h ago')).toBeInTheDocument();
  });

  it('does not refetch Savant when the provider retry event occurs during the same UTC day', async () => {
    const updatedAt = Date.now() - 2 * 60 * 60 * 1000;
    const fetchMock = vi.fn(async () => ({ ok:true, status:200, headers:{ get:() => null }, json:async()=>({}), text:async()=>JSON.stringify({}) }));
    localStorage.setItem('skip-team-savant-summary-cache-v1', JSON.stringify({ '2026:LAD': { updatedAt, data:{ status:'cached', source:'Baseball Savant', retrievedAt:new Date(updatedAt).toISOString() } } }));
    localStorage.setItem('skip-team-savant-cache-v1', JSON.stringify({ '2026:LAD': { updatedAt, data:{ exitVelocityRows:[{ launch_speed:97 }], battedBallRows:[], pitchRows:[] } } }));
    localStorage.setItem('skip-team-savant-against-cache-v1', JSON.stringify({ '2026:LAD': { updatedAt, data:[] } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OverviewPage />);
    await screen.findByText('cached 2h ago');
    const beforeRetry = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/savant')).length;
    fireEvent(window, new CustomEvent('skip-provider-retry', { detail:{ provider:'savant' } }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/savant')).length).toBe(beforeRetry));
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
    const badgeGroup = document.querySelector('.skip-overview-source-badges');
    expect(badgeGroup).toBeInTheDocument();
    expect(getComputedStyle(badgeGroup).gap).toBe('10px');
    const providerBadge = badgeGroup.querySelector('.skip-overview-source-badge');
    const providerName = providerBadge?.querySelector('.skip-overview-source-name');
    const providerStatus = providerBadge?.querySelector('.skip-overview-source-status');
    expect(providerBadge).toBeInTheDocument();
    expect(providerName).toBeInTheDocument();
    expect(providerStatus).toBeInTheDocument();
    expect(providerBadge.className).toContain('skip-overview-source-badge');
    expect(providerStatus.className).toContain('skip-overview-source-status');
  });
});
