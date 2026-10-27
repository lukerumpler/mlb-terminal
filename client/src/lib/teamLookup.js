import { TEAMS } from '../constants/data.js';

// Alternate abbreviations that appear in MLB, Savant, FanGraphs and
// Baseball-Reference feeds. Everything resolves to the canonical TEAMS abbr.
export const TEAM_ABBR_ALIASES = Object.freeze({
  OAK: 'ATH',
  AZ: 'ARI',
  CHW: 'CWS',
  WAS: 'WSH',
  WSN: 'WSH',
  SDP: 'SD',
  SFG: 'SF',
  TBR: 'TB',
  KCR: 'KC',
});

const TEAM_BY_ABBR = Object.values(TEAMS).reduce((map, team) => {
  map[team.abbr] = team;
  return map;
}, {});

export function canonicalTeamAbbr(abbr) {
  const code = String(abbr || '').trim().toUpperCase();
  return TEAM_ABBR_ALIASES[code] || code;
}

export function getTeamByAbbr(abbr) {
  return TEAM_BY_ABBR[canonicalTeamAbbr(abbr)] || null;
}

export function getTeamLogoUrl(abbr) {
  const team = getTeamByAbbr(abbr);
  return team ? `https://www.mlbstatic.com/team-logos/${team.id}.svg` : null;
}
