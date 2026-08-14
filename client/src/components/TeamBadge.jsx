import React from 'react';
import { C, px } from '../constants/colors.js';
import { useLowDataMode } from '../lib/lowData.js';

export default function TeamBadge({ teamId, teamAbbr, teamColor = C.amber, size = 24, label } = {}) {
  const lowDataMode = useLowDataMode();
  const accessibleLabel = label || teamAbbr || 'Team logo unavailable';
  if (!teamId || lowDataMode) {
    return <span aria-label={lowDataMode ? `${accessibleLabel} logo hidden in Low Data Mode` : accessibleLabel} title={accessibleLabel} style={{ width:size, height:size, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:Math.max(4, Math.round(size * .18)), background:`color-mix(in srgb, ${teamColor} 14%, ${C.surface3})`, border:`1px solid color-mix(in srgb, ${teamColor} 35%, ${C.border})`, color:teamColor, flexShrink:0, ...px({ fontSize:Math.max(8, Math.round(size * .34)), fontWeight:800 }) }}>{teamAbbr || '—'}</span>;
  }
  return <img src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`} alt={accessibleLabel} title={accessibleLabel} width={size} height={size} loading="lazy" style={{ width:size, height:size, objectFit:'contain', flexShrink:0, filter:`drop-shadow(0 1px 1px color-mix(in srgb, ${teamColor} 22%, transparent))` }} />;
}
