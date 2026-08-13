import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { C, px, sans } from '../constants/colors.js';
import { SEASON } from '../constants/data.js';
import { searchPlayers, loadFullPlayer } from '../api/mlb.js';
import { percentileColor, percentileLabel } from '../lib/percentile.js';
import { Spinner } from './ui/spinner.tsx';

function displayName(player) {
  return player?.profile?.fullName || player?.fullName || 'Player';
}

function identityLine(player) {
  const profile = player?.profile || player || {};
  return `${profile.currentTeam?.name || 'Free Agent'} · ${profile.primaryPosition?.abbreviation || '—'}`;
}

export function comparisonIdentity(player) {
  return { name: displayName(player), identity: identityLine(player) };
}

export function comparisonAxes(player, getAxes, isPitcher) {
  return getAxes(player, isPitcher).map(item => ({
    ...item,
    label: percentileLabel(item.pct),
    color: percentileColor(item.pct),
  }));
}

function PlayerRadar({ player, axes, accent }) {
  if (!axes.length) {
    return (
      <div style={sans({ minHeight:238, display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:20, color:C.text3, fontSize:11, lineHeight:1.5 })}>
        Savant percentile data unavailable for this player.
      </div>
    );
  }

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
        <div>
          <div style={sans({ fontSize:13, fontWeight:800, color:C.text })}>{displayName(player)}</div>
          <div style={px({ fontSize:9.5, color:C.text3 })}>{identityLine(player)}</div>
        </div>
        <div style={px({ fontSize:9, color:C.text4 })}>0–100 rank</div>
      </div>
      <ResponsiveContainer width="100%" height={238}>
        <RadarChart data={axes} margin={{ top:18, right:38, bottom:14, left:38 }}>
          <PolarGrid stroke={C.border} />
          <PolarAngleAxis dataKey="axis" tick={({ payload, x, y, textAnchor }) => {
            const item = axes.find(entry => entry.axis === payload.value);
            return (
              <g>
                <text x={x} y={y} textAnchor={textAnchor} fill={C.text2} fontSize={9} fontWeight={700} fontFamily="'Plus Jakarta Sans',sans-serif">{payload.value}</text>
                <text x={x} y={y + 12} textAnchor={textAnchor} fill={percentileColor(item?.pct)} fontSize={9} fontWeight={800} fontFamily="'DM Mono',monospace">{percentileLabel(item?.pct)}</text>
              </g>
            );
          }} />
          <PolarRadiusAxis domain={[0, 100]} ticks={[50]} tick={{ fill:C.text4, fontSize:8, fontFamily:"'DM Mono',monospace" }} axisLine={false} />
          <Radar isAnimationActive={false} dataKey="pct" stroke={accent} fill={accent} fillOpacity={0.2} strokeWidth={2} dot={{ r:3, fill:accent }} />
        </RadarChart>
      </ResponsiveContainer>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:'5px 12px', borderTop:`0.5px solid ${C.borderLight}`, paddingTop:8 }}>
        {axes.map(item => (
          <div key={item.axis} style={{ display:'flex', justifyContent:'space-between', gap:6 }}>
            <span style={sans({ fontSize:9.5, color:C.text2 })}>{item.axis}</span>
            <span style={px({ fontSize:9.5, color:percentileColor(item.pct), whiteSpace:'nowrap', fontWeight:700 })}>{percentileLabel(item.pct)} · {item.rawLabel}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function PlayerComparisonModal({ primary, isPitcher, getAxes, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [secondary, setSecondary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    closeRef.current?.focus();
    const previouslyFocused = document.activeElement;
    const onKey = event => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    const term = query.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    timerRef.current = setTimeout(async () => {
      try {
        const found = await searchPlayers(term);
        if (mountedRef.current) setResults(found.filter(result => String(result.id) !== String(primary?.id)));
      } catch {
        if (mountedRef.current) setResults([]);
      }
    }, 260);
    return () => clearTimeout(timerRef.current);
  }, [query, primary?.id]);

  const pickSecondary = async person => {
    const requestId = ++requestRef.current;
    setResults([]);
    setQuery(person.fullName);
    setLoading(true);
    setError(null);
    try {
      const data = await loadFullPlayer(person, SEASON);
      if (!mountedRef.current || requestRef.current !== requestId) return;
      if (Boolean(data?.isPitcher) !== Boolean(isPitcher)) {
        setSecondary(null);
        setError(`Choose another ${isPitcher ? 'pitcher' : 'position player'} to compare with ${displayName(primary)}.`);
      } else {
        setSecondary(data);
      }
    } catch (err) {
      if (mountedRef.current && requestRef.current === requestId) setError(err.message || `Could not load ${person.fullName}.`);
    } finally {
      if (mountedRef.current && requestRef.current === requestId) setLoading(false);
    }
  };

  const primaryAxes = useMemo(() => getAxes(primary, isPitcher), [getAxes, primary, isPitcher]);
  const secondaryAxes = useMemo(() => secondary ? getAxes(secondary, isPitcher) : [], [getAxes, secondary, isPitcher]);

  useEffect(() => {
    if (!secondary || !secondaryAxes.length || !primaryAxes.length) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);
    const payload = {
      players: [
        { name: displayName(primary), position: identityLine(primary), playerType: isPitcher ? 'pitcher' : 'hitter', axes: primaryAxes.map(axis => ({ axis: axis.axis, pct: axis.pct, rawLabel: axis.rawLabel })) },
        { name: displayName(secondary), position: identityLine(secondary), playerType: isPitcher ? 'pitcher' : 'hitter', axes: secondaryAxes.map(axis => ({ axis: axis.axis, pct: axis.pct, rawLabel: axis.rawLabel })) },
      ],
    };
    fetch('/api/comparison-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : response.json().catch(() => ({})).then(body => Promise.reject(new Error(body.error || 'Summary unavailable'))))
      .then(data => setSummary(data))
      .catch(err => { if (err.name !== 'AbortError') setSummaryError(err.message || 'Summary unavailable'); })
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });
    return () => controller.abort();
  }, [getAxes, isPitcher, primary, primaryAxes, secondary, secondaryAxes]);

  return (
    <div className="skip-compare-backdrop" onClick={onClose} role="presentation" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.56)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'28px 16px', overflowY:'auto' }}>
      <div className="skip-compare-dialog" ref={dialogRef} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Compare ${displayName(primary)} with another player`} style={{ width:'min(1080px,100%)', background:C.surface, borderRadius:12, overflow:'hidden', border:`0.5px solid ${C.border}`, boxShadow:'0 24px 60px rgba(0,0,0,.38)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, padding:'14px 18px', borderBottom:`0.5px solid ${C.border}` }}>
          <div>
            <div style={sans({ fontSize:14, fontWeight:800, color:C.text })}>Player Comparison</div>
            <div style={px({ fontSize:9.5, color:C.text3, marginTop:3 })}>Baseball Savant percentile profiles · same player type only</div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close player comparison" style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:20, color:C.text3, lineHeight:1 }}>×</button>
        </div>

        <div style={{ padding:'12px 18px', borderBottom:`0.5px solid ${C.borderLight}`, position:'relative' }}>
          <label htmlFor="comparison-player-search" style={sans({ display:'block', fontSize:9.5, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 })}>Add second player</label>
          <input id="comparison-player-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search a ${isPitcher ? 'pitcher' : 'position player'} by name…`} style={{ width:'100%', height:36, padding:'0 11px', border:`0.5px solid ${C.border}`, borderRadius:7, background:C.surface2, color:C.text, outline:'none', ...sans({ fontSize:12 }) }} />
          {results.length > 0 && (
            <div style={{ position:'absolute', top:76, left:18, right:18, background:C.surface, border:`1px solid ${C.border}`, borderRadius:7, zIndex:5, boxShadow:'0 8px 26px rgba(0,0,0,.18)', maxHeight:230, overflowY:'auto' }}>
              {results.map(result => (
                <button key={result.id} onClick={() => pickSecondary(result)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 11px', border:0, borderBottom:`0.5px solid ${C.borderLight}`, background:'transparent', cursor:'pointer', textAlign:'left' }}>
                  <span style={sans({ fontSize:11.5, fontWeight:700, color:C.text })}>{result.fullName}</span>
                  <span style={px({ marginLeft:'auto', fontSize:9.5, color:C.text3 })}>{result.currentTeam?.abbreviation || 'FA'} · {result.primaryPosition?.abbreviation || '—'}</span>
                </button>
              ))}
            </div>
          )}
          {loading && <div role="status" aria-live="polite" style={{ display:'flex', alignItems:'center', gap:7, marginTop:7, ...px({ fontSize:9.5, color:C.text3 }) }}><Spinner style={{ width:14, height:14, color:C.amber }} /> Loading live MLB and Savant data…</div>}
          {error && <div role="alert" style={sans({ fontSize:10.5, color:C.rust, marginTop:6 })}>{error}</div>}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:0 }}>
          <div style={{ padding:'14px 18px 16px', borderRight:`0.5px solid ${C.border}` }}>
            <div style={sans({ fontSize:9.5, fontWeight:800, color:C.amber, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 })}>Player A</div>
            <PlayerRadar player={primary} axes={primaryAxes} accent={C.amber} />
          </div>
          <div style={{ padding:'14px 18px 16px' }}>
            <div style={sans({ fontSize:9.5, fontWeight:800, color:C.teal, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 })}>Player B</div>
            {secondary ? <div className="skip-compare-panel-enter"><PlayerRadar player={secondary} axes={secondaryAxes} accent={C.teal} /></div> : loading ? (
              <div role="status" aria-live="polite" style={sans({ minHeight:330, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, textAlign:'center', padding:20, color:C.text3, fontSize:11, lineHeight:1.5 })}><Spinner style={{ width:22, height:22, color:C.teal }} /><span>Loading the second player’s live percentile profile…</span></div>
            ) : (
              <div style={sans({ minHeight:330, display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:20, color:C.text3, fontSize:11, lineHeight:1.5 })}>Search for a second player above to view two Savant percentile radars side-by-side.</div>
            )}
          </div>
        </div>

        {secondary && (
          <section aria-live="polite" className="skip-compare-summary" style={{ margin:'0 18px 14px', padding:'12px 14px', border:`0.5px solid ${C.border}`, borderLeft:`3px solid ${C.amber}`, borderRadius:8, background:C.surface2 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:8 }}>
              <div style={sans({ fontSize:10, fontWeight:800, color:C.text, textTransform:'uppercase', letterSpacing:'.08em' })}>AI Profile Summary</div>
              <div style={px({ fontSize:8.5, color:summary?.generated ? C.teal : C.text4, textTransform:'uppercase', letterSpacing:'.06em' })}>{summary?.generated ? 'Generated from supplied Savant axes' : 'Source-grounded fallback'}</div>
            </div>
            {summaryLoading ? (
              <div role="status" aria-label="Generating comparison summary" style={{ display:'flex', alignItems:'center', gap:8, ...sans({ fontSize:10.5, color:C.text3 }) }}><Spinner style={{ width:15, height:15, color:C.amber }} /> Comparing percentile edges…</div>
            ) : summaryError ? (
              <div role="alert" style={sans({ fontSize:10.5, color:C.rust, lineHeight:1.5 })}>The AI summary is unavailable right now. The radar profiles above remain source-backed.</div>
            ) : summary ? (
              <>
                <div style={sans({ fontSize:12, fontWeight:800, color:C.text, lineHeight:1.35 })}>{summary.headline}</div>
                <div style={sans({ fontSize:10.5, color:C.text2, lineHeight:1.5, marginTop:4 })}>{summary.summary}</div>
                {Array.isArray(summary.edges) && summary.edges.length > 0 && <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:9 }}>{summary.edges.map((edge, index) => <span key={`${edge.axis}-${index}`} style={px({ fontSize:9, color:edge.leader === 'Even' ? C.text3 : C.teal, background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:999, padding:'4px 7px' })}>{edge.axis}: {edge.leader}{edge.margin == null ? '' : ` +${edge.margin}`}</span>)}</div>}
                <div style={sans({ fontSize:9.5, color:C.text4, lineHeight:1.45, marginTop:8 })}>{summary.caveat}</div>
              </>
            ) : null}
          </section>
        )}

        <div style={{ padding:'10px 18px', borderTop:`0.5px solid ${C.border}` }}>
          <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>Radar widths are percentile ranks against the live qualified Baseball Savant population. Raw values are shown only as context; unavailable fields remain unfilled.</div>
        </div>
      </div>
    </div>
  );
}

export { PlayerRadar };
