import React, { useEffect, useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { getFeedFreshnessRows } from '../lib/feedFreshness.js';
import { Panel } from './atoms.jsx';

const PROVIDERS = [
  { key: 'mlb', label: 'MLB Stats API', source: 'Official MLB schedule, standings, player, and team feeds' },
  { key: 'boxscore', label: 'MLB boxscore feed', source: 'Official completed-game boxscores used for player OPS and ERA splits' },
  { key: 'fangraphs', label: 'FanGraphs', source: 'Team model and projection provider' },
  { key: 'savant', label: 'Baseball Savant', source: 'Statcast and batted-ball provider' },
  { key: 'ncaa', label: 'NCAA feed', source: 'College baseball scoreboard and rankings proxy' },
  { key: 'roster-insights', label: 'Roster insights', source: 'Verified local fallback plus optional AI interpretation' },
];

function relativeTime(value) {
  if (!value) return 'No successful update recorded';
  const age = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.round(age / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

export default function DataSourceStatusCenter({ successes = {}, settings = { enabled: true, displayMode: 'relative' } }) {
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(null);
  const [lastRetry, setLastRetry] = useState({});
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const freshnessRows = useMemo(() => getFeedFreshnessRows(successes, settings), [successes, settings, now]);
  const freshnessByKey = useMemo(() => new Map(freshnessRows.map(row => [row.key, row])), [freshnessRows]);
  const requestRetry = provider => {
    setRetrying(provider);
    setLastRetry(current => ({ ...current, [provider]: Date.now() }));
    window.dispatchEvent(new CustomEvent('skip-provider-retry', { detail: { provider } }));
    window.setTimeout(() => setRetrying(current => current === provider ? null : current), 900);
  };
  return (
    <Panel title="Data-source status center" accent={C.teal} badge="Independent controls">
      <div style={{ padding:'10px 14px 8px', ...sans({ fontSize:11, color:C.text3, lineHeight:1.45 }) }}>
        Each provider reports its own freshness. A retry refreshes only the selected source and never replaces a verified value with an estimate.
      </div>
      <div aria-label="Data-source providers">
        {PROVIDERS.map((provider, index) => {
          const row = freshnessByKey.get(provider.key);
          const successful = Boolean(row?.lastSuccess);
          const isRetrying = retrying === provider.key;
          return (
            <div key={provider.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderTop:`0.5px solid ${C.borderLight}` }}>
              <span aria-hidden="true" style={{ width:8, height:8, flexShrink:0, borderRadius:'50%', background:successful ? C.teal : C.amber }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={sans({ fontSize:11.5, fontWeight:800, color:C.text })}>{provider.label}</div>
                <div style={sans({ fontSize:9.5, color:C.text3, marginTop:2 })}>{provider.source}</div>
                <div style={px({ fontSize:9, color:successful ? C.teal : C.text3, marginTop:3 })}>
                  {successful ? `Last success · ${relativeTime(row.lastSuccess)}` : 'No successful response recorded'}{lastRetry[provider.key] ? ` · retry ${relativeTime(lastRetry[provider.key])}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => requestRetry(provider.key)} disabled={isRetrying} aria-label={`Retry ${provider.label}`} style={{ flexShrink:0, minWidth:72, padding:'6px 8px', border:`1px solid ${isRetrying ? C.border : C.tealMid}`, borderRadius:6, background:isRetrying ? C.surface3 : C.tealSoft, color:isRetrying ? C.text3 : C.teal, cursor:isRetrying ? 'wait' : 'pointer', ...px({ fontSize:9, fontWeight:800 }) }}>
                {isRetrying ? 'RETRYING…' : 'RETRY'}
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
