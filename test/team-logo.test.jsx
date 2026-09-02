import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import TeamLogo from '../client/src/components/TeamLogo.jsx';
import { setLowDataMode } from '../client/src/lib/lowData.js';

// Regression coverage for a real gap: unlike PlayerPhoto.jsx's existing
// onError fallback pattern, TeamLogo had no equivalent — a broken image
// icon would show if the mlbstatic.com SVG ever 404s — and didn't respect
// Low Data Mode the way other image-heavy components do.
describe('TeamLogo', () => {
  beforeEach(() => {
    cleanup();
    setLowDataMode(false);
  });

  afterEach(() => {
    cleanup();
    setLowDataMode(false);
  });

  it('renders the real logo image for a known team by default', () => {
    render(<TeamLogo abbr="LAD" size={32} />);
    const img = screen.getByRole('img', { name: 'Los Angeles Dodgers logo' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('mlbstatic.com/team-logos/119.svg'));
  });

  it('falls back to a text badge if the logo image fails to load', () => {
    render(<TeamLogo abbr="LAD" size={32} />);
    const img = screen.getByRole('img', { name: 'Los Angeles Dodgers logo' });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('LAD')).toBeInTheDocument();
  });

  it('shows the fallback badge instead of an image while Low Data Mode is on', () => {
    setLowDataMode(true);
    render(<TeamLogo abbr="LAD" size={32} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('LAD')).toBeInTheDocument();
    expect(screen.getByLabelText(/hidden in Low Data Mode/)).toBeInTheDocument();
  });

  it('still falls back cleanly for an unknown team abbreviation', () => {
    render(<TeamLogo abbr="ZZZ" size={32} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('ZZZ')).toBeInTheDocument();
  });

  it('clears a prior load failure when switching to a different team', () => {
    const { rerender } = render(<TeamLogo abbr="LAD" size={32} />);
    fireEvent.error(screen.getByRole('img', { name: 'Los Angeles Dodgers logo' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<TeamLogo abbr="NYY" size={32} />);
    expect(screen.getByRole('img', { name: 'New York Yankees logo' })).toBeInTheDocument();
  });
});
