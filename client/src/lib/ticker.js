const LIVE_STATUS_CODES = new Set(['I', 'M']);
const FINAL_STATUS_CODES = new Set(['F', 'O']);

function normalizedStatus(game) {
  return String(game?.status || '').trim();
}

export function isLiveMlbGame(game) {
  const code = String(game?.statusCode || '').trim().toUpperCase();
  const status = normalizedStatus(game).toLowerCase();
  return LIVE_STATUS_CODES.has(code) || /in progress|manager challenge|delayed/.test(status);
}

export function isFinalMlbGame(game) {
  const code = String(game?.statusCode || '').trim().toUpperCase();
  const status = normalizedStatus(game).toLowerCase();
  return FINAL_STATUS_CODES.has(code) || /^(final|game over|completed early)$/.test(status);
}

export function deriveTickerStatus(games) {
  if (!Array.isArray(games) || games.length === 0) return 'empty';
  if (games.some(isLiveMlbGame)) return 'live';
  if (games.every(isFinalMlbGame)) return 'final';
  return 'scheduled';
}

function hasRecordedScore(game) {
  return Number.isFinite(Number(game?.away?.runs)) && Number.isFinite(Number(game?.home?.runs));
}

function gameTime(game, { locale, timeZone } = {}) {
  if (!game?.time) return null;
  const date = new Date(game.time);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(date);
  } catch {
    return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }
}

export function formatTickerGame(game, options = {}) {
  const away = game?.away?.abbr || game?.away?.name || 'Away';
  const home = game?.home?.abbr || game?.home?.name || 'Home';

  if (isLiveMlbGame(game)) {
    const score = hasRecordedScore(game) ? `${away} ${game.away.runs} — ${home} ${game.home.runs}` : `${away} @ ${home}`;
    const inning = game?.inning ? `${game.inningHalf === 'top' ? '▲' : game.inningHalf === 'bottom' ? '▼' : ''}${game.inning}` : 'Live';
    return `${score} · ${inning}`;
  }

  if (isFinalMlbGame(game)) {
    const score = hasRecordedScore(game) ? `${away} ${game.away.runs} — ${home} ${game.home.runs}` : `${away} @ ${home}`;
    return `${score} · Final`;
  }

  const status = normalizedStatus(game);
  const time = gameTime(game, options);
  const detail = /^(scheduled|pre-game|preview)$/i.test(status) ? time : status || time || 'Scheduled';
  return `${away} @ ${home} · ${detail}`;
}

export function tickerSourceLabel(source) {
  return source === 'MLB Stats API' ? 'MLB' : source || 'SOURCE';
}
