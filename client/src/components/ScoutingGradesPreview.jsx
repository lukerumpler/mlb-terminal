import React, { useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from './atoms.jsx';
import { percentile } from '../lib/percentile.js';

export const SCOUTING_GRADE_PREVIEW_ROWS = [
  { key:'hit', label:'Hit', current:null, future:null, note:'Contact quality' },
  { key:'power', label:'Power', current:null, future:null, note:'Game power' },
  { key:'run', label:'Run', current:null, future:null, note:'Speed / athleticism' },
  { key:'arm', label:'Arm', current:null, future:null, note:'Arm strength' },
  { key:'field', label:'Field', current:null, future:null, note:'Defensive actions' },
];

const GRADE_KEYS = { hit:['Hit'], power:['Power'], run:['Run'], arm:['Arm'], field:['Field'] };

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function populationValue(row, keys) {
  for (const key of keys) {
    const value = finite(row?.[key]);
    if (value != null) return value;
  }
  return null;
}

function percentileGrade(value, population, keys, higher = true) {
  const numbers = (population || []).map(row => populationValue(row, keys)).filter(value => value != null);
  if (value == null || numbers.length < 2) return null;
  const rank = percentile(value, numbers, higher);
  return Math.max(20, Math.min(80, Math.round(20 + (rank / 100) * 60)));
}

function buildEstimatedRow({ key, label, raw, population, populationKeys, note, source, method }) {
  const value = percentileGrade(raw, population, populationKeys);
  return {
    key, label, current:value, future:null, note:value == null ? note : `${note} · estimated proxy`,
    status:value == null ? 'unavailable' : 'estimated', source:value == null ? null : source,
    method:value == null ? null : method,
  };
}

export function buildScoutingGradeRows({ player, seasonStats } = {}) {
  const stats = seasonStats || {};
  const savant = player?.savant || {};
  const expectedPopulation = Array.isArray(player?.expectedStatisticsPopulation) ? player.expectedStatisticsPopulation : [];
  const statcastPopulation = Array.isArray(player?.statcastPopulation) ? player.statcastPopulation : [];
  if (player?.isPitcher) {
    return [
      { key:'stuff', label:'Stuff', current:null, future:null, note:'Pitch quality · no verified 20–80 source', status:'unavailable', source:null, method:null },
      { key:'command', label:'Command', current:null, future:null, note:'Strike throwing · no verified 20–80 source', status:'unavailable', source:null, method:null },
      { key:'run-prevention', label:'Run Prevention', current:null, future:null, note:'ERA/WHIP context is not a scouting grade', status:'unavailable', source:null, method:null },
      { key:'arm', label:'Arm', current:null, future:null, note:'Arm strength · no verified 20–80 source', status:'unavailable', source:null, method:null },
      { key:'field', label:'Field', current:null, future:null, note:'Fielding · no verified 20–80 source', status:'unavailable', source:null, method:null },
    ];
  }
  return [
    buildEstimatedRow({ key:'hit', label:'Hit', raw:finite(savant.est_ba), population:expectedPopulation, populationKeys:['est_ba'], note:'xBA contact proxy', source:'Baseball Savant · expected statistics', method:'Percentile of xBA against the supplied comparison population, converted to a 20–80 display scale.' }),
    buildEstimatedRow({ key:'power', label:'Power', raw:finite(savant.est_slg), population:expectedPopulation, populationKeys:['est_slg'], note:'xSLG game-power proxy', source:'Baseball Savant · expected statistics', method:'Percentile of xSLG against the supplied comparison population, converted to a 20–80 display scale.' }),
    { key:'run', label:'Run', current:null, future:null, note:'Speed / athleticism · no verified 20–80 source', status:'unavailable', source:null, method:null },
    { key:'arm', label:'Arm', current:null, future:null, note:'Arm strength · no verified 20–80 source', status:'unavailable', source:null, method:null },
    { key:'field', label:'Field', current:null, future:null, note:'Defensive actions · no verified 20–80 source', status:'unavailable', source:null, method:null },
  ];
}

function Scale({ value, label }) {
  const hasValue = value != null && value !== '' && Number.isFinite(Number(value));
  const position = hasValue ? ((Number(value) - 20) / 60) * 100 : 50;
  return (
    <div role="img" aria-label={hasValue ? `${label} ${value} of 80` : `${label} scouting grade unavailable`} style={{ flex:1, minWidth:90 }}>
      <div style={{ position:'relative', height:8, borderRadius:5, background:`linear-gradient(to right, ${C.rust} 0%, ${C.amber} 50%, ${C.teal} 100%)`, opacity:hasValue ? 1 : .35 }}>
        <div aria-hidden="true" style={{ position:'absolute', left:'50%', top:'50%', width:1, height:14, background:C.text3, transform:'translate(-50%,-50%)' }} />
        {hasValue && <div aria-hidden="true" style={{ position:'absolute', left:`${Math.max(0, Math.min(100, position))}%`, top:'50%', width:12, height:12, borderRadius:'50%', background:C.surface, border:`2px solid ${value >= 60 ? C.teal : value >= 50 ? C.amber : C.rust}`, transform:'translate(-50%,-50%)' }} />}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, ...px({ fontSize:8, color:C.text4 }) }}><span>20</span><span>50 avg</span><span>80</span></div>
    </div>
  );
}

