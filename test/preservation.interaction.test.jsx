import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';
import CompareModal from '../client/src/components/CompareModal.jsx';
import ProspectCard from '../client/src/components/ProspectCard.jsx';
import { WatchStar } from '../client/src/components/atoms.jsx';
import { useWatchlist } from '../client/src/lib/watchlist.js';
import ScoutingNotesPage from '../client/src/pages/ScoutingNotesPage.jsx';
import { PROSPECT_BATTERS } from '../client/src/constants/data.js';

function WatchlistHarness() {
  const player = { mlbId: 990001, name: 'Test Prospect', team: 'SKIP', pos: 'SS' };
  const { list, isWatched, toggle } = useWatchlist();
  const [, forceRender] = useState(0);
  return (
    <div>
      <WatchStar
        watched={isWatched(player.mlbId)}
        onToggle={() => {
          toggle(player);
          forceRender((n) => n + 1);
        }}
      />
      <span data-testid="watch-count">{list.length}</span>
    </div>
  );
}

describe('SKIP preserved interactions and persistence', () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('keeps the light/dark toggle on html data-theme and localStorage', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    await user.click(screen.getByTitle('Toggle light / dark theme'));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('skip-theme')).toBe('dark');
  });

  it('opens the Command Palette from the visible Search control and exposes the original tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTitle('Overview')).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe('light');
    });
    await user.click(screen.getByTitle('Search everything'));

    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    expect(palette).toBeInTheDocument();
    expect(within(palette).getByText('Scouting Notes')).toBeInTheDocument();
    expect(within(palette).getByText('AMD / IMD')).toBeInTheDocument();
  });

  it('persists Watchlist stars across remounts', async () => {
    const user = userEvent.setup();
    const first = render(<WatchlistHarness />);
    const star = screen.getByRole('button', { name: '☆' });

    await user.click(star);
    expect(JSON.parse(localStorage.getItem('skip-watchlist'))).toHaveLength(1);
    expect(screen.getByTestId('watch-count')).toHaveTextContent('1');
    first.unmount();

    render(<WatchlistHarness />);
    expect(screen.getByTitle('Remove from watchlist')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('watch-count')).toHaveTextContent('1');
  });

  it('persists Scouting Notes across remounts', async () => {
    const user = userEvent.setup();
    const first = render(<ScoutingNotesPage />);

    await user.click(screen.getByRole('button', { name: '+ Quick Note' }));
    await user.type(screen.getByPlaceholderText('Player name'), 'Test Prospect');
    await user.type(screen.getByPlaceholderText('Quick observation…'), 'Keep the barrel in the zone.');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const stored = JSON.parse(localStorage.getItem('skip-scouting-notes'));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ player: 'Test Prospect', text: 'Keep the barrel in the zone.' });
    expect(screen.getByText('Keep the barrel in the zone.')).toBeInTheDocument();
    first.unmount();

    render(<ScoutingNotesPage />);
    expect(screen.getByText('Test Prospect')).toBeInTheDocument();
    expect(screen.getByText('Keep the barrel in the zone.')).toBeInTheDocument();
  });

  it('keeps CompareModal multi-player removal and ProspectCard close behavior', async () => {
    const user = userEvent.setup();
    const players = PROSPECT_BATTERS.slice(0, 4);
    const onRemove = vi.fn();
    const onClose = vi.fn();

    render(<CompareModal prospects={players} isPitcher={false} onClose={onClose} onRemove={onRemove} />);
    expect(screen.getByRole('dialog', { name: /Compare batters:/i })).toBeInTheDocument();
    expect(screen.getByText('Compare Batters · 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Remove ${players[0].name} from comparison` }));
    expect(onRemove).toHaveBeenCalledWith(players[0].mlbId);
    cleanup();

    render(<ProspectCard prospect={players[0]} isPitcher={false} pool={players} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: /scouting card/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close prospect card' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the required chart implementations present in the migrated source', async () => {
    const modules = await Promise.all([
      import('../client/src/pages/PlayersPage.jsx'),
      import('../client/src/components/ScatterBuilder.jsx'),
      import('../client/src/components/RadarCard.jsx'),
      import('../client/src/components/PitchShapePanel.jsx'),
      import('../client/src/pages/AMDPage.jsx'),
    ]);

    expect(modules[0]).toBeTruthy();
    expect(modules[1]).toBeTruthy();
    expect(modules[2]).toBeTruthy();
    expect(modules[3]).toBeTruthy();
    expect(modules[4]).toBeTruthy();
  });
});
