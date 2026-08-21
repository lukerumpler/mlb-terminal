import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PlayerPhoto from '../client/src/components/PlayerPhoto.jsx';
import { setLowDataMode } from '../client/src/lib/lowData.js';

describe('PlayerPhoto', () => {
  afterEach(() => {
    cleanup();
    setLowDataMode(false);
  });

  it('uses the official MLB headshot only for a stable positive player ID', () => {
    render(<PlayerPhoto id={518692} name="Mookie Betts" alt="Mookie Betts" />);
    expect(screen.getByRole('img', { name: 'Mookie Betts' })).toHaveAttribute(
      'src',
      expect.stringContaining('/people/518692/headshot/67/current')
    );
  });

  it('centers the Team Leaders avatar crop lower than the portrait crop so the lower face remains visible', () => {
    const { rerender } = render(<PlayerPhoto id={518692} name="Mookie Betts" alt="Mookie Betts" variant="avatar" size={22} />);
    expect(screen.getByRole('img', { name: 'Mookie Betts' })).toHaveStyle({ objectPosition: 'center 35%' });

    rerender(<PlayerPhoto id={518692} name="Mookie Betts" alt="Mookie Betts" />);
    expect(screen.getByRole('img', { name: 'Mookie Betts' })).toHaveStyle({ objectPosition: 'center top' });
  });

  it('uses safe initials rather than an unverified portrait URL when the player ID is unavailable', () => {
    render(<PlayerPhoto id={null} name="Unknown Prospect" alt="Unknown Prospect" variant="avatar" size={22} />);
    expect(screen.getByRole('img', { name: 'Unknown Prospect' })).toHaveTextContent('UP');
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('uses initials in low-data mode even when a verified player ID exists', () => {
    setLowDataMode(true);
    render(<PlayerPhoto id={518692} name="Mookie Betts" alt="Mookie Betts" />);
    expect(screen.getByRole('img', { name: 'Mookie Betts' })).toHaveTextContent('MB');
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });
});
