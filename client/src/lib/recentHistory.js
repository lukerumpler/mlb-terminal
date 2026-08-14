const STORAGE_KEY = 'skip-recent-history';
export const RECENT_HISTORY_LIMIT = 8;

function storageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeEntry(entry) {
  if (!entry || (entry.type !== 'player' && entry.type !== 'team')) return null;
  const identity = entry.type === 'player' ? entry.id : String(entry.abbr || entry.id || '').toUpperCase();
  if (!identity || !entry.label) return null;
  return {
    type: entry.type,
    id: entry.type === 'player' ? Number(identity) || identity : undefined,
    abbr: entry.type === 'team' ? identity : undefined,
    label: String(entry.label),
    secondary: entry.secondary ? String(entry.secondary) : '',
    viewedAt: Number(entry.viewedAt) || 0,
  };
}

export function readRecentHistory() {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeEntry).filter(Boolean).slice(0, RECENT_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveRecentHistory(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeEntry).filter(Boolean).slice(0, RECENT_HISTORY_LIMIT) : [];
  if (storageAvailable()) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch { /* best effort */ }
    window.dispatchEvent(new CustomEvent('skip-recent-history-updated'));
  }
  return normalized;
}

export function recordRecentView(entry) {
  const next = normalizeEntry({ ...entry, viewedAt: Date.now() });
  if (!next) return readRecentHistory();
  const key = next.type === 'player' ? `player:${next.id}` : `team:${next.abbr}`;
  const existing = readRecentHistory().filter(item => {
    const itemKey = item.type === 'player' ? `player:${item.id}` : `team:${item.abbr}`;
    return itemKey !== key;
  });
  return saveRecentHistory([next, ...existing]);
}

export function clearRecentHistory() {
  return saveRecentHistory([]);
}

export function formatRecentHistoryTime(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return 'Recently viewed';
  const age = Math.max(0, Number(now) - value);
  if (age < 60_000) return 'Just now';
  if (age < 3_600_000) return `${Math.max(1, Math.floor(age / 60_000))}m ago`;
  if (age < 86_400_000) return `${Math.max(1, Math.floor(age / 3_600_000))}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

export { STORAGE_KEY as RECENT_HISTORY_STORAGE_KEY };
