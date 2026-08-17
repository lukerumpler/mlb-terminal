import { apiUrl } from '../lib/apiOrigin.js';

export async function routeNaturalLanguageSearch(query) {
  const normalized = String(query || '').trim().slice(0, 240);
  if (normalized.length < 2) throw new Error('Enter at least two characters.');
  const response = await fetch(apiUrl('/api/natural-search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: normalized }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Natural-language search is unavailable.');
  return data;
}
