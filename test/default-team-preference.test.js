import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_PREFERENCE_KEY,
  PRODUCT_DEFAULT_TEAM_KEY,
  normalizeDefaultTeamKey,
  readDefaultTeamPreference,
  saveDefaultTeamPreference,
} from '../client/src/lib/defaultTeamPreference.js';

describe('default Team Overview preference', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps San Diego as the product fallback while accepting valid saved team keys', () => {
    expect(PRODUCT_DEFAULT_TEAM_KEY).toBe('sd');
    expect(normalizeDefaultTeamKey('SD')).toBe('sd');
    expect(normalizeDefaultTeamKey('not-a-team')).toBe('sd');
    window.localStorage.setItem(DEFAULT_TEAM_PREFERENCE_KEY, 'lad');
    expect(readDefaultTeamPreference()).toBe('lad');
  });

  it('normalizes and persists only recognized team keys', () => {
    expect(saveDefaultTeamPreference('NYY')).toBe('nyy');
    expect(window.localStorage.getItem(DEFAULT_TEAM_PREFERENCE_KEY)).toBe('nyy');
    expect(saveDefaultTeamPreference('unknown', 'nyy')).toBe('nyy');
    expect(window.localStorage.getItem(DEFAULT_TEAM_PREFERENCE_KEY)).toBe('nyy');
  });
});
