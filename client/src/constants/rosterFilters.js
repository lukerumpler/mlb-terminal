export const ROSTER_DEFAULTS_STORAGE_KEY = 'skip-roster-sample-defaults';

export const DEFAULT_ROSTER_DEFAULTS = {
  battingPa: 0,
  pitchingIp: 0,
};

export function sanitizeRosterDefaults(value) {
  const battingPa = Number(value?.battingPa);
  const pitchingIp = Number(value?.pitchingIp);
  return {
    battingPa: Number.isFinite(battingPa) && battingPa >= 0 ? battingPa : DEFAULT_ROSTER_DEFAULTS.battingPa,
    pitchingIp: Number.isFinite(pitchingIp) && pitchingIp >= 0 ? pitchingIp : DEFAULT_ROSTER_DEFAULTS.pitchingIp,
  };
}

export function loadRosterDefaults() {
  try {
    const raw = localStorage.getItem(ROSTER_DEFAULTS_STORAGE_KEY);
    return sanitizeRosterDefaults(raw ? JSON.parse(raw) : DEFAULT_ROSTER_DEFAULTS);
  } catch {
    return { ...DEFAULT_ROSTER_DEFAULTS };
  }
}

export function saveRosterDefaults(value) {
  try {
    localStorage.setItem(ROSTER_DEFAULTS_STORAGE_KEY, JSON.stringify(sanitizeRosterDefaults(value)));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory setting still works.
  }
}
