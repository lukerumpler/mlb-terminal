const REGISTRY_KEY = "skip-player-provider-identity-v1";
const REGISTRY_TTL_MS = 30 * 24 * 60 * 60_000;
const BREF_ID_PATTERN = /^[a-z][a-z0-9]{8}$/;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'\u2018\u2019`,-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function storageFor(storage) {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function readRegistry(storage) {
  try {
    const value = storageFor(storage)?.getItem(REGISTRY_KEY) || "{}";
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry, storage) {
  try {
    storageFor(storage)?.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Private browsing or storage quota issues must not block player loading.
  }
}

export function isUsablePlayerProviderIdentity(identity, { mlbId, fullName } = {}) {
  const expectedId = String(mlbId || "").trim();
  const expectedName = normalizeName(fullName);
  const brefId = String(identity?.baseballReference?.id || "").toLowerCase();
  return Boolean(
    expectedId &&
      expectedName &&
      String(identity?.mlb?.id || "") === expectedId &&
      BREF_ID_PATTERN.test(brefId) &&
      normalizeName(identity?.baseballReference?.matchedName) === expectedName &&
      identity?.baseballReference?.canonicalUrl ===
        `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml` &&
      identity?.baseballReference?.confidence === "exact-name"
  );
}

export function getStoredPlayerProviderIdentity({ mlbId, fullName, now = Date.now(), storage } = {}) {
  const key = String(mlbId || "").trim();
  if (!key) return null;
  const registry = readRegistry(storage);
  const entry = registry[key];
  if (
    !entry ||
    Number(entry.expiresAt) <= now ||
    !isUsablePlayerProviderIdentity(entry.identity, { mlbId, fullName })
  ) {
    if (entry) {
      delete registry[key];
      writeRegistry(registry, storage);
    }
    return null;
  }
  return entry.identity;
}

export function storePlayerProviderIdentity({ mlbId, fullName, identity, now = Date.now(), storage } = {}) {
  const key = String(mlbId || "").trim();
  if (!key || !isUsablePlayerProviderIdentity(identity, { mlbId, fullName })) return false;
  const registry = readRegistry(storage);
  registry[key] = { identity, expiresAt: now + REGISTRY_TTL_MS };
  writeRegistry(registry, storage);
  return true;
}

export function removeStoredPlayerProviderIdentity({ mlbId, storage } = {}) {
  const key = String(mlbId || "").trim();
  if (!key) return;
  const registry = readRegistry(storage);
  if (!registry[key]) return;
  delete registry[key];
  writeRegistry(registry, storage);
}

export function __resetPlayerIdentityRegistryForTests(storage) {
  storageFor(storage)?.removeItem(REGISTRY_KEY);
}
