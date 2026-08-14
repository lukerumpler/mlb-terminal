import React from 'react';
import { TEAMS } from '../constants/data.js';
import { C, sans } from '../constants/colors.js';

const TEAM_BY_ABBR = Object.values(TEAMS).reduce((map, team) => {
  map[team.abbr] = team;
  return map;
}, {});

export default function TeamLogo({ abbr, size = 28, showFallback = true, className = '' }) {
  const code = String(abbr || '').toUpperCase();
  const team = TEAM_BY_ABBR[code];
  if (!code && !showFallback) return null;
  if (!team) {
    return showFallback ? (
      <span className={className} aria-label={code || 'Team unavailable'} style={{ ...sans({ fontSize: Math.max(9, size * 0.42), fontWeight: 800, color: C.text3 }), width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: Math.round(size * 0.22), background: C.surface3, flexShrink: 0 }}>
        {code || '—'}
      </span>
    ) : null;
  }

  return (
    <img
      className={className}
      src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
      alt={`${team.name} logo`}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}
