const STORAGE_KEY = 'skip-search-analytics-v1';
const EVENT_NAME = 'skip-search-analytics-updated';
const MAX_QUERY_LENGTH = 120;
const MAX_UNIQUE_QUERIES = 80;
const MAX_RESULTS = 8;

function safeRead() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(row => row && typeof row.query === 'string') : [];
  } catch {
    return [];
  }
}

function safeWrite(rows) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Local analytics are optional. Private browsing or storage limits should
    // never block a search from completing.
  }
}

export function normalizeSearchQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:\d{3,}|[\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi, '')
    .replace(/[^a-z0-9\s%+./'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function readSearchAnalytics() {
  return safeRead()
    .map(row => ({
      query: normalizeSearchQuery(row.query),
      count: Math.max(0, Number(row.count) || 0),
      lastUsedAt: Number(row.lastUsedAt) || 0,
      intent: typeof row.intent === 'string' ? row.intent : 'unknown',
      metric: typeof row.metric === 'string' ? row.metric : null,
      tab: typeof row.tab === 'string' ? row.tab : null,
      status: typeof row.status === 'string' ? row.status : 'unknown',
    }))
    .filter(row => row.query && row.count > 0)
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt);
}

export function recordSearchQuery(query, metadata = {}) {
  const normalized = normalizeSearchQuery(query);
  if (normalized.length < 2) return readSearchAnalytics();
  const rows = readSearchAnalytics();
  const existing = rows.find(row => row.query === normalized);
  const next = {
    query: normalized,
    count: (existing?.count || 0) + 1,
    lastUsedAt: Date.now(),
    intent: metadata.intent || existing?.intent || 'unknown',
    metric: metadata.metric || existing?.metric || null,
    tab: metadata.tab || existing?.tab || null,
    status: metadata.status || existing?.status || 'submitted',
  };
  const without = rows.filter(row => row.query !== normalized);
  safeWrite([next, ...without].sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt).slice(0, MAX_UNIQUE_QUERIES));
  return readSearchAnalytics();
}

export function clearSearchAnalytics() {
  safeWrite([]);
  return [];
}

export function getSearchShortcutHint(row) {
  if (row?.metric) return `Prioritize a ${String(row.metric).toUpperCase()} shortcut`;
  if (row?.intent === 'player') return 'Prioritize player-stat lookup';
  if (row?.intent === 'team') return 'Prioritize team-intel lookup';
  if (row?.tab) return `Prioritize ${row.tab} navigation`;
  return 'Review for a future shortcut';
}

export function getTopSearchQueries(limit = MAX_RESULTS) {
  return readSearchAnalytics().slice(0, Math.max(0, Number(limit) || MAX_RESULTS));
}

export const SEARCH_ANALYTICS_EVENT = EVENT_NAME;
export const SEARCH_ANALYTICS_STORAGE_KEY = STORAGE_KEY;
