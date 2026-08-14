import { C } from '../constants/colors.js';

export function getTeamAccent(teamOrAbbr, fallback = C.amber) {
  const team = typeof teamOrAbbr === 'object' ? teamOrAbbr : null;
  const color = team?.color || fallback;
  return typeof color === 'string' && color.trim() ? color : fallback;
}
