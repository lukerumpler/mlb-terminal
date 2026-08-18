function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function resolveApiOrigin(configuredValue, { development = false, currentOrigin = '' } = {}) {
  const configured = normalizeOrigin(configuredValue);
  if (!configured || !development || !currentOrigin) return configured;
  try {
    return new URL(configured).origin === new URL(currentOrigin).origin ? configured : '';
  } catch {
    return '';
  }
}

const configuredOrigin = resolveApiOrigin(import.meta.env.VITE_API_BASE, {
  development: Boolean(import.meta.env.DEV),
  currentOrigin: typeof window === 'undefined' ? '' : window.location.origin,
});

export function apiUrl(path) {
  const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`;
  if (/^https?:\/\//i.test(String(path || ''))) return String(path);
  return configuredOrigin ? `${configuredOrigin}${normalizedPath}` : normalizedPath;
}

export function apiOriginForTests() {
  return configuredOrigin;
}
