import { C } from '../constants/colors.js';

// A few official club colors are intentionally very dark. They work well as
// uniforms or broad fills but become muddy when used as 10–12px foreground
// text on this dashboard's warm surfaces. These display-safe variants retain
// the team family while keeping team labels, focus rings, and data accents
// legible. They never alter source data or official logos.
const DISPLAY_SAFE_TEAM_ACCENTS = Object.freeze({
  ATH: '#146A58',
  COL: '#4B497D',
  DET: '#214A6A',
  HOU: '#1A4C79',
  PIT: '#5D5547',
  SD: '#78502D',
});

export function getTeamAccent(teamOrAbbr, fallback = C.amber) {
  const team = typeof teamOrAbbr === 'object' ? teamOrAbbr : null;
  const abbr = String(team?.abbr || teamOrAbbr || '').toUpperCase();
  const color = DISPLAY_SAFE_TEAM_ACCENTS[abbr] || team?.color || fallback;
  return typeof color === 'string' && color.trim() ? color : fallback;
}

export function getDisplaySafeTeamAccent(abbr, fallback = C.amber) {
  return getTeamAccent(String(abbr || '').toUpperCase(), fallback);
}
