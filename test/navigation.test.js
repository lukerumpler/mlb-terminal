import { describe, expect, it, vi } from 'vitest';
import { openPlayerProfile, openTeamOverview } from '../client/src/lib/navigation.js';

describe('navigation helper dispatchers', () => {
  it('dispatches skip-open-player event with person details', () => {
    const listener = vi.fn();
    window.addEventListener('skip-open-player', listener);
    openPlayerProfile({ id: 660271, fullName: 'Shohei Ohtani' });
    expect(listener).toHaveBeenCalled();
    const event = listener.mock.calls[0][0];
    expect(event.detail).toEqual({ id: 660271, fullName: 'Shohei Ohtani' });
    window.removeEventListener('skip-open-player', listener);
  });

  it('dispatches skip-open-team event with team abbreviation', () => {
    const listener = vi.fn();
    window.addEventListener('skip-open-team', listener);
    openTeamOverview('LAD');
    expect(listener).toHaveBeenCalled();
    const event = listener.mock.calls[0][0];
    expect(event.detail).toEqual({ abbr: 'LAD' });
    window.removeEventListener('skip-open-team', listener);
  });
});
