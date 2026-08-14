import React, { useEffect, useRef, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import TeamLogo from './TeamLogo.jsx';
import { clearRecentHistory, formatRecentHistoryTime } from '../lib/recentHistory.js';
import { openPlayerProfile, openTeamOverview } from '../lib/navigation.js';

export default function RecentHistoryDropdown({ items = [], onClear }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const clear = () => {
    clearRecentHistory();
    onClear?.();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="skip-history-root" style={{ position:'relative', flexShrink:0 }}>
      <button type="button" className="skip-history-trigger" aria-haspopup="menu" aria-expanded={open} aria-label="Recently viewed players, teams, and affiliates" title="Recently viewed players, teams, and affiliates" onClick={() => setOpen(value => !value)}
        style={{ display:'inline-flex', alignItems:'center', gap:5, minHeight:26, padding:'4px 8px', border:`1px solid ${open ? C.amberMid : C.border}`, borderRadius:999, background:open ? C.amberSoft : C.surface3, color:open ? C.amberDark : C.text2, cursor:'pointer', ...px({ fontSize:9, fontWeight:800, letterSpacing:'.04em' }) }}>
        <span aria-hidden="true" style={{ fontSize:12, lineHeight:1 }}>↺</span>
        <span className="skip-history-label">RECENT</span>
        {items.length > 0 && <span aria-hidden="true" style={{ minWidth:15, padding:'1px 4px', borderRadius:999, background:open ? C.amber : C.border, color:open ? '#fff' : C.text3, ...px({ fontSize:8, fontWeight:800 }) }}>{items.length}</span>}
      </button>

      {open && (
        <div role="menu" aria-label="Recently viewed players, teams, and affiliates" className="skip-history-menu" style={{ position:'absolute', zIndex:30, top:'calc(100% + 8px)', right:0, width:270, maxWidth:'calc(100vw - 24px)', padding:6, border:`1px solid ${C.border}`, borderRadius:10, background:C.surface, boxShadow:`0 16px 32px color-mix(in srgb, ${C.navy} 18%, transparent)` }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 8px 7px', borderBottom:`1px solid ${C.borderLight}` }}>
            <span style={sans({ fontSize:10, fontWeight:800, color:C.text, letterSpacing:'.06em', textTransform:'uppercase' })}>Recent history</span>
            <button type="button" role="menuitem" onClick={clear} disabled={!items.length} style={{ padding:0, border:0, background:'transparent', color:items.length ? C.rust : C.text4, cursor:items.length ? 'pointer' : 'default', ...px({ fontSize:9, fontWeight:800 }) }}>Clear</button>
          </div>
          {items.length ? items.map(item => (
            <button key={`${item.type}-${item.type === 'player' ? item.id : item.type === 'affiliate' ? item.affiliateId : item.abbr}`} type="button" role="menuitem" onClick={() => { setOpen(false); if (item.type === 'player') openPlayerProfile(item.id, item.label); else if (item.type === 'affiliate') window.dispatchEvent(new CustomEvent('skip-select-affiliate', { detail: item })); else openTeamOverview(item.abbr); }}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px', border:0, borderBottom:`1px solid ${C.borderLight}`, background:'transparent', color:C.text, cursor:'pointer', textAlign:'left' }}>
              {item.type === 'team' ? <TeamLogo abbr={item.abbr} size={22} /> : <span aria-hidden="true" style={{ width:22, height:22, display:'grid', placeItems:'center', borderRadius:6, background:item.type === 'affiliate' ? C.amberSoft : C.tealSoft, color:item.type === 'affiliate' ? C.amberDark : C.teal, ...px({ fontSize:11, fontWeight:900 }) }}>{item.type === 'affiliate' ? 'A' : 'P'}</span>}
              <span style={{ flex:1, minWidth:0 }}>
                <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', ...sans({ fontSize:11, fontWeight:750, color:C.text }) }}>{item.label}</span>
                <span style={sans({ display:'block', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:9.5, color:C.text3 })}>{item.secondary || (item.type === 'team' ? 'Team overview' : item.type === 'affiliate' ? 'Minor-league affiliate' : 'Player profile')}</span>
              </span>
              <span style={{ flexShrink:0, ...px({ fontSize:8.5, color:C.text4 }) }}>{formatRecentHistoryTime(item.viewedAt)}</span>
            </button>
          )) : (
            <div style={sans({ padding:'16px 8px', color:C.text3, fontSize:10.5, lineHeight:1.5 })}>Players, teams, and affiliates you open will appear here for quick backtracking.</div>
          )}
        </div>
      )}
    </div>
  );
}
