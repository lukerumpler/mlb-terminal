const SETTINGS_KEY = 'skip-feed-freshness-settings';
const SUCCESS_KEY = 'skip-feed-freshness-successes';

export const FEED_DEFINITIONS = [
  { key:'mlb-scores', label:'MLB live scores', source:'MLB Stats API' },
  { key:'mlb-stats', label:'MLB team and player stats', source:'MLB Stats API' },
  { key:'savant', label:'Baseball Savant', source:'Baseball Savant' },
  { key:'spotrac', label:'Payroll and CBT financials', source:'Spotrac' },
  { key:'contracts', label:'Contract and service data', source:'Spotrac / MLB' },
  { key:'ncaa', label:'NCAA baseball', source:'NCAA / Henrygd API' },
  { key:'intel-feed', label:'Intel feed', source:'Configured feed proxy' },
];

export const DEFAULT_FEED_FRESHNESS_SETTINGS = Object.freeze({
  enabled: true,
  displayMode: 'relative',
});

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readFeedFreshnessSettings() {
  if (!canUseStorage()) return { ...DEFAULT_FEED_FRESHNESS_SETTINGS };
  const parsed = safeParse(window.localStorage.getItem(SETTINGS_KEY) || '', {});
  return {
    enabled: parsed.enabled !== false,
    displayMode: parsed.displayMode === 'exact' ? 'exact' : 'relative',
  };
}

export function saveFeedFreshnessSettings(next) {
  const current = readFeedFreshnessSettings();
  const value = {
    enabled: next?.enabled === undefined ? current.enabled : next.enabled !== false,
    displayMode: next?.displayMode === undefined ? current.displayMode : next.displayMode === 'exact' ? 'exact' : 'relative',
  };
  if (canUseStorage()) {
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* best effort */ }
  }
  return value;
}

export function readFeedSuccesses() {
  if (!canUseStorage()) return {};
  const parsed = safeParse(window.localStorage.getItem(SUCCESS_KEY) || '', {});
  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
    FEED_DEFINITIONS.some(feed => feed.key === key) && Number.isFinite(Number(value))
  )).map(([key, value]) => [key, Number(value)]));
}

export function recordFeedSuccess(feedKey, timestamp = Date.now()) {
  if (!FEED_DEFINITIONS.some(feed => feed.key === feedKey)) return null;
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return null;
  const next = { ...readFeedSuccesses(), [feedKey]: value };
  if (canUseStorage()) {
    try { window.localStorage.setItem(SUCCESS_KEY, JSON.stringify(next)); } catch { /* best effort */ }
    window.dispatchEvent?.(new CustomEvent('skip-feed-freshness-updated', { detail:{ feedKey, timestamp:value } }));
  }
  return value;
}

export function clearFeedSuccesses() {
  if (canUseStorage()) {
    try { window.localStorage.removeItem(SUCCESS_KEY); } catch { /* best effort */ }
    window.dispatchEvent?.(new CustomEvent('skip-feed-freshness-updated', { detail:{ cleared:true } }));
  }
}

export function formatFeedFreshness(timestamp, { mode = 'relative', now = Date.now() } = {}) {
  if (timestamp == null || timestamp === '') return 'No successful update recorded';
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return 'No successful update recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No successful update recorded';
  if (mode === 'exact') return date.toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
  const delta = Math.max(0, Number(now) - value);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function getFeedFreshnessRows(successes = readFeedSuccesses(), settings = readFeedFreshnessSettings()) {
  return FEED_DEFINITIONS.map(feed => ({
    ...feed,
    lastSuccess: Number.isFinite(Number(successes?.[feed.key])) ? Number(successes[feed.key]) : null,
    display: formatFeedFreshness(successes?.[feed.key], { mode:settings.displayMode }),
  }));
}

export function summarizeFeedFreshness(successes = readFeedSuccesses(), settings = readFeedFreshnessSettings(), now = Date.now()) {
  const rows = getFeedFreshnessRows(successes, settings);
  const successful = rows.filter(row => row.lastSuccess != null);
  const latest = successful.reduce((max, row) => Math.max(max, row.lastSuccess), 0) || null;
  return {
    total: rows.length,
    successful: successful.length,
    latest,
    display: formatFeedFreshness(latest, { mode:settings.displayMode, now }),
  };
}

export function inferMlbFeedKey(path) {
  return String(path || '').startsWith('/schedule') || String(path || '').startsWith('/game') ? 'mlb-scores' : 'mlb-stats';
}
