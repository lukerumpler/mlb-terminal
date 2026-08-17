const configuredOrigin = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

export function apiUrl(path) {
  const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`;
  if (/^https?:\/\//i.test(String(path || ''))) return String(path);
  return configuredOrigin ? `${configuredOrigin}${normalizedPath}` : normalizedPath;
}

export function apiOriginForTests() {
  return configuredOrigin;
}
