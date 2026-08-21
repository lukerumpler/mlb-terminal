import React, { Component, useState } from 'react';
import { trpc } from '../lib/trpc';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from './atoms.jsx';

class QueryBoundary extends Component {
  constructor(props) { super(props); this.state = { failed:false }; }
  static getDerivedStateFromError() { return { failed:true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function QueryForm({ context, accent }) {
  const [query, setQuery] = useState('');
  const mutation = trpc.ai.query.useMutation();
  const submit = event => {
    event.preventDefault();
    const value = query.trim();
    if (!value || mutation.isPending) return;
    mutation.mutate({ query:value, context });
  };
  return <form onSubmit={submit} style={{ padding:'10px 14px 8px' }}>
    <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
      <input aria-label="Ask a natural-language MLB question" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. What is this player's recent OPS trend?" style={{ flex:'1 1 260px', minWidth:0, height:34, padding:'0 10px', border:`1px solid ${C.border}`, borderRadius:7, background:C.surface2, color:C.text, outline:'none', ...sans({ fontSize:11 }) }} />
      <button type="submit" disabled={!query.trim() || mutation.isPending} style={{ height:34, padding:'0 12px', border:`1px solid ${accent}`, borderRadius:7, background:mutation.isPending ? C.surface3 : accent, color:mutation.isPending ? C.text3 : '#fff', cursor:!query.trim() || mutation.isPending ? 'wait' : 'pointer', ...px({ fontSize:9, fontWeight:800, letterSpacing:'.04em' }) }}>{mutation.isPending ? 'ANALYZING…' : 'ASK SKIP'}</button>
    </div>
    <div style={sans({ marginTop:7, fontSize:9.5, color:C.text4 })}>Answers use only the verified context currently visible in this workspace. Missing values stay unavailable.</div>
    {mutation.data && <div role="status" aria-live="polite" style={{ marginTop:9, padding:'9px 10px', borderLeft:`3px solid ${mutation.data.confidence === 'verified' ? accent : C.rust}`, background:C.surface2, borderRadius:5 }}><div style={sans({ fontSize:11, color:C.text, lineHeight:1.45 })}>{mutation.data.answer}</div><div style={px({ marginTop:5, fontSize:8.5, color:C.text4 })}>{mutation.data.intent === 'unavailable' ? 'Unavailable' : `${mutation.data.intent.replace('_', ' ')} · ${mutation.data.metric || 'context'}`}</div></div>}
    {mutation.error && <div role="alert" style={sans({ marginTop:8, fontSize:10, color:C.rust })}>The query could not be completed. Use the visible filters while the AI service recovers.</div>}
  </form>;
}

export default function NaturalLanguageMlbQuery({ context = {}, accent = C.teal, title = 'Ask SKIP' }) {
  return <Panel title={title} accent={accent} badge="AI · source-constrained"><QueryBoundary><QueryForm context={context} accent={accent} /></QueryBoundary></Panel>;
}

export { NaturalLanguageMlbQuery };
