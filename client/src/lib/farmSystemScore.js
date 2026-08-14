const SCORE_WEIGHTS = Object.freeze({
  depth: 0.4,
  averageRank: 0.4,
  bestRank: 0.2,
});

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function rankQuality(rank, poolSize) {
  if (!Number.isFinite(rank) || !Number.isFinite(poolSize) || poolSize <= 1) return null;
  return clamp(100 - ((rank - 1) / (poolSize - 1)) * 100);
}

export function scoreFarmSystem(row, context = {}) {
  const maxCount = Number(context.maxCount);
  const poolSize = Number(context.poolSize);
  const depth = Number.isFinite(row?.count) && maxCount > 0
    ? clamp((row.count / maxCount) * 100)
    : null;
  const averageRank = rankQuality(Number(row?.avgRank), poolSize);
  const bestRank = rankQuality(Number(row?.bestRank), poolSize);
  const components = [depth, averageRank, bestRank].filter(value => value != null);
  if (components.length < 2) {
    return { score: null, depth, averageRank, bestRank, availableComponents: components.length };
  }

  const weights = [
    ['depth', depth, SCORE_WEIGHTS.depth],
    ['averageRank', averageRank, SCORE_WEIGHTS.averageRank],
    ['bestRank', bestRank, SCORE_WEIGHTS.bestRank],
  ].filter(([, value]) => value != null);
  const totalWeight = weights.reduce((sum, [, , weight]) => sum + weight, 0);
  const score = Math.round(weights.reduce((sum, [, value, weight]) => sum + value * weight, 0) / totalWeight);
  return { score, depth, averageRank, bestRank, availableComponents: components.length };
}

export function buildFarmSystemSummary(data) {
  const rankings = Array.isArray(data?.rankings) ? data.rankings : [];
  const trackedCount = Number(data?.trackedCount) || 0;
  const poolSize = Number(data?.poolSize) || 0;
  const maxCount = rankings.reduce((max, row) => Math.max(max, Number(row?.count) || 0), 0);
  const scoredRows = rankings.map(row => ({
    ...row,
    metrics: scoreFarmSystem(row, { maxCount, poolSize }),
  }));
  const ordered = [...scoredRows].sort((a, b) => {
    if (a.metrics.score == null && b.metrics.score == null) return a.avgRank - b.avgRank;
    if (a.metrics.score == null) return 1;
    if (b.metrics.score == null) return -1;
    return b.metrics.score - a.metrics.score || a.avgRank - b.avgRank;
  });
  const leader = ordered[0] || null;
  const score = leader?.metrics.score ?? null;
  return {
    rows: ordered,
    leader,
    score,
    trackedCount,
    poolSize,
    representedOrgs: ordered.length,
    scoreBand: score == null ? 'Unavailable' : score >= 80 ? 'Elite pipeline' : score >= 65 ? 'Strong pipeline' : score >= 50 ? 'Balanced pipeline' : 'Developing pipeline',
  };
}

export { SCORE_WEIGHTS };
