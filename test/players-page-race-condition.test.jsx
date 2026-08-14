import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    savant: { est_woba: 0.350, avg_hit_speed: 92, est_slg: 0.500, whiff_percent: 20, oz_swing_percent: 28 },
    batTracking: { avg_bat_speed: 72 },
    expectedStatisticsPopulation: [{ est_woba: 0.280, est_slg: 0.400 }, { est_woba: 0.320, est_slg: 0.460 }, { est_woba: 0.380, est_slg: 0.560 }],
    statcastPopulation: [{ avg_hit_speed: 86, whiff_percent: 28, oz_swing_percent: 35 }, { avg_hit_speed: 90, whiff_percent: 23, oz_swing_percent: 30 }, { avg_hit_speed: 96, whiff_percent: 17, oz_swing_percent: 24 }],
    batTrackingPopulation: [{ avg_bat_speed: 68 }, { avg_bat_speed: 72 }, { avg_bat_speed: 76 }],
    isPitcher: false,
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

const originalFetch = global.fetch;

beforeEach(() => {
  cleanup();
  searchPlayers.mockReset();
  loadFullPlayer.mockReset();
  global.fetch = vi.fn(async url => {
    if (url === '/api/comparison-summary') return { ok: true, json: async () => ({
      headline: 'Primary Player owns the clearest percentile edge',
      summary: 'Power: Primary Player by 14 percentile points.',
      edges: [{ axis: 'Power', leader: 'Primary Player', margin: 14 }],
      caveat: 'Generated only from the supplied Savant axes.',
      generated: true,
    }) };
    return originalFetch(url);
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('PlayersPage — player comparison and race conditions', () => {
  it('keeps the profile layout breathable and collapses it at responsive breakpoints', () => {
    const css = readFileSync(join(process.cwd(), 'client/src/index.css'), 'utf8');
    expect(css).toContain('.skip-player-page { --profile-ease:');
    expect(css).toContain('.skip-player-main-grid { grid-template-columns: minmax(170px, 210px) minmax(0, 1fr) !important; }');
    expect(css).toContain('.skip-player-main-grid { grid-template-columns: 1fr !important; gap: 10px !important; }');
    expect(css).toContain('.skip-profile-photo-frame, .skip-profile-photo-frame img { width: 92px !important; height: 116px !important;');
  });

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
    await waitFor(() => expect(screen.getByText('AI Profile Summary')).toBeInTheDocument());
    expect(screen.getByText(/Primary Player owns the clearest percentile edge/)).toBeInTheDocument();
    expect(global.__consoleErrors.filter(e => !e.includes('network unavailable')).length).toBe(0);
  });

  it('renders accessible highlight search shortcuts in the Player Video panel', async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: 'Video Player' }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, 'Video Player'));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, 'Video');
    await waitFor(() => expect(screen.getByText('Video Player')).toBeInTheDocument());
    await user.click(screen.getByText('Video Player'));

    await waitFor(() => expect(screen.getByText('Player Video')).toBeInTheDocument());
    expect(screen.getByText('Highlight search shortcuts')).toBeInTheDocument();
    const shortcut = screen.getByRole('link', { name:/Search Home run & extra-base plays/i });
    expect(shortcut).toHaveAttribute('target', '_blank');
    expect(shortcut.getAttribute('href')).toContain('youtube.com/results?search_query=');
    expect(shortcut.getAttribute('href')).not.toContain('#t=');
    await user.click(shortcut);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it('updates the selected metric when a profile KPI is clicked', async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: 'Interactive Player' }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, 'Interactive Player'));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, 'Interactive');
    await waitFor(() => expect(screen.getByText('Interactive Player')).toBeInTheDocument());
    await user.click(screen.getByText('Interactive Player'));
    await waitFor(() => expect(screen.getByRole('button', { name:/TPVI True Value/i })).toBeInTheDocument());
    expect(document.querySelector('.skip-profile-photo-frame')).toBeInTheDocument();
    expect(screen.getByText(/Focus: Value/i)).toBeInTheDocument();

    const casButton = screen.getByRole('button', { name:/CAS Contact Auth/i });
    await user.click(casButton);

    expect(casButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('CAS');
    expect(screen.getByText(/Focus: Contact/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name:/TPVI True Value/i })).toHaveAttribute('aria-pressed', 'false');
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
