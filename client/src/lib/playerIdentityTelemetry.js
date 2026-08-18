const TELEMETRY_KEY = "skip-player-identity-telemetry-v1";
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
  "resolver-request": "resolverRequests",
  "registry-reuse": "registryReuses",
  "direct-id-request": "directIdRequests",
  "direct-id-verified": "directIdVerified",
  "direct-id-invalidated": "directIdInvalidated",
  "name-search-request": "searchRequests",
  "name-search-resolved": "searchResolved",
  "no-match": "noMatch",
  "transport-fallback": "transportFallbacks",
});

function storageFor(storage) {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readPlayerIdentityTelemetry(storage) {
  try {
    const parsed = JSON.parse(storageFor(storage)?.getItem(TELEMETRY_KEY) || "{}");
    return {
      counters: Object.fromEntries(
        Object.keys(EMPTY_COUNTERS).map(key => [
          key,
          Math.max(0, Number(parsed?.counters?.[key]) || 0),
        ])
      ),
      updatedAt: Number.isFinite(Number(parsed?.updatedAt))
        ? Number(parsed.updatedAt)
        : null,
    };
  } catch {
    return { counters: { ...EMPTY_COUNTERS }, updatedAt: null };
  }
}

export function recordPlayerIdentityTelemetry(event, { now = Date.now(), storage } = {}) {
  const counter = EVENT_TO_COUNTER[event];
  const current = readPlayerIdentityTelemetry(storage);
  if (!counter) return current;
  const next = {
    counters: { ...current.counters, [counter]: current.counters[counter] + 1 },
    updatedAt: Number(now),
  };
  try {
    storageFor(storage)?.setItem(TELEMETRY_KEY, JSON.stringify(next));
  } catch {
    // Telemetry is aggregate-only and best-effort.
  }
  return next;
}

export function __resetPlayerIdentityTelemetryForTests(storage) {
  storageFor(storage)?.removeItem(TELEMETRY_KEY);
}
