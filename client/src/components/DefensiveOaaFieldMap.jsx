import React, { useMemo } from 'react';
import { C, px, sans } from '../constants/colors.js';

const FIELD_POSITIONS = Object.freeze([
  { key:'C', label:'C', x:50, y:84 },
  { key:'1B', label:'1B', x:71, y:61 },
  { key:'2B', label:'2B', x:57, y:48 },
  { key:'SS', label:'SS', x:43, y:48 },
  { key:'3B', label:'3B', x:29, y:61 },
  { key:'LF', label:'LF', x:22, y:27 },
  { key:'CF', label:'CF', x:50, y:16 },
  { key:'RF', label:'RF', x:78, y:27 },
]);

const POSITION_ALIASES = Object.freeze({
  C:'C', CATCHER:'C',
  '1B':'1B', FIRST:'1B', 'FIRST BASE':'1B',
  '2B':'2B', SECOND:'2B', 'SECOND BASE':'2B',
  SS:'SS', SHORTSTOP:'SS',
  '3B':'3B', THIRD:'3B', 'THIRD BASE':'3B',
  LF:'LF', 'LEFT FIELD':'LF', L:'LF',
  CF:'CF', 'CENTER FIELD':'CF',
  RF:'RF', 'RIGHT FIELD':'RF', R:'RF',
});

function canonicalPosition(value) {
  const raw = String(value || '').trim().toUpperCase();
  return POSITION_ALIASES[raw] || null;
}

export function buildPositionOaaMapRows(playerRows = []) {
  const totals = new Map();
  (Array.isArray(playerRows) ? playerRows : []).forEach(row => {
    const position = canonicalPosition(row?.position);
    const oaa = Number(row?.oaa);
    if (!position || !Number.isFinite(oaa)) return;
    const current = totals.get(position) || { oaa:0, players:0 };
    current.oaa += oaa;
    current.players += 1;
    totals.set(position, current);
  });
  return FIELD_POSITIONS.map(position => {
    const total = totals.get(position.key);
    return {
      ...position,
      oaa: total ? Number(total.oaa.toFixed(1)) : null,
      players: total?.players || 0,
    };
  });
}

function oaaColor(value) {
  if (!Number.isFinite(value)) return C.text4;
  if (value > 0) return C.teal;
  if (value < 0) return C.rust;
  return C.amberDark;
}

function formatOaa(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

export default function DefensiveOaaFieldMap({ playerRows = [], status = 'unavailable', source = 'Baseball Savant Statcast OAA leaderboard' }) {
  const rows = useMemo(() => buildPositionOaaMapRows(playerRows), [playerRows]);
  const hasOaa = rows.some(row => Number.isFinite(row.oaa));
  const coveredPositions = rows.filter(row => Number.isFinite(row.oaa));
  if (!hasOaa) {
    return <div role="status" style={sans({padding:'10px 14px 12px',fontSize:9,color:C.text4,lineHeight:1.45})}>
      {status === 'loading' ? 'Loading verified per-position OAA from Baseball Savant.' : 'Per-position OAA is unavailable from the current Baseball Savant response. This field map intentionally does not infer defensive values from roster depth.'}
    </div>;
  }
  return <figure className="skip-defensive-oaa-field-map" aria-labelledby="defensive-oaa-map-caption" style={{margin:0,padding:'8px 12px 11px',borderTop:`0.5px solid ${C.borderLight}`}}>
    <svg viewBox="0 0 100 100" role="img" aria-label={`Defensive value by position map using ${coveredPositions.length} reported OAA position values`} style={{display:'block',width:'100%',maxWidth:300,height:'auto',margin:'0 auto'}}>
      <path d="M50 28 L78 56 L50 84 L22 56 Z" fill="none" stroke={C.border} strokeWidth="1.1" />
      <path d="M50 28 L50 84 M22 56 L78 56" fill="none" stroke={C.borderLight} strokeWidth=".55" strokeDasharray="1.4 1.4" />
      <path d="M29 62 Q50 6 71 62" fill="none" stroke={C.borderLight} strokeWidth=".65" strokeDasharray="1.6 1.6" />
      {rows.map(row => {
        const color = oaaColor(row.oaa);
        const radius = Number.isFinite(row.oaa) ? 7 + Math.min(3, Math.abs(row.oaa)) : 5;
        return <g key={row.key} transform={`translate(${row.x} ${row.y})`}>
          <circle r={radius} fill={Number.isFinite(row.oaa) ? `color-mix(in srgb, ${color} 20%, ${C.surface})` : C.surface2} stroke={color} strokeWidth=".9" />
          <text textAnchor="middle" y="-1" fill={color} fontFamily="DM Mono, monospace" fontSize="4.1" fontWeight="700">{row.label}</text>
          <text textAnchor="middle" y="4" fill={Number.isFinite(row.oaa) ? C.text : C.text4} fontFamily="DM Mono, monospace" fontSize="3.3" fontWeight="700">{formatOaa(row.oaa)}</text>
        </g>;
      })}
    </svg>
    <figcaption id="defensive-oaa-map-caption" style={sans({fontSize:8.8,color:C.text4,lineHeight:1.4,marginTop:4})}>
      Defensive value by position (OAA). Positive is above average; markers show only positions returned by {source}.
    </figcaption>
    <ul aria-label="Per-position Outs Above Average values" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'3px 6px',padding:0,margin:'7px 0 0',listStyle:'none'}}>
      {rows.map(row => <li key={row.key} style={{display:'flex',justifyContent:'space-between',gap:4,...sans({fontSize:8.5,color:Number.isFinite(row.oaa) ? C.text2 : C.text4})}}><span>{row.label}</span><strong style={px({fontSize:8.5,color:oaaColor(row.oaa)})}>{formatOaa(row.oaa)}</strong></li>)}
    </ul>
  </figure>;
}
