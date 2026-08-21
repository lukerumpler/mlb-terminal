import React from 'react';
import { C, px } from '../constants/colors.js';

function isLiveGame(game) {
  return game?.statusCode === 'I'
    || game?.abstractState === 'Live'
    || /in progress|manager challenge/i.test(game?.status || '');
}

function tickerTeam(team, fallback) {
  return team?.abbr || team?.name || fallback;
}

function scheduledTime(game) {
  if (!game?.time) return null;
  const date = new Date(game.time);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}

export function formatLiveScoreTick(game) {
  const away = tickerTeam(game?.away, 'AWAY');
  const home = tickerTeam(game?.home, 'HOME');
  const hasScore = Number.isFinite(game?.away?.runs) && Number.isFinite(game?.home?.runs);
  const matchup = hasScore
    ? `${away} ${game.away.runs}, ${home} ${game.home.runs}`
    : `${away} @ ${home}`;
  const status = String(game?.status || '');

  if (game?.statusCode === 'F' || /^final/i.test(status)) return `${matchup} · Final`;
  if (/delayed|postponed|suspended|cancelled/i.test(status)) return `${matchup} · ${status || 'Delayed'}`;
  if (isLiveGame(game) && game?.inning) {
    const half = game.inningHalf === 'top' ? '▲' : game.inningHalf === 'bottom' ? '▼' : '';
    return `${matchup} · ${half}${game.inning}`;
  }
  return `${matchup} · ${scheduledTime(game) || status || 'Scheduled'}`;
}

export function getTickerPresentation(games) {
  if (!Array.isArray(games) || games.length === 0) return { status:'empty', ticks:[] };
  return {
    status: games.some(isLiveGame) ? 'live' : 'scores',
    ticks: games.map(formatLiveScoreTick),
  };
}

export default function LiveScoreTicker({ status = 'loading', ticks = [], onRetry }) {
  const hasScores = ['live', 'scores', 'refreshing', 'stale'].includes(status) && ticks.length > 0;
  const label = status === 'live' ? 'LIVE' : status === 'scores' ? 'SCORES' : status === 'refreshing' ? 'UPDATING' : status === 'stale' ? 'STALE' : status === 'error' ? 'OFFLINE' : status === 'empty' ? 'NO GAMES' : 'CONNECTING';
  const shouldAnimate = hasScores && status !== 'stale';
  const animationSeconds = Math.max(34, Math.min(90, ticks.length * 9));
  return (
    <div className="skip-ticker-shell" style={{ height:32, flexShrink:0, background:C.navy, borderTop:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', overflow:'hidden' }}>
      <div style={{ flexShrink:0, padding:'0 14px', height:'100%', display:'flex', alignItems:'center', borderRight:'1px solid rgba(255,255,255,.12)', gap:6 }}>
        <div className="skip-ticker-indicator" data-live={status === 'live'} style={{ width:6, height:6, borderRadius:'50%', background:status === 'live' ? C.teal : 'rgba(255,255,255,.3)' }} />
        <span style={px({ fontSize:10, color:status === 'live' ? C.teal : 'rgba(255,255,255,.45)', letterSpacing:'.12em', fontWeight:500 })}>{label}</span>
      </div>
      <div className="skip-ticker-viewport" aria-label="Major League Baseball game scores">
        {hasScores ? (
          <>
            <div className="skip-ticker-track" data-animate={shouldAnimate} style={{ '--skip-ticker-duration': `${animationSeconds}s`, ...px({ fontSize:11, color:'rgba(255,255,255,.72)' }) }}>
              {[0, 1].map(copy => (
                <div className="skip-ticker-segment" aria-hidden="true" key={copy}>
                  {ticks.map((score, index) => <span className="skip-ticker-item" key={`${copy}-${score}-${index}`}>{score}</span>)}
                  {status === 'stale' && <span className="skip-ticker-item skip-ticker-stale-note">Scores may be out of date · refresh when available</span>}
                </div>
              ))}
            </div>
            <span className="skip-ticker-sr" role="status" aria-live="polite">{ticks.join(' · ')}</span>
          </>
        ) : (
          <div className="skip-ticker-message" style={{ padding:'0 20px', ...px({ fontSize:11, color:'rgba(255,255,255,.45)' }) }}>
            {status === 'loading' && <span role="status" className="skip-ticker-skeleton" aria-label="Loading live scores"><i /><i /><i /></span>}
            {status === 'empty' && 'No games scheduled today.'}
            {status === 'error' && <span>Live scores unavailable. <button type="button" onClick={onRetry} style={{ marginLeft:8, padding:'3px 8px', border:'1px solid rgba(255,255,255,.32)', borderRadius:4, background:'transparent', color:'rgba(255,255,255,.78)', cursor:'pointer', ...px({ fontSize:9, fontWeight:800 }) }}>RETRY</button></span>}
          </div>
        )}
      </div>
    </div>
  );
}