export default function ScoutingGradesPreview({ title = '20–80 Scouting Grades', player, seasonStats }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const rows = useMemo(() => buildScoutingGradeRows({ player, seasonStats }), [player, seasonStats]);
  const visibleRows = useMemo(() => {
    const filtered = rows.filter(row => filter === 'all' || (filter === 'available' ? row.current != null : row.current == null));
    return [...filtered].sort((a, b) => {
      if (sort === 'attribute') return a.label.localeCompare(b.label);
      if (sort === 'current-desc') return (b.current ?? -1) - (a.current ?? -1);
      if (sort === 'current-asc') return (a.current ?? 999) - (b.current ?? 999);
      return rows.indexOf(a) - rows.indexOf(b);
    });
  }, [rows, filter, sort]);
  const estimatedCount = rows.filter(row => row.status === 'estimated').length;
  return (
    <Panel title={title} accent={C.teal} badge={estimatedCount ? 'ESTIMATED PROXIES' : 'UNAVAILABLE'}>
      <div style={{ padding:'10px 14px 12px' }}>
        <div style={{ marginBottom:10, padding:'7px 8px', border:`1px solid ${estimatedCount ? C.amberMid : C.border}`, borderRadius:6, background:estimatedCount ? C.amberSoft : C.surface2, ...sans({ fontSize:9.5, color:estimatedCount ? C.amberDark : C.text3, lineHeight:1.4 }) }}>
          {estimatedCount ? 'Estimated proxies use verified Baseball Savant expected-statistic percentiles; they are not official scouting grades. Future grades remain unavailable.' : 'Verified 20–80 scouting grades are not connected for this player. Unsupported attributes remain unavailable.'}
        </div>
        <div className="skip-grade-controls" style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
          <label style={sans({ fontSize:9, color:C.text3 })}>Show <select aria-label="Filter scouting grade attributes" value={filter} onChange={event => setFilter(event.target.value)} style={{ marginLeft:4, padding:'4px 6px', border:`1px solid ${C.border}`, borderRadius:4, background:C.surface, color:C.text, ...sans({ fontSize:9 }) }}><option value="all">All attributes</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>
          <label style={sans({ fontSize:9, color:C.text3 })}>Sort <select aria-label="Sort scouting grade attributes" value={sort} onChange={event => setSort(event.target.value)} style={{ marginLeft:4, padding:'4px 6px', border:`1px solid ${C.border}`, borderRadius:4, background:C.surface, color:C.text, ...sans({ fontSize:9 }) }}><option value="default">Default order</option><option value="attribute">Attribute A–Z</option><option value="current-desc">Current grade high–low</option><option value="current-asc">Current grade low–high</option></select></label>
          <span style={sans({ fontSize:9, color:C.text4, marginLeft:'auto' })}>{visibleRows.length}/{rows.length} shown</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'48px minmax(90px,1fr) 48px minmax(90px,1fr)', gap:'8px 10px', alignItems:'center' }}>
          <div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Tool</div><div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Current</div><div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Note</div><div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Future</div>
          {visibleRows.map(row => <React.Fragment key={row.key}>
            <strong style={sans({ fontSize:10.5, color:C.text })}>{row.label}</strong>
            <div><Scale value={row.current} label={`${row.label} current`} />{row.status === 'estimated' && <div style={sans({ fontSize:8, color:C.amberDark, marginTop:3 })}>Estimated</div>}</div>
            <span style={sans({ fontSize:8.5, color:C.text3, lineHeight:1.3 })}>{row.note}</span>
            <Scale value={row.future} label={`${row.label} future`} />
          </React.Fragment>)}
        </div>
        {!visibleRows.length && <div style={sans({ padding:'14px 0 2px', fontSize:10, color:C.text3, textAlign:'center' })}>No attributes match this filter.</div>}
      </div>
    </Panel>
  );
}
