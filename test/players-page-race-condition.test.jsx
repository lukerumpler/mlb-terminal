import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocks searchPlayers/loadFullPlayer directly rather than going through
// fetch — PlayersPage.jsx's pickPlayer race condition (fixed 2026-08-11:
// clicking player A then quickly clicking player B before A's slower
// loadFullPlayer() response lands could let A's response resolve after
// B's and silently overwrite B's just-rendered data) needs precise control
// over which of two concurrent requests resolves first, which a real
// network mock can't guarantee deterministically run to run.
const searchPlayers = vi.fn();
const loadFullPlayer = vi.fn();
vi.mock('../client/src/api/mlb.js', () => ({
  searchPlayers: (...args) => searchPlayers(...args),
  loadFullPlayer: (...args) => loadFullPlayer(...args),
}));

const { default: PlayersPage } = await import('../client/src/pages/PlayersPage.jsx');

function mockPlayer(id, fullName) {
  return {
    id, profile: { fullName, primaryPosition: { abbreviation: 'OF' }, pitchHand: { code: 'R' }, batSide: { code: 'R' } },
    savant: null, batTracking: null, statcastPopulation: null, isPitcher: false,
    pitchArsenal: null, pitchArsenalPopulation: null, contactPoints: null, pitcherPitches: null,
    stats: {}, statSeason: 2026, isFallback: false, careerStats: null, splits: null, comps: [],
  };
}

// Deferred promise helper — lets the test control exactly when each
// loadFullPlayer() call resolves, in whichever order the assertion needs.
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  cleanup();
  searchPlayers.mockReset();
  loadFullPlayer.mockReset();
});

describe('PlayersPage — player comparison and race conditions', () => {
  it('opens the side-by-side comparison modal and loads a second player through the live adapter', async () => {
    const user = userEvent.setup();
    const primary = { id: 1, fullName: 'Primary Player' };
    const secondary = { id: 2, fullName: 'Second Player', currentTeam: { abbreviation:'NYM' }, primaryPosition: { abbreviation:'OF' } };
    searchPlayers.mockImplementation(async q => q === 'Primary' ? [primary] : q === 'Second' ? [secondary] : []);
    loadFullPlayer.mockResolvedValueOnce(mockPlayer(1, 'Primary Player')).mockResolvedValueOnce(mockPlayer(2, 'Second Player'));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, 'Primary');
    await waitFor(() => expect(screen.getByText('Primary Player')).toBeInTheDocument());
    await user.click(screen.getByText('Primary Player'));
    await waitFor(() => expect(screen.getByRole('button', { name:/Compare player/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name:/Compare player/i }));
    expect(screen.getByRole('dialog', { name:/Compare Primary Player/i })).toBeInTheDocument();
    const comparisonInput = screen.getByRole('textbox', { name:/Add second player/i });
    await user.type(comparisonInput, 'Second');
    await waitFor(() => expect(screen.getByText('Second Player')).toBeInTheDocument());
    await user.click(screen.getByText('Second Player'));
    await waitFor(() => expect(screen.getByText('Player B')).toBeInTheDocument());
    expect(global.__consoleErrors.filter(e => !e.includes('network unavailable')).length).toBe(0);
  });

  it('keeps the faster, later-clicked player instead of an older, slower response clobbering it', async () => {
    const user = userEvent.setup();
    const playerA = { id: 1, fullName: 'Slow Player A' };
    const playerB = { id: 2, fullName: 'Fast Player B' };
    const deferredA = deferred();
    const deferredB = deferred();

    searchPlayers.mockImplementation(async (q) => {
      if (q === 'Slow') return [playerA];
      if (q === 'Fast') return [playerB];
      return [];
    });
    loadFullPlayer.mockImplementation(async (person) => {
      if (person.id === 1) return deferredA.promise;
      if (person.id === 2) return deferredB.promise;
      throw new Error('unexpected player');
    });

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);

    // Click player A first (the slow one).
    await user.type(input, 'Slow');
    await waitFor(() => expect(screen.getByText('Slow Player A')).toBeInTheDocument());
    await user.click(screen.getByText('Slow Player A'));

    // Before A's fetch resolves, search for and click player B.
    await user.clear(input);
    await user.type(input, 'Fast');
    await waitFor(() => expect(screen.getByText('Fast Player B')).toBeInTheDocument());
    await user.click(screen.getByText('Fast Player B'));

    // B resolves first (it's the faster request).
    deferredB.resolve(mockPlayer(2, 'Fast Player B'));
    await waitFor(() => expect(loadFullPlayer).toHaveBeenCalledTimes(2));

    // A's stale, slower response resolves last — without the fix this
    // would overwrite B's data even though the search box reads "Fast
    // Player B".
    deferredA.resolve(mockPlayer(1, 'Slow Player A'));

    // Give both resolutions a tick to flush through React state updates.
    await new Promise(r => setTimeout(r, 50));

    expect(input.value).toBe('Fast Player B');
    // The real proof: the rendered player header shows B's name (falls
    // back to `fullName` since this mock has no useLastName/lastName),
    // not A's. Without the fix, A's stale response resolving last would
    // silently overwrite `player` state with A's data while the search
    // box still read "Fast Player B" — a mismatch this assertion would
    // catch that checking the input alone would not.
    await waitFor(() => expect(screen.getAllByText('Fast Player B').length).toBeGreaterThan(0));
    expect(screen.queryByText('Slow Player A')).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
  });
});
