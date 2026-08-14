import React from 'react';
import { C, px } from '../constants/colors.js';

export default function LiveScoreTicker({ status = 'loading', ticks = [], onRetry }) {
  const hasScores = status === 'live' || status === 'refreshing' || status === 'stale';
  const label = status === 'live' ? 'LIVE' : status === 'refreshing' ? 'UPDATING' : status === 'stale' ? 'STALE' : status === 'error' ? 'OFFLINE' : status === 'empty' ? 'NO GAMES' : 'CONNECTING';
  return (
    <div style={{ height:32, flexShrink:0, background:C.navy, borderTop:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', overflow:'hidden' }}>
      <div style={{ flexShrink:0, padding:'0 14px', height:'100%', display:'flex', alignItems:'center', borderRight:'1px solid rgba(255,255,255,.12)', gap:6 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:status === 'live' ? C.teal : 'rgba(255,255,255,.3)', animation:status === 'live' ? 'pulse 1.6s ease-in-out infinite' : 'none' }} />
        <span style={px({ fontSize:10, color:status === 'live' ? C.teal : 'rgba(255,255,255,.45)', letterSpacing:'.12em', fontWeight:500 })}>{label}</span>
      </div>
      <div style={{ overflow:'hidden', flex:1 }}>
        {hasScores ? (
          <div style={{ display:'flex', alignItems:'center', whiteSpace:'nowrap', animation:status === 'live' ? 'scrollx 50s linear infinite' : 'none', ...px({ fontSize:11, color:'rgba(255,255,255,.72)' }) }}>
            {[...ticks, ...ticks].map((score, index) => <span key={`${score}-${index}`} style={{ padding:'0 20px', borderRight:'1px solid rgba(255,255,255,.1)' }}>{score}</span>)}
            {status === 'stale' && <span style={{ padding:'0 20px', color:'rgba(255,255,255,.55)' }}>Scores may be out of date · refresh when available</span>}
          </div>
        ) : (
          <div className="skip-ticker-message" style={{ padding:'0 20px', ...px({ fontSize:11, color:'rgba(255,255,255,.45)' }) }}>
            {status === 'loading' && <span role="status" className="skip-ticker-skeleton" aria-label="Loading live scores"><i /><i /><i /></span>}
            {status === 'empty' && 'No games in progress right now.'}
            {status === 'error' && <span>Live scores unavailable. <button type="button" onClick={onRetry} style={{ marginLeft:8, padding:'3px 8px', border:'1px solid rgba(255,255,255,.32)', borderRadius:4, background:'transparent', color:'rgba(255,255,255,.78)', cursor:'pointer', ...px({ fontSize:9, fontWeight:800 }) }}>RETRY</button></span>}
          </div>
        )}
      </div>
    </div>
  );
}
