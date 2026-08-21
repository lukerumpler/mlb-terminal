import React, { useEffect, useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel, SkeletonRows } from './atoms.jsx';
import { fetchFeed } from '../api/feed.js';

function readableDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

export default function PlayerNewsPanel({ player, accent = C.amber }) {
  const [feed, setFeed] = useState(null);
  const name = player?.fullName || player?.name || 'Selected player';
  useEffect(() => {
    let alive = true;
    setFeed(null);
    if (!name || name === 'Selected player') return () => { alive = false; };
    fetchFeed(name, 6).then(result => { if (alive) setFeed(result); }).catch(error => { if (alive) setFeed({ status:'unavailable', items:[], error:error?.message || 'Player news request failed' }); });
    return () => { alive = false; };
  }, [name]);
  const items = useMemo(() => Array.isArray(feed?.items) ? feed.items.slice(0, 6) : [], [feed]);
  return <Panel title={`${name} Highlights & News`} accent={accent} badge={feed?.status === 'cached-fallback' ? 'Cached' : feed ? feed.status === 'unavailable' ? 'Unavailable' : 'Sourced' : 'Loading'}>
    <div style={{ padding:'8px 14px 4px', ...sans({ fontSize:10, color:C.text3, lineHeight:1.4 }) }}>Recent sourced coverage provides context around performance. Headlines are never generated or substituted when the feed is unavailable.</div>
    {!feed ? <div role="status" aria-live="polite" style={{ padding:'9px 14px' }}><SkeletonRows count={3} height={28} /></div> : items.length ? <div style={{ display:'grid', gap:0 }}>{items.map(item => <a key={item.id || item.url} href={item.url} target="_blank" rel="noreferrer" style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'9px 14px', borderTop:`0.5px solid ${C.borderLight}`, color:C.text, textDecoration:'none' }}><div style={{ minWidth:0 }}><div style={px({ fontSize:8.5, color:C.text4 })}>{item.sourceLabel || 'Source unavailable'} · {readableDate(item.isoDate)}</div><strong style={sans({ display:'block', marginTop:3, fontSize:11, lineHeight:1.35 })}>{item.title || item.text}</strong></div><span aria-hidden="true" style={px({ color:accent, fontSize:15 })}>↗</span></a>)}</div> : <div role="status" style={sans({ padding:'18px 14px', textAlign:'center', fontSize:10, color:C.text3 })}>{feed.error || 'No verified recent player highlights are available.'}</div>}
    <div style={sans({ padding:'7px 14px 10px', fontSize:8.5, color:C.text4 })}>Source state: {feed?.freshness || 'loading'}{feed?.retrievedAt ? ` · retrieved ${readableDate(feed.retrievedAt)}` : ''}</div>
  </Panel>;
}

export { PlayerNewsPanel };
