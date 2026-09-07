import { apiUrl } from '../lib/apiOrigin.js';

export async function routeNaturalLanguageSearch(query) {
  const normalized = String(query || '').trim().slice(0, 240);
  if (normalized.length < 2) throw new Error('Enter at least two characters.');
  let response;
  try {
    response = await fetch(apiUrl('/api/natural-search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: normalized }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (transportError) {
    // Same defensive fix as mlb()/ncaa()/fetchProviderJson()/uptimeMonitor.js
    // (§29 audit): a raw fetch() failure (offline/DNS/CORS) has a
    // browser-authored .message like "Failed to fetch", and CommandPalette
    // renders error.message directly into its role="alert" AI-search error
    // banner — the JSON-parse case a couple lines below was already
    // guarded, this one wasn't.
    if (transportError?.name === 'AbortError' || transportError?.name === 'TimeoutError') throw transportError;
    throw new Error('Natural-language search could not reach the server', { cause: transportError });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Natural-language search is unavailable.');
  return data;
}
