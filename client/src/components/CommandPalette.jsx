import React, { useState, useEffect, useMemo, useRef } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { PROSPECT_BATTERS, PROSPECT_PITCHERS, TEAMS } from '../constants/data.js';
import { searchPlayers } from '../api/mlb.js';
import { routeNaturalLanguageSearch } from '../api/naturalSearch.js';
import { openPlayerProfile, openTeamOverview, openTab } from '../lib/navigation.js';

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

const PROSPECT_ENTRIES = [
  ...PROSPECT_BATTERS.map(p => ({ type:'prospect', mlbId:p.mlbId, label:p.name, sub:`${p.team} · ${p.pos} · Batter` })),
  ...PROSPECT_PITCHERS.map(p => ({ type:'prospect', mlbId:p.mlbId, label:p.name, sub:`${p.team} · ${p.pos} · Pitcher` })),
];

function normalizeTeamMatch(entity) {
  const term = String(entity || '').trim().toLowerCase();
  if (!term) return null;
  return Object.values(TEAMS).find(team => [team.name, team.abbr, team.city, team.nickname].filter(Boolean).some(value => String(value).toLowerCase() === term))
    || Object.values(TEAMS).find(team => String(team.name).toLowerCase().includes(term) || String(team.abbr).toLowerCase() === term);
}

