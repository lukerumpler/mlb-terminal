import React, { useEffect, useState } from 'react';
import { __getMlbQueueSnapshotForTests, __getMlbRequestTraceForTests } from '../api/mlb.js';
import { summarizeRequestTrace } from '../lib/requestDiagnostics.js';
import { C, px, sans } from '../constants/colors.js';

function readDiagnostics() {
  const trace = __getMlbRequestTraceForTests();
  return { trace, summary: summarizeRequestTrace(trace), queue: __getMlbQueueSnapshotForTests() };
}

export default function RequestDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState(readDiagnostics);

  useEffect(() => {
    const refresh = () => setDiagnostics(readDiagnostics());
    window.addEventListener('skip-mlb-request-trace', refresh);
    return () => window.removeEventListener('skip-mlb-request-trace', refresh);
  }, []);

  const { summary, queue, trace } = diagnostics;
  const recent = trace.slice(-8).reverse();
  return (
    <details data-export-ignore aria-label="Development request diagnostics" style={{width:'100%',padding:'6px 9px',border:`1px dashed ${C.amberMid}`,borderRadius:6,background:C.amberSoft}}>
      <summary style={{cursor:'pointer',...px({fontSize:9,color:C.amberDark,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase'})}}>
        Dev request diagnostics · {summary.total} events · queue {queue.activeRequests}/{queue.queuedRequests}
      </summary>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',paddingTop:7,...sans({fontSize:9,color:C.text3})}}>
        <span>success {summary.successes}</span><span>local {summary.localHits}</span><span>stale {summary.staleHits}</span><span>deduped {summary.deduplicated}</span><span>aborted {summary.aborted}</span><span>errors {summary.errors}</span>
        {Object.entries(summary.byPriority).map(([priority, count]) => <span key={priority}>{priority} {count}</span>)}
      </div>
      {recent.length > 0 && <div style={{display:'grid',gap:3,paddingTop:7,...px({fontSize:8.5,color:C.text3})}}>
        {recent.map(entry => <div key={entry.id} style={{display:'grid',gridTemplateColumns:'78px 68px 1fr',gap:7}}><span>{entry.event}</span><span>{entry.priority}</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.resource} · {entry.screen}</span></div>)}
      </div>}
    </details>
  );
}
