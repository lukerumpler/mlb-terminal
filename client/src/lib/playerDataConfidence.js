const finiteAge = value => {
  if (value === null || value === undefined || value === '') return null;
  const age = Number(value);
  return Number.isFinite(age) && age >= 0 ? age : null;
};

/**
 * Confidence is a transparent completeness indicator, not a probability that a
 * projection will be correct. It only scores evidence actually supplied by
 * the current player payload. Unknown freshness is kept visible as unknown.
 */
export function getPlayerDataConfidence({
  identity,
  seasonStats,
  savant,
  contract,
  teamFinancials,
  isFallback = false,
  dataMode = 'unknown',
  freshnessAgeMs = null,
} = {}) {
  const factors = [
    { key:'identity', label:'Identity', source:'MLB Stats API', points:20, ready:Boolean(identity) },
    { key:'seasonStats', label:'Season stats', source:'MLB Stats API', points:30, ready:Boolean(seasonStats) },
    { key:'savant', label:'Statcast profile', source:'Baseball Savant', points:25, ready:Boolean(savant) },
    { key:'contract', label:'Contract data', source:'Spotrac / MLB', points:10, ready:Boolean(contract) },
    { key:'teamFinancials', label:'Team financials', source:'Spotrac', points:15, ready:Boolean(teamFinancials) },
  ];
  const knownPoints = factors.reduce((sum, factor) => sum + (factor.ready ? factor.points : 0), 0);
  const freshness = finiteAge(freshnessAgeMs);
  const freshnessPenalty = freshness == null ? 0 : freshness > 7 * 86_400_000 ? 12 : freshness > 3 * 86_400_000 ? 6 : 0;
  const fallbackPenalty = isFallback ? 12 : 0;
  const cachePenalty = dataMode === 'cached' && freshness == null ? 4 : 0;
  const score = Math.max(0, Math.min(100, knownPoints - freshnessPenalty - fallbackPenalty - cachePenalty));
  const readyCount = factors.filter(factor => factor.ready).length;
  const label = score >= 85 ? 'High' : score >= 65 ? 'Moderate' : score > 0 ? 'Limited' : 'Unavailable';
  const tone = score >= 85 ? 'teal' : score >= 65 ? 'amber' : score > 0 ? 'rust' : 'slate';
  const freshnessLabel = freshness == null
    ? 'Player-level freshness not provided by the current payload'
    : freshness < 60_000
      ? 'Updated just now'
      : freshness < 3_600_000
        ? `Updated ${Math.max(1, Math.floor(freshness / 60_000))}m ago`
        : freshness < 86_400_000
          ? `Updated ${Math.max(1, Math.floor(freshness / 3_600_000))}h ago`
          : `Updated ${Math.max(1, Math.floor(freshness / 86_400_000))}d ago`;
  const modeLabel = dataMode === 'cached' ? 'Cached response' : dataMode === 'live' ? 'Live response' : 'Response mode not provided';
  const reasons = [
    `${readyCount} of ${factors.length} source groups are present`,
    isFallback ? `Season stats use ${seasonStats?.season || 'a prior'} fallback season` : 'Current-season stats are not marked as fallback',
    modeLabel,
    freshnessLabel,
  ];
  return {
    score,
    label,
    tone,
    factors,
    readyCount,
    totalFactors:factors.length,
    reasons,
    freshnessLabel,
    modeLabel,
    isFallback:Boolean(isFallback),
  };
}

export function getPlayerConfidenceColorKey(confidence) {
  return confidence?.tone || 'slate';
}
