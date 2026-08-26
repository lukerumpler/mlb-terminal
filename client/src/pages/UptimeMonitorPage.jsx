import React, { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from '../components/atoms.jsx';
import { getUptimeMonitorDashboard } from '../api/uptimeMonitor.js';

const SERIES = [
  { key:'mlbApi', endpoint:'https://mlb-terminal.vercel.app/api/health', label:'MLB API health', color:C.teal },
  { key:'mlbPublic', endpoint:'https://mlb-terminal.vercel.app/', label:'MLB Terminal', color:C.amber },
  { key:'skipPlatform', endpoint:'https://skipbasebal-mm6hz9ps.manus.space', label:'SKIP platform', color:C.purple },
  { key:'lukerumpler', endpoint:'https://lukerumpler.com', label:'lukerumpler.com', color:C.rust },
];

const formatUtc = value => value ? new Intl.DateTimeFormat('en-US', { timeZone:'UTC', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(value)) + ' UTC' : 'No recorded probe';

function statusStyle(passed) {
  if (passed == null) return { label:'WAITING', color:C.text3, bg:C.surface3 };
  return passed ? { label:'OPERATIONAL', color:C.teal, bg:C.tealSoft } : { label:'FAILED', color:C.rust, bg:C.rustSoft };
}

export default function UptimeMonitorPage() {
  const [days, setDays] = useState(7);
  const [state, setState] = useState({ loading:true, error:null, data:null });
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading:true, error:null }));
    getUptimeMonitorDashboard(days).then(data => active && setState({ loading:false, error:null, data })).catch(error => active && setState({ loading:false, error:error.message, data:null }));
    return () => { active = false; };
  }, [days]);

  const trend = useMemo(() => {
    const records = new Map();
    (state.data?.trend30Days || []).forEach(check => {
      const key = new Date(check.checkedAt).toISOString();
      const current = records.get(key) || { label:formatUtc(check.checkedAt) };
      const series = SERIES.find(item => item.endpoint === check.endpoint);
      if (series) current[series.key] = check.latencyMs;
      records.set(key, current);
    });
    return [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  }, [state.data]);

  return <div className="skip-uptime-page" style={{ display:'flex', flexDirection:'column', gap:12 }}>
    <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', justifyContent:'space-between', gap:10, padding:'4px 2px 10px' }}>
      <div><div style={px({ fontSize:9, color:C.teal, fontWeight:800, letterSpacing:'.12em' })}>PRODUCTION OBSERVABILITY · UTC</div><h2 style={sans({ fontSize:20, fontWeight:800, color:C.text, marginTop:5, letterSpacing:'-.02em' })}>Uptime Monitor</h2><p style={sans({ fontSize:11, color:C.text3, marginTop:4, lineHeight:1.55 })}>Four fixed production targets with persisted status, response latency, and daily idempotent checks.</p></div>
      <div style={{ display:'flex', gap:5, padding:3, border:`1px solid ${C.border}`, borderRadius:8, background:C.surface2 }}>{[7,30].map(value => <button key={value} onClick={() => setDays(value)} style={{ border:'none', borderRadius:6, padding:'6px 9px', cursor:'pointer', background:days===value?C.teal:C.surface2, color:days===value?'#fff':C.text2, ...px({ fontSize:10, fontWeight:800 }) }}>Last {value}d</button>)}</div>
    </div>
    {state.loading && <Panel title="Loading uptime history"><div style={sans({ fontSize:11, color:C.text3, padding:16 })}>Loading persisted UTC probe results…</div></Panel>}
    {state.error && <Panel title="Monitor unavailable" accent={C.rust}><div style={sans({ fontSize:11, color:C.rust, padding:16 })}>{state.error}</div></Panel>}
    {state.data && <>
      <div className="skip-uptime-summary-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10 }}>{state.data.targets.map(target => { const badge=statusStyle(target.latest?.passed); return <Panel key={target.endpoint} title={target.label} badge={badge.label} accent={badge.color}><div style={{ padding:'2px 12px 12px' }}><div style={px({ fontSize:9, color:C.text4, letterSpacing:'.04em', overflowWrap:'anywhere' })}>{target.endpoint}</div><div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginTop:12 }}><div><div style={px({ fontSize:9, color:C.text4, fontWeight:800, letterSpacing:'.06em' })}>UPTIME</div><div style={sans({ fontSize:17, fontWeight:800, color:C.text, marginTop:3 })}>{target.uptimePercent == null ? '—' : `${target.uptimePercent}%`}</div></div><div><div style={px({ fontSize:9, color:C.text4, fontWeight:800, letterSpacing:'.06em' })}>AVG LATENCY</div><div style={sans({ fontSize:17, fontWeight:800, color:C.text, marginTop:3 })}>{target.averageLatencyMs == null ? '—' : `${target.averageLatencyMs} ms`}</div></div><div><div style={px({ fontSize:9, color:C.text4, fontWeight:800, letterSpacing:'.06em' })}>PASS / FAIL</div><div style={sans({ fontSize:17, fontWeight:800, color:C.text, marginTop:3 })}>{target.passed}<span style={{ color:C.text4 }}> / </span><span style={{ color:C.rust }}>{target.failed}</span></div></div></div><div style={px({ fontSize:9, color:C.text3, marginTop:10 })}>Latest: {formatUtc(target.latest?.checkedAt)}</div></div></Panel>; })}</div>
      <Panel title="30-Day Latency Trend" badge="UTC · milliseconds" accent={C.teal}>{trend.length ? <div style={{ height:300, padding:'6px 6px 0' }}><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top:10, right:18, left:-8, bottom:0 }}><CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fill:C.text3, fontSize:9 }} minTickGap={40} tickLine={false} axisLine={false}/><YAxis tick={{ fill:C.text3, fontSize:9 }} unit=" ms" tickLine={false} axisLine={false} width={54}/><Tooltip formatter={value => [`${value} ms`, '']} contentStyle={{ borderRadius:8, border:`1px solid ${C.border}`, background:C.surface }}/><Legend wrapperStyle={{ fontSize:10 }}/>{SERIES.map(series => <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={{ r:3, fill:C.surface, strokeWidth:2 }} connectNulls/>)}</LineChart></ResponsiveContainer></div> : <div style={sans({ fontSize:11, color:C.text3, padding:28, textAlign:'center' })}>No persisted checks yet. The daily scheduler will establish the first history after deployment and activation.</div>}</Panel>
    </>}
  </div>;
}
