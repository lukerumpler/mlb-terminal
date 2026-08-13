import { invokeLLM } from '../_core/llm.ts';

const MAX_AXES = 8;
const MAX_NAME = 80;

function finitePercentile(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, 180) : fallback;
}

function normalizePlayer(player) {
  if (!player || typeof player !== 'object') return null;
  const name = cleanText(player.name).slice(0, MAX_NAME);
  const axes = Array.isArray(player.axes)
    ? player.axes.slice(0, MAX_AXES).map(axis => ({
        axis: cleanText(axis?.axis, 'Metric').slice(0, 40),
        pct: finitePercentile(axis?.pct),
        rawLabel: cleanText(axis?.rawLabel, 'Unavailable').slice(0, 60),
      })).filter(axis => axis.axis)
    : [];
  if (!name || !axes.length) return null;
  return {
    name,
    position: cleanText(player.position, '—').slice(0, 30),
    playerType: player.playerType === 'pitcher' ? 'pitcher' : 'hitter',
    axes,
  };
}

function buildEdges(players) {
  const [first, second] = players;
  const firstByAxis = new Map(first.axes.map(axis => [axis.axis, axis]));
  const secondByAxis = new Map(second.axes.map(axis => [axis.axis, axis]));
  return Array.from(new Set([...firstByAxis.keys(), ...secondByAxis.keys()]))
    .map(axis => {
      const a = firstByAxis.get(axis);
      const b = secondByAxis.get(axis);
      if (a?.pct == null || b?.pct == null) return { axis, leader: 'Unavailable', margin: null };
      const margin = Math.round(Math.abs(a.pct - b.pct));
      return {
        axis,
        leader: margin === 0 ? 'Even' : a.pct > b.pct ? first.name : second.name,
        margin,
      };
    })
    .sort((a, b) => (b.margin ?? -1) - (a.margin ?? -1));
}

function fallbackSummary(players) {
  const edges = buildEdges(players);
  const [first, second] = players;
  const usable = edges.filter(edge => edge.margin != null);
  const leader = usable[0]?.leader;
  const headline = leader && leader !== 'Even' && leader !== 'Unavailable'
    ? `${leader} owns the clearest percentile edge`
    : 'The percentile profiles are closely matched';
  const summary = usable.length
    ? usable.slice(0, 3).map(edge => `${edge.axis}: ${edge.leader} by ${edge.margin} percentile points`).join(' · ')
    : 'The connected Savant profile does not contain enough shared percentile values for a directional comparison.';
  return {
    headline,
    summary: `${first.name} vs ${second.name}: ${summary}.`,
    edges: usable.slice(0, 4),
    caveat: 'This comparison uses only the connected 0–100 Savant percentile axes; missing fields are not inferred.',
    generated: false,
  };
}

function validRequest(body) {
  const players = Array.isArray(body?.players) ? body.players.slice(0, 2).map(normalizePlayer) : [];
  return players.length === 2 && players.every(Boolean) && players[0].playerType === players[1].playerType ? players : null;
}

export function hasValidComparisonPayload(body) {
  return Boolean(validRequest(body));
}

export default async function comparisonSummary(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const players = validRequest(req.body);
  if (!players) {
    res.status(400).json({ error: 'Provide two same-type players with Savant percentile axes.' });
    return;
  }

  const fallback = fallbackSummary(players);
  try {
    const response = await invokeLLM({
      model: 'gpt-5-mini',
      reasoning: { effort: 'minimal' },
      maxTokens: 500,
      messages: [
        {
          role: 'system',
          content: 'You are SKIP, a precise baseball intelligence analyst. Summarize only the supplied Savant percentile values. Never invent a statistic, season, scouting trait, injury, projection, or causal explanation. Treat 0–100 as percentile rank, where higher is better. If a value is unavailable, say unavailable. Keep the response concise and decision-useful.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction: 'Compare the two same-type players. Identify the largest percentile edges, state when the profiles are close, and include a short caveat about the data scope.',
            players,
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'skip_player_comparison_summary',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              summary: { type: 'string' },
              edges: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    axis: { type: 'string' },
                    leader: { type: 'string' },
                    margin: { type: ['number', 'null'] },
                    note: { type: 'string' },
                  },
                  required: ['axis', 'leader', 'margin', 'note'],
                  additionalProperties: false,
                },
              },
              caveat: { type: 'string' },
            },
            required: ['headline', 'summary', 'edges', 'caveat'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : null;
    if (!parsed || typeof parsed.headline !== 'string' || typeof parsed.summary !== 'string') throw new Error('Invalid summary response');
    res.json({
      headline: parsed.headline.slice(0, 180),
      summary: parsed.summary.slice(0, 500),
      edges: Array.isArray(parsed.edges) ? parsed.edges.slice(0, 4) : fallback.edges,
      caveat: typeof parsed.caveat === 'string' ? parsed.caveat.slice(0, 240) : fallback.caveat,
      generated: true,
    });
  } catch (error) {
    console.warn('[comparison-summary] AI summary unavailable; returning deterministic percentile summary', error?.message || error);
    res.json({ ...fallback, generated: false, unavailableReason: 'AI summary unavailable' });
  }
}
