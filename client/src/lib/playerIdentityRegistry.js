const REGISTRY_KEY = 'skip:player-provider-identity:v1';
const REGISTRY_TTL_MS = 30 * 24 * 60 * 60_000;
const BREF_ID_PATTERN = /^[a-z][a-z0-9]{8}$/;

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'\u2018\u2019`,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function storageFor(storage) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function readRegistry(storage) {
  const resolvedStorage = storageFor(storage);
  if (!resolvedStorage) return {};
  try {
    const parsed = JSON.parse(resolvedStorage.getItem(REGISTRY_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry, storage) {
  const resolvedStorage = storageFor(storage);
  if (!resolvedStorage) return;
  try {
    resolvedStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Quota/privacy-mode failures should only disable persistence, never player loading.
  }
}

export function isUsablePlayerProviderIdentity(identity, { mlbId, fullName } = {}) {
  const expectedId = String(mlbId || '').trim();
  const expectedName = normalizeName(fullName);
  const mappedMlbId = String(identity?.mlb?.id || '').trim();
  const brefId = String(identity?.baseballReference?.id || '').toLowerCase();
  const matchedName = normalizeName(identity?.baseballReference?.matchedName);
  const canonicalUrl = String(identity?.baseballReference?.canonicalUrl || '');
  return Boolean(
    expectedId && expectedName &&
    mappedMlbId === expectedId &&
    BREF_ID_PATTERN.test(brefId) &&
    matchedName === expectedName &&
    canonicalUrl === `https://www.baseball-reference.com/players/${brefId[0]}/${brefId}.shtml` &&
    identity?.baseballReference?.confidence === 'exact-name'
  );
}

export function getStoredPlayerProviderIdentity({ mlbId, fullName, now = Date.now(), storage } = {}) {
  const key = String(mlbId || '').trim();
  if (!key) return null;
  const registry = readRegistry(storage);
  const entry = registry[key];
  if (!entry || Number(entry.expiresAt) <= now || !isUsablePlayerProviderIdentity(entry.identity, { mlbId:key, fullName })) {
    if (entry) {
      delete registry[key];
      writeRegistry(registry, storage);
    }
    return null;
  }
  return entry.identity;
}

export function storePlayerProviderIdentity({ mlbId, fullName, identity, now = Date.now(), storage } = {}) {
  const key = String(mlbId || '').trim();
  if (!key || !isUsablePlayerProviderIdentity(identity, { mlbId:key, fullName })) return false;
  const registry = readRegistry(storage);
  registry[key] = {
    identity,
    expiresAt: now + REGISTRY_TTL_MS,
  };
  writeRegistry(registry, storage);
  return true;
}

export function removeStoredPlayerProviderIdentity({ mlbId, storage } = {}) {
  const key = String(mlbId || '').trim();
  if (!key) return;
  const registry = readRegistry(storage);
  if (registry[key]) {
    delete registry[key];
    writeRegistry(registry, storage);
  }
}

export function __resetPlayerIdentityRegistryForTests(storage) {
  const resolvedStorage = storageFor(storage);
  resolvedStorage?.removeItem(REGISTRY_KEY);
}
