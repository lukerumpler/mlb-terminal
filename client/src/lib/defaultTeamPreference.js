import { TEAMS } from '../constants/data.js';

export const DEFAULT_TEAM_PREFERENCE_KEY = 'skip-default-team-key-v1';
export const PRODUCT_DEFAULT_TEAM_KEY = 'sd';

export function normalizeDefaultTeamKey(value, fallback = PRODUCT_DEFAULT_TEAM_KEY) {
  const key = String(value || '').trim().toLowerCase();
  return TEAMS[key] ? key : fallback;
}

export function readDefaultTeamPreference(fallback = PRODUCT_DEFAULT_TEAM_KEY) {
  try {
    return normalizeDefaultTeamKey(localStorage.getItem(DEFAULT_TEAM_PREFERENCE_KEY), fallback);
  } catch {
    return normalizeDefaultTeamKey(fallback);
  }
}

export function saveDefaultTeamPreference(value, fallback = PRODUCT_DEFAULT_TEAM_KEY) {
  const teamKey = normalizeDefaultTeamKey(value, fallback);
  try {
    localStorage.setItem(DEFAULT_TEAM_PREFERENCE_KEY, teamKey);
  } catch {
    // A browser may block persistent storage; the in-memory React setting still applies for this session.
  }
  return teamKey;
}
