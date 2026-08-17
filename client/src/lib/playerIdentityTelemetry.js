const TELEMETRY_KEY = 'skip-player-identity-telemetry-v1';

const EMPTY_COUNTERS = Object.freeze({
  resolverRequests: 0,
  registryReuses: 0,
  directIdRequests: 0,
  directIdVerified: 0,
  directIdInvalidated: 0,
  searchRequests: 0,
  searchResolved: 0,
  noMatch: 0,
  transportFallbacks: 0,
});

const EVENT_TO_COUNTER = Object.freeze({
  'resolver-request': 'resolverRequests',
  'registry-reuse': 'registryReuses',
  'direct-id-request': 'directIdRequests',
  'direct-id-verified': 'directIdVerified',
  'direct-id-invalidated': 'directIdInvalidated',
  'name-search-request': 'searchRequests',
  'name-search-resolved': 'searchResolved',
  'no-match': 'noMatch',
  'transport-fallback': 'transportFallbacks',
});

function storageFor(storage) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function asNonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function readPlayerIdentityTelemetry(storage) {
  const resolvedStorage = storageFor(storage);
  const parsed = resolvedStorage ? safeParse(resolvedStorage.getItem(TELEMETRY_KEY)) : {};
  return {
    counters: Object.fromEntries(Object.keys(EMPTY_COUNTERS).map(key => [key, asNonNegativeNumber(parsed?.counters?.[key])])),
    updatedAt: Number.isFinite(Number(parsed?.updatedAt)) ? Number(parsed.updatedAt) : null,
  };
}

export function recordPlayerIdentityTelemetry(event, { now = Date.now(), storage } = {}) {
  const counter = EVENT_TO_COUNTER[event];
  if (!counter) return readPlayerIdentityTelemetry(storage);
  const resolvedStorage = storageFor(storage);
  const current = readPlayerIdentityTelemetry(resolvedStorage);
  const next = {
    counters: { ...current.counters, [counter]: current.counters[counter] + 1 },
    updatedAt: Number(now),
  };
  if (resolvedStorage) {
    try { resolvedStorage.setItem(TELEMETRY_KEY, JSON.stringify(next)); } catch { /* best effort */ }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent?.(new CustomEvent('skip-player-identity-telemetry-updated', { detail:{ event, updatedAt:next.updatedAt } }));
    }
  }
  return next;
}

export function summarizePlayerIdentityTelemetry(telemetry = readPlayerIdentityTelemetry()) {
  const counters = { ...EMPTY_COUNTERS, ...(telemetry?.counters || {}) };
  const rate = (numerator, denominator) => denominator > 0 ? Number((100 * numerator / denominator).toFixed(1)) : null;
  return {
    ...counters,
    updatedAt: telemetry?.updatedAt || null,
    registryReuseRate: rate(counters.registryReuses, counters.resolverRequests),
    directIdVerificationRate: rate(counters.directIdVerified, counters.directIdRequests),
    searchAvoidanceRate: rate(counters.directIdRequests, counters.directIdRequests + counters.searchRequests),
  };
}

export function __resetPlayerIdentityTelemetryForTests(storage) {
  storageFor(storage)?.removeItem(TELEMETRY_KEY);
}
