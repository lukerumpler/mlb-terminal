const STORAGE_KEY = 'skip-cbt-history-range';

export const CBT_HISTORY_OPTIONS = Object.freeze([5, 10, 15]);

export function normalizeCbtHistoryRange(value) {
  const parsed = Number(value);
  return CBT_HISTORY_OPTIONS.includes(parsed) ? parsed : 5;
}

export function readCbtHistoryRange() {
  if (typeof window === 'undefined') return 5;
  try {
    return normalizeCbtHistoryRange(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 5;
  }
}

export function saveCbtHistoryRange(value) {
  const normalized = normalizeCbtHistoryRange(value);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, String(normalized)); } catch { /* best effort */ }
  }
  return normalized;
}

export function buildCbtHistorySeasons(range = 5, currentSeason = 2026) {
  const count = normalizeCbtHistoryRange(range);
  const current = Number(currentSeason);
  if (!Number.isInteger(current)) return [];
  return Array.from({ length:count }, (_, index) => current - count + index + 1);
}
