import { describe, expect, it } from 'vitest';
import { normalizeOrganizationRosterEntry } from './mlb.js';

describe('normalizeOrganizationRosterEntry', () => {
  it('retains official organization membership and status without inventing a prospect rank', () => {
    const entry = normalizeOrganizationRosterEntry({
      jerseyNumber: '17',
      person: {
        id: 800543,
        fullName: 'Josue De Paula',
        currentAge: 21,
        batSide: { code: 'L' },
        pitchHand: { code: 'L' },
        currentTeam: { name: 'Los Angeles Dodgers' },
      },
      position: { abbreviation: 'OF', type: 'Outfielder' },
      status: { code: 'A', description: 'Active' },
    }, { id: 119, abbr: 'LAD', name: 'Los Angeles Dodgers' });

    expect(entry).toMatchObject({
      id: 800543,
      name: 'Josue De Paula',
      position: 'OF',
      age: 21,
      bats: 'L',
      throws: 'L',
      rosterStatus: 'Active',
      organizationId: 119,
      organizationAbbr: 'LAD',
    });
    expect(entry).not.toHaveProperty('rank');
  });

  it('provides safe presentation fallbacks when the official payload is sparse', () => {
    const entry = normalizeOrganizationRosterEntry({ person: { id: 7, fullName: 'Verified Player' } }, { id: 119, abbr: 'LAD', name: 'Los Angeles Dodgers' });
    expect(entry).toMatchObject({ position: '—', rosterStatus: 'Status unavailable', currentTeamName: 'Los Angeles Dodgers' });
  });
});
