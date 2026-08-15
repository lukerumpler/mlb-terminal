import { invokeLLM } from '../_core/llm.ts';

const CACHE_TTL_MS = 60_000;
const MAX_QUERY_LENGTH = 240;
const searchCache = new Map();

const VALID_TABS = new Set(['overview', 'players', 'prospects', 'draft', 'league', 'intelligence', 'amd', 'knowledge', 'notes', 'feed', 'follows', 'settings']);
const VALID_INTENTS = new Set(['player', 'team', 'page', 'unknown']);

function clean(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeResult(value, fallbackQuery) {
  const intent = VALID_INTENTS.has(value?.intent) ? value.intent : 'unknown';
  const tab = VALID_TABS.has(value?.tab) ? value.tab : null;
  const entity = clean(value?.entity, 100) || null;
  const metric = clean(value?.metric, 50) || null;
  const interpretation = clean(value?.interpretation, 220) || `No verified destination was identified for “${fallbackQuery}”.`;
  return { intent, tab, entity, metric, interpretation, generated: Boolean(value?.generated) };
}

function fallbackResult(query) {
  return normalizeResult({
    intent: 'unknown',
    tab: null,
    entity: null,
    metric: null,
    interpretation: 'AI search is unavailable. Use a player name, team name, or a page name and try again.',
    generated: false,
  }, query);
}

export function clearNaturalSearchCache() {
  searchCache.clear();
}

export default async function naturalSearch(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const query = clean(req.body?.query, MAX_QUERY_LENGTH);
  if (query.length < 2) {
    res.status(400).json({ error: 'Provide a natural-language search query.' });
    return;
  }

  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('X-Search-Cache', 'HIT');
    res.json({ ...cached.data, cached: true });
    return;
  }

  try {
    const response = await invokeLLM({
      model: 'gpt-5-mini',
      reasoning: { effort: 'minimal' },
      maxTokens: 260,
      messages: [
        {
          role: 'system',
          content: 'You are SKIP, a baseball intelligence search router. Interpret the user query only to identify a verified navigation destination. Never answer with a statistic, projection, ranking, injury, or scouting claim. Never invent an entity. Return intent player when the query names a player, team when it names an MLB team, page when it requests a known SKIP page, and unknown when the entity or destination is unclear. For player or team intent, entity must be the user-supplied canonical-looking name, not a guessed name. metric may contain a requested stat label such as OPS, WAR, ERA, or payroll, but it is only routing context. Allowed tabs: overview, players, prospects, draft, league, intelligence, amd, knowledge, notes, feed, follows, settings.',
        },
        { role: 'user', content: JSON.stringify({ query }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'skip_natural_search_route',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              intent: { type: 'string', enum: ['player', 'team', 'page', 'unknown'] },
              tab: { type: ['string', 'null'], enum: ['overview', 'players', 'prospects', 'draft', 'league', 'intelligence', 'amd', 'knowledge', 'notes', 'feed', 'follows', 'settings', null] },
              entity: { type: ['string', 'null'] },
              metric: { type: ['string', 'null'] },
              interpretation: { type: 'string' },
            },
            required: ['intent', 'tab', 'entity', 'metric', 'interpretation'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : null;
    const data = normalizeResult({ ...parsed, generated: true }, query);
    searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
    res.setHeader('X-Search-Cache', 'MISS');
    res.json(data);
  } catch (error) {
    console.warn('[natural-search] AI router unavailable; returning safe fallback', error?.message || error);
    const data = fallbackResult(query);
    res.setHeader('X-Search-Status', 'unavailable');
    res.json(data);
  }
}
