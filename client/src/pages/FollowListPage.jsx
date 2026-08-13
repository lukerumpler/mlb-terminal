import React, { useState, useMemo, memo } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { FOLLOW_LIST, FOLLOW_LIST_CATEGORIES } from '../constants/data.js';
import { Panel, StatStrip } from '../components/atoms.jsx';

const CATEGORY_COLOR = {
  'Media & Scouting':     C.amber,
  'Analytics & R&D':      C.teal,
  'Player Development':   C.purple,
  'Team & League Orgs':   C.slate,
  'Players':              C.rust,
  'Front Office & Agents':C.navy,
  'Independent Voices':   C.green,
};

function FollowCard({ person }) {
  const accent = CATEGORY_COLOR[person.category] || C.amber;
  return (
    <a href={`https://x.com/${person.handle}`} target="_blank" rel="noopener noreferrer"
      style={{
        display:'block', padding:'12px 14px', borderRadius:9,
        border:`0.5px solid ${C.border}`, background:C.surface,
        textDecoration:'none', transition:'border-color .15s ease, transform .1s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none'; }}
      onFocus={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:6 }}>
        <div style={{ minWidth:0 }}>
          <div style={sans({ fontSize:13, fontWeight:700, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' })}>
            {person.name}
          </div>
          <div style={px({ fontSize:11, color:accent, marginTop:1 })}>@{person.handle}</div>
        </div>
        <span style={{ flexShrink:0, ...px({ fontSize:9, fontWeight:700, color:'#fff', background:accent,
          padding:'2px 6px', borderRadius:4, whiteSpace:'nowrap' }) }}>
          View on X ↗
        </span>
      </div>
      <div style={sans({ fontSize:11, color:C.text2, lineHeight:1.5 })}>{person.bio}</div>
    </a>
  );
}

function FollowListPage() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return FOLLOW_LIST.filter(p => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) ||
        p.handle.toLowerCase().includes(term) ||
        p.bio.toLowerCase().includes(term);
    });
  }, [q, cat]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category).push(p);
    }
    return map;
  }, [filtered]);

  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <StatStrip items={[
        { val:FOLLOW_LIST.length, lbl:'Accounts', sub:'Curated' },
        { val:FOLLOW_LIST_CATEGORIES.length, lbl:'Categories', sub:'Baseball intel' },
      ]} />

      <Panel title="Follow List" accent={C.amber} badge="Links out to X — nothing scraped or reproduced here">
        <div style={{ padding:'12px 14px 4px', display:'flex', gap:8, flexWrap:'wrap' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search by name, handle, or bio"
            placeholder="Search by name, handle, or bio…"
            style={{
              flex:'1 1 220px', padding:'7px 10px', borderRadius:7, border:`0.5px solid ${C.border}`,
              background:C.surface2, color:C.text, outline:'none', transition:'border-color .15s ease',
              ...sans({ fontSize:12 }),
            }}
            onFocus={e => e.currentTarget.style.borderColor = C.amber}
            onBlur={e => e.currentTarget.style.borderColor = C.border}
          />
        </div>
        <div style={{ padding:'8px 14px 12px', display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={() => setCat('all')} aria-pressed={cat==='all'}
            style={{
              padding:'5px 11px', borderRadius:6, cursor:'pointer',
              border:`1px solid ${cat==='all' ? C.amber : C.border}`,
              background: cat==='all' ? C.amberSoft : 'transparent',
              color: cat==='all' ? C.amberDark : C.text2,
              ...sans({ fontSize:11, fontWeight:600 }),
            }}>All</button>
          {FOLLOW_LIST_CATEGORIES.map(c => {
            const active = cat === c;
            const accent = CATEGORY_COLOR[c] || C.amber;
            return (
              <button key={c} onClick={() => setCat(c)} aria-pressed={active}
                style={{
                  padding:'5px 11px', borderRadius:6, cursor:'pointer',
                  border:`1px solid ${active ? accent : C.border}`,
                  background: active ? `color-mix(in srgb, ${accent} 12%, transparent)` : 'transparent',
                  color: active ? accent : C.text2,
                  ...sans({ fontSize:11, fontWeight:600 }),
                }}>{c}</button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ padding:'20px 14px', textAlign:'center' }}>
            <div style={sans({ fontSize:11, color:C.text3 })}>No accounts match &ldquo;{q}&rdquo;.</div>
          </div>
        )}

        {[...grouped.entries()].map(([category, people]) => (
          <div key={category} style={{ borderTop:`0.5px solid ${C.borderLight}` }}>
            {cat === 'all' && (
              <div style={{ padding:'10px 14px 2px', ...sans({ fontSize:9.5, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }) }}>
                {category}
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:10, padding:'10px 14px' }}>
              {people.map(p => <FollowCard key={p.handle} person={p} />)}
            </div>
          </div>
        ))}

        <div style={{ padding:'10px 14px', borderTop:`0.5px solid ${C.border}` }}>
          <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>
            A directory, not a feed — SKIP doesn't fetch, store, or display any posts from
            these accounts. Each card just links out to their real profile on X.
          </div>
        </div>
      </Panel>
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(FollowListPage);
