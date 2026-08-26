import React, { Component, useEffect, useState } from 'react';
import { trpc } from '../lib/trpc';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from './atoms.jsx';

const HISTORY_KEY = 'skip-ai-query-history-v1';
const HISTORY_LIMIT = 6;

class QueryBoundary extends Component {
  constructor(props) { super(props); this.state = { failed:false }; }
  static getDerivedStateFromError() { return { failed:true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function normalizeQueryHistory(value) {
  return Array.isArray(value) ? value.filter(item => typeof item?.query === 'string' && item.query.trim()).slice(0, HISTORY_LIMIT) : [];
}

export function upsertQueryHistory(history, query, savedAt = Date.now()) {
  const normalized = String(query || '').trim();
  if (!normalized) return normalizeQueryHistory(history);
  return [{ query:normalized, savedAt }, ...normalizeQueryHistory(history).filter(item => item.query.toLowerCase() !== normalized.toLowerCase())].slice(0, HISTORY_LIMIT);
}

function readHistory() {
  try { return normalizeQueryHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')); }
  catch { return []; }
}

function writeHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT))); } catch { /* storage is optional */ }
}

function QueryForm({ context, accent }) {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(() => readHistory());
  const [progressStep, setProgressStep] = useState(0);
  const mutation = trpc.ai.query.useMutation();
  const progressLabels = ['Reading visible context…', 'Matching the requested metric…', 'Preparing a concise answer…'];

  useEffect(() => {
    if (!mutation.isPending) { setProgressStep(0); return undefined; }
    const timer = window.setInterval(() => setProgressStep(step => (step + 1) % progressLabels.length), 700);
    return () => window.clearInterval(timer);
  }, [mutation.isPending]);

  const saveQuery = value => {
    const normalized = value.trim();
    if (!normalized) return;
    const next = upsertQueryHistory(history, normalized);
    setHistory(next);
    writeHistory(next);
  };

  const submit = event => {
    event.preventDefault();
    const value = query.trim();
    if (!value || mutation.isPending) return;
    saveQuery(value);
    mutation.mutate({ query:value, context });
  };

  const removeHistory = value => {
    const next = history.filter(item => item.query !== value);
    setHistory(next);
    writeHistory(next);
  };

  return <form onSubmit={submit} style={{ padding:'10px 14px 8px' }}>
    <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
      <input aria-label="Ask a natural-language MLB question" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. What is this player's recent OPS trend?" style={{ flex:'1 1 260px', minWidth:0, height:34, padding:'0 10px', border:`1px solid ${C.border}`, borderRadius:7, background:C.surface2, color:C.text, outline:'none', ...sans({ fontSize:11 }) }} />
      <button type="submit" disabled={!query.trim() || mutation.isPending} style={{ height:34, padding:'0 12px', border:`1px solid ${accent}`, borderRadius:7, background:mutation.isPending ? C.surface3 : accent, color:mutation.isPending ? C.text3 : '#fff', cursor:!query.trim() || mutation.isPending ? 'wait' : 'pointer', ...px({ fontSize:9, fontWeight:800, letterSpacing:'.04em' }) }}>{mutation.isPending ? 'WORKING…' : 'ASK SKIP'}</button>
    </div>
    <div style={sans({ marginTop:7, fontSize:9.5, color:C.text4 })}>One model request per submitted question. Reusing a saved question only fills the bar; it does not spend tokens until you submit.</div>
    {mutation.isPending && <div role="status" aria-live="polite" style={{ display:'flex', alignItems:'center', gap:7, marginTop:9, padding:'8px 10px', borderLeft:`3px solid ${accent}`, background:C.surface2, borderRadius:5 }}><span aria-hidden="true" style={{ width:10, height:10, border:`2px solid ${C.border}`, borderTopColor:accent, borderRadius:'50%', display:'inline-block', animation:'skip-status-spin .8s linear infinite' }} /><span style={sans({ fontSize:10, color:C.text2 })}>{progressLabels[progressStep]}</span><span style={px({ fontSize:9, color:C.text4 })}>structured response</span></div>}
    {history.length > 0 && <div style={{ marginTop:9 }}><div style={px({ fontSize:8.5, color:C.text4, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:800 })}>Saved questions</div><div style={{ display:'grid', gap:4, marginTop:5 }}>{history.map(item => <div key={item.query} style={{ display:'flex', alignItems:'center', gap:5 }}><button type="button" onClick={() => setQuery(item.query)} title="Reuse without sending" style={{ flex:1, minWidth:0, overflow:'hidden', padding:'6px 8px', border:`1px solid ${C.borderLight}`, borderRadius:5, background:C.surface2, color:C.text2, textAlign:'left', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', ...sans({ fontSize:9.5 }) }}>{item.query}</button><button type="button" onClick={() => removeHistory(item.query)} aria-label={`Remove saved question ${item.query}`} style={{ width:24, height:24, padding:0, border:0, background:'transparent', color:C.text4, cursor:'pointer', ...px({ fontSize:12 }) }}>×</button></div>)}</div></div>}
    {mutation.data && <div role="status" aria-live="polite" style={{ marginTop:9, padding:'9px 10px', borderLeft:`3px solid ${mutation.data.confidence === 'verified' ? accent : C.rust}`, background:C.surface2, borderRadius:5 }}><div style={sans({ fontSize:11, color:C.text, lineHeight:1.45 })}>{mutation.data.answer}</div><div style={px({ marginTop:5, fontSize:8.5, color:C.text4 })}>{mutation.data.intent === 'unavailable' ? 'Unavailable' : `${mutation.data.intent.replace('_', ' ')} · ${mutation.data.metric || 'context'}`}</div></div>}
    {mutation.error && <div role="alert" style={sans({ marginTop:8, fontSize:10, color:C.rust })}>The query could not be completed. Use the visible filters while the AI service recovers.</div>}
  </form>;
}

export default function NaturalLanguageMlbQuery({ context = {}, accent = C.teal, title = 'Ask SKIP' }) {
  return <Panel title={title} accent={accent} badge="AI · source-constrained"><QueryBoundary><QueryForm context={context} accent={accent} /></QueryBoundary></Panel>;
}

export { NaturalLanguageMlbQuery, HISTORY_KEY, HISTORY_LIMIT };
