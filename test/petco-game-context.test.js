import { describe, expect, it } from 'vitest';
import { derivePetcoParkGameContext, formatLocalGameTime, getInitialOverviewView } from '../client/src/pages/OverviewPage.jsx';

describe('Petco Park game context helpers', () => {
  it('selects only a Padres home game for Petco Park weather and time context', () => {
    const context = derivePetcoParkGameContext([
      { gamePk: 1, status: 'Scheduled', home: { id: 100 }, away: { id: 135 } },
      { gamePk: 2, status: 'In Progress', inning: 4, home: { id: 135 }, away: { id: 100, abbr: 'OPP' } },
    ]);
    expect(context).toEqual(expect.objectContaining({ status: 'live', game: expect.objectContaining({ gamePk: 2 }), opponent: expect.objectContaining({ abbr: 'OPP' }) }));
  });

  it('does not invent game time when no valid official game time exists', () => {
    expect(derivePetcoParkGameContext([], 135).status).toBe('no-game');
    expect(formatLocalGameTime(null)).toBe('Time unavailable');
    expect(formatLocalGameTime('invalid')).toBe('Time unavailable');
  });

  it('allows a valid Operations preview route without changing the normal briefing default', () => {
    expect(getInitialOverviewView('?overviewView=operations')).toBe('operations');
    expect(getInitialOverviewView('?overviewView=unsupported')).toBe('briefing');
  });
});
