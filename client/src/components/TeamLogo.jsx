import React, { useEffect, useState } from 'react';
import { TEAMS } from '../constants/data.js';
import { C, sans } from '../constants/colors.js';
import { useLowDataMode } from '../lib/lowData.js';

const TEAM_BY_ABBR = Object.values(TEAMS).reduce((map, team) => {
  map[team.abbr] = team;
  return map;
}, {});

export default function TeamLogo({ abbr, size = 28, showFallback = true, className = '' }) {
  const lowDataMode = useLowDataMode();
  const [failed, setFailed] = useState(false);
  const code = String(abbr || '').toUpperCase();
  const team = TEAM_BY_ABBR[code];

  // Reset the failure flag when the logo we're pointed at actually changes
  // (e.g. switching selected team), so a prior 404 doesn't stick around and
  // permanently hide a different team's logo that would otherwise load fine.
  useEffect(() => { setFailed(false); }, [team?.id]);

  if (!code && !showFallback) return null;
  if (!team || lowDataMode || failed) {
    if (!showFallback) return null;
    const label = team ? (failed ? `${team.name} logo unavailable` : `${team.name} logo hidden in Low Data Mode`) : (code || 'Team unavailable');
    return (
      <span className={className} aria-label={label} title={team ? label : undefined} style={{ ...sans({ fontSize: Math.max(9, size * 0.42), fontWeight: 800, color: C.text3 }), width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: Math.round(size * 0.22), background: C.surface3, flexShrink: 0 }}>
        {code || '—'}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
      alt={`${team.name} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}