export default function CommandPalette({ onNavigate, onOpenProspect, onClose }) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [aiState, setAiState] = useState('idle');
  const [aiResult, setAiResult] = useState(null);
  const [aiMessage, setAiMessage] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const requestSeq = useRef(0);

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

  useEffect(() => {
    setActiveIdx(0);
    setAiState('idle');
    setAiResult(null);
    setAiMessage('');
    requestSeq.current += 1;
  }, [q]);

  useEffect(() => {
    listRef.current?.children[activeIdx]?.scrollIntoView({ block:'nearest' });
  }, [activeIdx]);

  const select = entry => {
    if (!entry) return;
    if (entry.type === 'tab') onNavigate(entry.key);
    else onOpenProspect(entry.mlbId);
    onClose();
  };

  const resolveAiResult = async result => {
    if (!result) return;
    if (result.intent === 'page' && result.tab) {
      onNavigate(result.tab);
      onClose();
      return;
    }
    if (result.intent === 'team') {
      const team = normalizeTeamMatch(result.entity);
      if (!team) {
        setAiState('error');
        setAiMessage(`No verified MLB team match was found for “${result.entity || q}”.`);
        return;
      }
      openTeamOverview(team.abbr);
      onClose();
      return;
    }
    if (result.intent === 'player') {
      try {
        const people = await searchPlayers(result.entity || q, 5);
        const person = people?.[0];
        if (!person?.id) {
          setAiState('error');
          setAiMessage(`No verified player match was found for “${result.entity || q}”.`);
          return;
        }
        openPlayerProfile(person.id, person.fullName || person.name || result.entity);
        onClose();
      } catch {
        setAiState('error');
        setAiMessage('The verified MLB player search could not be reached. Try again or use the Players page.');
      }
      return;
    }
    setAiState('error');
    setAiMessage(result.interpretation || 'No verified destination was identified. Try a player name, team name, or page name.');
  };

  const runAiSearch = async () => {
    const query = q.trim();
    if (query.length < 2 || aiState === 'loading') return;
    const seq = ++requestSeq.current;
    setAiState('loading');
    setAiResult(null);
    setAiMessage('SKIP is interpreting the request without inventing statistics…');
    try {
      const result = await routeNaturalLanguageSearch(query);
      if (seq !== requestSeq.current) return;
      setAiResult(result);
      setAiState('ready');
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setAiState('error');
      setAiMessage(error?.message || 'Natural-language search is unavailable.');
    }
  };

  const optionId = (r, i) => `cmdk-option-${i}-${r.type === 'tab' ? r.key : r.mlbId}`;
  const onKeyDown = e => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, Math.max(results.length - 1, 0))); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) select(results[activeIdx]);
      else runAiSearch();
    }
  };

  return (
    <div onClick={onClose} role="presentation" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'12vh 16px' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette" style={{ width:'min(560px, 100%)', background:C.surface, borderRadius:12, border:`0.5px solid ${C.border}`, boxShadow:'0 24px 60px rgba(0,0,0,.4)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 10px 0 16px', borderBottom:`0.5px solid ${C.border}` }}>
          <span aria-hidden="true" style={{ color:C.amber, fontSize:16 }}>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, prospects, or ask SKIP…"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={results[activeIdx] ? optionId(results[activeIdx], activeIdx) : undefined}
            aria-autocomplete="list"
            aria-label="Search pages, prospects, or ask SKIP"
            autoComplete="off"
            style={{ flex:1, minWidth:0, padding:'14px 0', border:'none', background:'transparent', color:C.text, outline:'none', ...sans({ fontSize:14 }) }}
          />
          <button type="button" onClick={runAiSearch} disabled={q.trim().length < 2 || aiState === 'loading'} style={{ border:`1px solid ${C.amberMid}`, background:C.amberSoft, color:C.amberDark, borderRadius:6, padding:'6px 8px', cursor:q.trim().length < 2 || aiState === 'loading' ? 'not-allowed' : 'pointer', opacity:q.trim().length < 2 || aiState === 'loading' ? .5 : 1, ...px({ fontSize:9, fontWeight:800, letterSpacing:'.04em' }) }}>
            {aiState === 'loading' ? 'ASKING…' : 'ASK SKIP'}
          </button>
        </div>
        <div style={{ padding:'8px 16px', background:C.surface2, borderBottom:`0.5px solid ${C.borderLight}`, ...sans({ fontSize:9.5, color:C.text3 }) }}>
          Ask for a destination such as <strong style={{ color:C.text2 }}>“Juan Soto OPS”</strong> or <strong style={{ color:C.text2 }}>“Dodgers team WAR”</strong>. Results open verified data pages; missing data stays unavailable.
        </div>
        <div ref={listRef} id="cmdk-listbox" role="listbox" aria-label="Results" style={{ maxHeight:300, overflowY:'auto' }}>
          {results.length === 0 && !aiResult && (
            <div role="status" style={{ padding:'16px', ...sans({ fontSize:12, color:C.text3 }) }}>No local matches. Use <strong>ASK SKIP</strong> to interpret this request.</div>
          )}
          {results.map((r, i) => (
            <div key={`${r.type}-${r.type === 'tab' ? r.key : r.mlbId}`} id={optionId(r, i)} role="option" aria-selected={i === activeIdx} onClick={() => select(r)} onMouseEnter={() => setActiveIdx(i)} style={{ padding:'10px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', background:i === activeIdx ? C.amberSoft : 'transparent' }}>
              <div><span style={sans({ fontSize:12.5, fontWeight:600, color:C.text })}>{r.label}</span>{r.sub && <span style={{ ...px({ fontSize:10.5, color:C.text3 }), marginLeft:8 }}>{r.sub}</span>}</div>
              <span style={px({ fontSize:9.5, color:C.text4, textTransform:'uppercase' })}>{r.type === 'tab' ? 'Page' : 'Prospect'}</span>
            </div>
          ))}
          {aiState === 'loading' && <div role="status" aria-label="AI search loading" style={{ padding:'14px 16px', color:C.text3, ...sans({ fontSize:11 }) }}><span style={{ color:C.amber, marginRight:7 }}>●</span>{aiMessage}</div>}
          {aiState === 'ready' && aiResult && (
            <button type="button" onClick={() => resolveAiResult(aiResult)} style={{ width:'100%', border:'none', borderTop:`0.5px solid ${C.borderLight}`, background:C.surface, color:C.text, textAlign:'left', padding:'12px 16px', cursor:'pointer' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'baseline' }}><span style={px({ fontSize:9, color:C.teal, fontWeight:800, letterSpacing:'.06em' })}>AI ROUTE · VERIFIED DESTINATION</span><span style={px({ fontSize:9, color:C.text4 })}>{aiResult.metric || aiResult.tab || 'Review'}</span></div>
              <div style={{ marginTop:4, ...sans({ fontSize:12, fontWeight:700, color:C.text }) }}>{aiResult.entity || aiResult.tab || 'Search interpretation'}</div>
              <div style={{ marginTop:4, ...sans({ fontSize:10, color:C.text3, lineHeight:1.4 }) }}>{aiResult.interpretation}</div>
            </button>
          )}
          {aiState === 'error' && <div role="alert" style={{ padding:'12px 16px', borderTop:`0.5px solid ${C.borderLight}`, color:C.rust, ...sans({ fontSize:10.5, lineHeight:1.4 }) }}>{aiMessage}</div>}
        </div>
        <div style={{ padding:'8px 16px', borderTop:`0.5px solid ${C.border}`, display:'flex', gap:14, flexWrap:'wrap' }}><span style={px({ fontSize:9.5, color:C.text4 })}>↑↓ navigate</span><span style={px({ fontSize:9.5, color:C.text4 })}>↵ select / ask</span><span style={px({ fontSize:9.5, color:C.text4 })}>esc close</span></div>
      </div>
    </div>
  );
}
