import React, { useState, useEffect, useMemo, useRef } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { PROSPECT_BATTERS, PROSPECT_PITCHERS } from '../constants/data.js';

const TAB_ENTRIES = [
  { type:'tab', key:'overview',     label:'Overview' },
  { type:'tab', key:'players',      label:'Players' },
  { type:'tab', key:'prospects',    label:'Prospects' },
  { type:'tab', key:'draft',        label:'Draft' },
  { type:'tab', key:'league',       label:'League' },
  { type:'tab', key:'intelligence', label:'Intelligence' },
  { type:'tab', key:'amd',          label:'AMD / IMD' },
  { type:'tab', key:'knowledge',    label:'Knowledge' },
  { type:'tab', key:'notes',        label:'Scouting Notes' },
  { type:'tab', key:'feed',         label:'Intel Feed' },
  { type:'tab', key:'follows',      label:'Follow List' },
  { type:'tab', key:'settings',     label:'Settings' },
];

// This only searches static, already-in-memory data (tabs + the tracked
// prospect pool) — it deliberately doesn't search live MLB players, since
// that requires a network round-trip per keystroke and the Players tab's
// own search already does that well.
const PROSPECT_ENTRIES = [
  ...PROSPECT_BATTERS.map(p => ({ type:'prospect', mlbId:p.mlbId, label:p.name, sub:`${p.team} · ${p.pos} · Batter` })),
  ...PROSPECT_PITCHERS.map(p => ({ type:'prospect', mlbId:p.mlbId, label:p.name, sub:`${p.team} · ${p.pos} · Pitcher` })),
];

export default function CommandPalette({ onNavigate, onOpenProspect, onClose }) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    inputRef.current?.focus();
    return () => { previouslyFocused?.focus?.(); };
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return TAB_ENTRIES;
    const tabs = TAB_ENTRIES.filter(t => t.label.toLowerCase().includes(term));
    const prospects = PROSPECT_ENTRIES.filter(p => p.label.toLowerCase().includes(term)).slice(0, 8);
    return [...tabs, ...prospects];
  }, [q]);

  useEffect(() => { setActiveIdx(0); }, [q]);

  // Keep the active option scrolled into view as arrow keys move past what's
  // currently visible in the (fixed max-height, scrollable) results list.
  useEffect(() => {
    listRef.current?.children[activeIdx]?.scrollIntoView({ block:'nearest' });
  }, [activeIdx]);

  const select = (entry) => {
    if (!entry) return;
    if (entry.type === 'tab') onNavigate(entry.key);
    else onOpenProspect(entry.mlbId);
    onClose();
  };

  const optionId = (r, i) => `cmdk-option-${i}-${r.type === 'tab' ? r.key : r.mlbId}`;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); select(results[activeIdx]); }
  };

  return (
    <div onClick={onClose} role="presentation" style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300,
      display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'12vh 16px',
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette" style={{
        width:'min(520px, 100%)', background:C.surface, borderRadius:12,
        border:`0.5px solid ${C.border}`, boxShadow:'0 24px 60px rgba(0,0,0,.4)', overflow:'hidden',
      }}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to a page or search prospects…"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-listbox"
          aria-activedescendant={results[activeIdx] ? optionId(results[activeIdx], activeIdx) : undefined}
          aria-autocomplete="list"
          aria-label="Jump to a page or search prospects"
          autoComplete="off"
          onFocus={e => e.currentTarget.style.borderBottomColor = C.amber}
          onBlur={e => e.currentTarget.style.borderBottomColor = C.border}
          style={{
            width:'100%', padding:'14px 16px', border:'none', borderBottom:`0.5px solid ${C.border}`,
            background:'transparent', color:C.text, outline:'none', ...sans({ fontSize:14 }),
          }}
        />
        <div ref={listRef} id="cmdk-listbox" role="listbox" aria-label="Results" style={{ maxHeight:360, overflowY:'auto' }}>
          {results.length === 0 && (
            <div role="status" style={{ padding:'16px', ...sans({ fontSize:12, color:C.text3 }) }}>No matches for &ldquo;{q}&rdquo;.</div>
          )}
          {results.map((r, i) => (
            <div key={`${r.type}-${r.type === 'tab' ? r.key : r.mlbId}`}
              id={optionId(r, i)}
              role="option"
              aria-selected={i === activeIdx}
              onClick={() => select(r)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding:'10px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center',
                background: i === activeIdx ? C.amberSoft : 'transparent',
              }}>
              <div>
                <span style={sans({ fontSize:12.5, fontWeight:600, color:C.text })}>{r.label}</span>
                {r.sub && <span style={{ ...px({ fontSize:10.5, color:C.text3 }), marginLeft:8 }}>{r.sub}</span>}
              </div>
              <span style={px({ fontSize:9.5, color:C.text4, textTransform:'uppercase' })}>
                {r.type === 'tab' ? 'Page' : 'Prospect'}
              </span>
            </div>
          ))}
        </div>
        <div style={{ padding:'8px 16px', borderTop:`0.5px solid ${C.border}`, display:'flex', gap:14 }}>
          <span style={px({ fontSize:9.5, color:C.text4 })}>↑↓ navigate</span>
          <span style={px({ fontSize:9.5, color:C.text4 })}>↵ select</span>
          <span style={px({ fontSize:9.5, color:C.text4 })}>esc close</span>
        </div>
      </div>
    </div>
  );
}
