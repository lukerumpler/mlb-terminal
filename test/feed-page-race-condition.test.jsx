import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocks fetchFeeds directly — FeedPage.jsx's load() race condition (fixed
// 2026-08-11: toggling filter groups quickly could let a slower response
// for an older group selection resolve after a faster response for a
// newer one and silently overwrite it) needs precise control over which
// of two concurrent requests resolves first, which a real network mock
// can't guarantee deterministically run to run. Same approach as
// test/players-page-race-condition.test.jsx for the sibling bug in
// PlayersPage.jsx's pickPlayer.
const fetchFeeds = vi.fn();
vi.mock('../client/src/api/feed.js', () => ({
  fetchFeeds: (...args) => fetchFeeds(...args),
}));

const { default: FeedPage } = await import('../client/src/pages/FeedPage.jsx');

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function feedResult(label) {
  return {
    items: [{ handle: '@x', text: label, isoDate: new Date().toISOString(), link: 'https://example.com' }],
    errors: [],
  };
}

beforeEach(() => {
  cleanup();
  fetchFeeds.mockReset();
});

describe('FeedPage — load() race condition', () => {
  it('shows an accessible skeleton while the initial feed request is pending', async () => {
    const pending = deferred();
    fetchFeeds.mockReturnValue(pending.promise);

    render(<FeedPage />);

    expect(screen.getByRole('status', { name: 'Loading Intel Feed headlines' })).toBeInTheDocument();
    expect(screen.getByText('Loading headlines and source status…')).toBeInTheDocument();

    pending.resolve(feedResult('Loaded headline'));
    await waitFor(() => expect(screen.getByText('Loaded headline')).toBeInTheDocument());
    expect(screen.queryByRole('status', { name: 'Loading Intel Feed headlines' })).not.toBeInTheDocument();
  });

  it('uses a static skeleton variant when Low Data Mode is enabled', () => {
    window.localStorage.setItem('skip-low-data-mode', 'true');
    const pending = deferred();
    fetchFeeds.mockReturnValue(pending.promise);

    render(<FeedPage />);

    expect(screen.getByRole('status', { name: 'Loading Intel Feed headlines' })).toHaveClass('skip-feed-skeleton-low-data');
    window.localStorage.removeItem('skip-low-data-mode');
  });

  it('keeps the faster, newer group-selection response instead of an older, slower one clobbering it', async () => {
    const user = userEvent.setup();
    const initialLoad = deferred();
    const afterToggleLoad = deferred();
    let call = 0;

    fetchFeeds.mockImplementation(() => {
      call += 1;
      // 1st call: initial mount (all groups). 2nd call: after the group
      // toggle below fires a new, narrower-handle-set load.
      return call === 1 ? initialLoad.promise : afterToggleLoad.promise;
    });

    render(<FeedPage />);

    // Toggle a group off before the initial (slow) load resolves — this
    // fires the second, newer load() call with a different handle set.
    await waitFor(() => expect(fetchFeeds).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /Insiders/i }));
    await waitFor(() => expect(fetchFeeds).toHaveBeenCalledTimes(2));

    // Newer (post-toggle) request resolves first — it's the faster one.
    afterToggleLoad.resolve(feedResult('Fast newer-selection post'));
    await waitFor(() => expect(screen.getByText('Fast newer-selection post')).toBeInTheDocument());

    // Older (initial, pre-toggle) request resolves last. Without the fix
    // this would overwrite the screen with stale data even though the
    // group selection has already moved on.
    initialLoad.resolve(feedResult('Stale initial-load post'));

    // Give the stale resolution a tick to flush through, if it's going to.
    await new Promise(r => setTimeout(r, 50));

    expect(screen.getByText('Fast newer-selection post')).toBeInTheDocument();
    expect(screen.queryByText('Stale initial-load post')).not.toBeInTheDocument();
  });
});
