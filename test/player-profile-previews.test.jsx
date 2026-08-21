import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PlayerProfilePreviewsPage from '../client/src/pages/PlayerProfilePreviewsPage.jsx';

describe('Player Profile isolated feature previews', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('renders source-labeled fixture previews for the extracted media and boxscore workflows', () => {
    render(<PlayerProfilePreviewsPage />);

    expect(screen.getByRole('heading', { name: 'Player Profile feature previews' })).toBeInTheDocument();
    expect(screen.getByText(/not live baseball data/i)).toBeInTheDocument();
    expect(screen.getByText('Player Video')).toBeInTheDocument();
    expect(screen.getByText('Boxscore OPS Splits')).toBeInTheDocument();
    expect(screen.getAllByText(/illustrative ui fixture/i).length).toBeGreaterThan(0);
  });

  it('lets an interface reviewer exercise loading and unavailable boxscore states without live provider calls', () => {
    render(<PlayerProfilePreviewsPage />);
    const state = screen.getByLabelText('Preview boxscore state');

    fireEvent.change(state, { target: { value: 'loading' } });
    expect(screen.getByText('Checking official boxscores')).toBeInTheDocument();

    fireEvent.change(state, { target: { value: 'unavailable' } });
    expect(screen.getAllByText(/previewing the explicit unavailable state/i).length).toBeGreaterThan(0);
  });
});
