import React from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from './atoms.jsx';

export const SCOUTING_GRADE_PREVIEW_ROWS = [
  { key:'hit', label:'Hit', current:null, future:null, note:'Contact quality' },
  { key:'power', label:'Power', current:null, future:null, note:'Game power' },
  { key:'run', label:'Run', current:null, future:null, note:'Speed / athleticism' },
  { key:'arm', label:'Arm', current:null, future:null, note:'Arm strength' },
  { key:'field', label:'Field', current:null, future:null, note:'Defensive actions' },
];

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

export default function ScoutingGradesPreview({ title = '20–80 Scouting Grades' }) {
  return (
    <Panel title={title} accent={C.teal} badge="PREVIEW ONLY">
      <div style={{ padding:'10px 14px 12px' }}>
        <div style={{ marginBottom:10, padding:'7px 8px', border:`1px solid ${C.amberMid}`, borderRadius:6, background:C.amberSoft, ...sans({ fontSize:9.5, color:C.amberDark, lineHeight:1.4 }) }}>
          Layout preview only. Verified scouting grades are not connected, so no player grade is displayed.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'48px minmax(90px,1fr) 48px minmax(90px,1fr)', gap:'8px 10px', alignItems:'center' }}>
          <div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Tool</div>
          <div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Current</div>
          <div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Note</div>
          <div style={px({ fontSize:8, color:C.text4, textTransform:'uppercase' })}>Future</div>
          {SCOUTING_GRADE_PREVIEW_ROWS.map(row => (
            <React.Fragment key={row.key}>
              <strong style={sans({ fontSize:10.5, color:C.text })}>{row.label}</strong>
              <Scale value={row.current} label={`${row.label} current`} />
              <span style={sans({ fontSize:8.5, color:C.text3, lineHeight:1.3 })}>{row.note}</span>
              <Scale value={row.future} label={`${row.label} future`} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </Panel>
  );
}
