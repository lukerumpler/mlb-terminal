function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function csvCell(value) {
  const text = value == null || value === '' ? '—' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReconciliationRows({ aggregate = {}, boxscore = {}, isPitcher = false } = {}) {
  const metrics = isPitcher
    ? [
        ['ERA', aggregate.era, boxscore.era, 0.01],
        ['WHIP', aggregate.whip, boxscore.whip, 0.001],
        ['Strikeouts', aggregate.strikeOuts ?? aggregate.strikeouts, boxscore.strikeOuts ?? boxscore.strikeouts, 1],
        ['Walks', aggregate.baseOnBalls ?? aggregate.walks, boxscore.walksAllowed ?? boxscore.walks, 1],
        ['Innings Pitched', aggregate.inningsPitched ?? aggregate.ip, boxscore.inningsPitched ?? boxscore.ip, 0.1],
      ]
    : [
        ['AVG', aggregate.avg, boxscore.avg, 0.001],
        ['OBP', aggregate.obp, boxscore.obp, 0.001],
        ['SLG', aggregate.slg, boxscore.slg, 0.001],
        ['OPS', aggregate.ops, boxscore.ops, 0.001],
        ['Home Runs', aggregate.homeRuns ?? aggregate.homeRuns, boxscore.homeRuns, 1],
        ['Plate Appearances', aggregate.plateAppearances ?? aggregate.pa, boxscore.plateAppearances ?? boxscore.pa, 1],
      ];
  return metrics.map(([metric, aggregateValue, boxscoreValue, tolerance]) => {
    const aggregateNumber = finite(aggregateValue);
    const boxscoreNumber = finite(boxscoreValue);
    const variance = aggregateNumber != null && boxscoreNumber != null ? boxscoreNumber - aggregateNumber : null;
    const absVariance = variance == null ? null : Math.abs(variance);
    const status = aggregateNumber == null || boxscoreNumber == null
      ? 'incomplete'
      : absVariance <= tolerance
        ? 'match'
        : 'variance';
    return { metric, aggregate: aggregateNumber, boxscore: boxscoreNumber, variance, tolerance, status };
  });
}

export function buildDataQualityPayload({ player, rows = [], context = 'Player Profile' } = {}) {
  const boxscore = player?.boxscoreSplits;
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    context,
    player: {
      id: player?.id ?? null,
      name: player?.fullName || player?.name || 'Player unavailable',
      position: player?.profile?.primaryPosition?.abbreviation || null,
      season: player?.statSeason || null,
    },
    sources: {
      aggregate: { source: player?.aggregateSource || 'MLB Stats API season stats', retrievedAt: player?.aggregateRetrievedAt || null },
      boxscore: { source: boxscore?.source || 'MLB Stats API boxscores', retrievedAt: boxscore?.retrievedAt || null, games: boxscore?.games || 0, requestedGames: boxscore?.requestedGames || 0 },
    },
    rows,
  };
}

export function buildDataQualityCsv(payload = {}) {
  const rows = [
    ['record_type', 'player_id', 'player', 'season', 'metric', 'aggregate_value', 'boxscore_value', 'variance', 'status', 'aggregate_source', 'aggregate_retrieved_at', 'boxscore_source', 'boxscore_retrieved_at'],
    ...(payload.rows || []).map(row => [
      'reconciliation', payload.player?.id ?? '—', payload.player?.name || 'Player unavailable', payload.player?.season || '—', row.metric,
      row.aggregate, row.boxscore, row.variance, row.status,
      payload.sources?.aggregate?.source || 'Unavailable', payload.sources?.aggregate?.retrievedAt || 'Unavailable',
      payload.sources?.boxscore?.source || 'Unavailable', payload.sources?.boxscore?.retrievedAt || 'Unavailable',
    ]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function downloadDataQualityExport(payload, format = 'json', filenameBase = 'skip-data-quality') {
  const body = format === 'csv' ? buildDataQualityCsv(payload) : JSON.stringify(payload, null, 2);
  const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const extension = format === 'csv' ? 'csv' : 'json';
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenameBase}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildTeamDataQualityPayload({ team, liveTeamData, teamModelData, teamSavantData, liveTeamDataUpdatedAt, teamPlayersUpdatedAt, teamBattedBallData } = {}) {
  const metrics = team || {};
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    context: 'Team Overview data-quality export',
    team: { id: metrics.id ?? null, abbreviation: metrics.abbr || null, name: metrics.name || 'Team unavailable', season: metrics.season || null },
    metrics: {
      record: metrics.record || null,
      ops: metrics.ops ?? null,
      avg: metrics.avg ?? null,
      homeRuns: metrics.hr ?? metrics.homeRuns ?? null,
      era: metrics.era ?? null,
      whip: metrics.whip ?? null,
      strikeouts: metrics.k ?? metrics.strikeouts ?? null,
      stolenBases: metrics.sb ?? metrics.stolenBases ?? null,
      teamWar: teamModelData?.teamWar ?? null,
      playoffOdds: teamModelData?.playoffOdds ?? null,
      savantExitVelocity: teamSavantData?.exitVelocity ?? null,
      battedBallRows: Array.isArray(teamBattedBallData?.rows) ? teamBattedBallData.rows : (Array.isArray(teamBattedBallData) ? teamBattedBallData : []),
    },
    sources: {
      mlb: { source: 'MLB Stats API team stats', retrievedAt: liveTeamDataUpdatedAt || null },
      teamModels: { source: teamModelData?.source || 'FanGraphs / SKIP derived fallback', retrievedAt: teamModelData?.retrievedAt || null, freshness: teamModelData?.freshness || null },
      savant: { source: teamSavantData?.source || 'Baseball Savant', retrievedAt: teamSavantData?.retrievedAt || null },
      roster: { source: 'MLB Stats API team roster leaders', retrievedAt: teamPlayersUpdatedAt || null },
    },
  };
}

export function buildTeamDataQualityCsv(payload = {}) {
  const rows = [['record_type', 'team_id', 'team', 'abbreviation', 'season', 'metric', 'value', 'source', 'retrieved_at', 'freshness']];
  const metrics = payload.metrics || {};
  const sourceMap = {
    record: payload.sources?.mlb,
    ops: payload.sources?.mlb, avg: payload.sources?.mlb, homeRuns: payload.sources?.mlb, era: payload.sources?.mlb, whip: payload.sources?.mlb, strikeouts: payload.sources?.mlb, stolenBases: payload.sources?.mlb,
    teamWar: payload.sources?.teamModels, playoffOdds: payload.sources?.teamModels, savantExitVelocity: payload.sources?.savant,
  };
  Object.entries(metrics).forEach(([metric, value]) => {
    if (metric === 'battedBallRows') return;
    const source = sourceMap[metric] || { source: 'Unavailable' };
    rows.push(['team_metric', payload.team?.id ?? '—', payload.team?.name || 'Team unavailable', payload.team?.abbreviation || '—', payload.team?.season || '—', metric, value, source.source || 'Unavailable', source.retrievedAt || 'Unavailable', source.freshness || '—']);
  });
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function downloadTeamDataQualityExport(payload, format = 'json', filenameBase = 'skip-team-data-quality') {
  const body = format === 'csv' ? buildTeamDataQualityCsv(payload) : JSON.stringify(payload, null, 2);
  const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const extension = format === 'csv' ? 'csv' : 'json';
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenameBase}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
