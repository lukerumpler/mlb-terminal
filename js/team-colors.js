// js/team-colors.js — Team color theming
const TEAM_COLORS = {
  108: { primary: '#BA0021', secondary: '#003263' }, // Angels
  109: { primary: '#A71930', secondary: '#E3D4AD' }, // D-backs
  110: { primary: '#DF4601', secondary: '#000000' }, // Orioles
  111: { primary: '#BD3039', secondary: '#0C2340' }, // Red Sox
  112: { primary: '#0E3386', secondary: '#CC3433' }, // Cubs
  113: { primary: '#C6011F', secondary: '#000000' }, // Reds
  114: { primary: '#E31937', secondary: '#002B5C' }, // Guardians
  115: { primary: '#33006F', secondary: '#C4CED4' }, // Rockies
  116: { primary: '#0C2340', secondary: '#FA4616' }, // Tigers
  117: { primary: '#EB6E1F', secondary: '#002D62' }, // Astros
  118: { primary: '#174885', secondary: '#C09A5B' }, // Royals
  119: { primary: '#005A9C', secondary: '#EF3E42' }, // Dodgers
  120: { primary: '#AB0003', secondary: '#14225A' }, // Nationals
  121: { primary: '#002D72', secondary: '#FF5910' }, // Mets
  133: { primary: '#003831', secondary: '#EFB21E' }, // Athletics
  134: { primary: '#FDB827', secondary: '#27251F' }, // Pirates
  135: { primary: '#2F241D', secondary: '#FFC52F' }, // Padres
  136: { primary: '#0C2C56', secondary: '#005C5C' }, // Mariners
  137: { primary: '#FD5A1E', secondary: '#27251F' }, // Giants
  138: { primary: '#C41E3A', secondary: '#FEDB00' }, // Cardinals
  139: { primary: '#092C5C', secondary: '#8FBCE6' }, // Rays
  140: { primary: '#003278', secondary: '#C0111F' }, // Rangers
  141: { primary: '#134A8E', secondary: '#1D2D5C' }, // Blue Jays
  142: { primary: '#002B5C', secondary: '#D31145' }, // Twins
  143: { primary: '#E81828', secondary: '#002D72' }, // Phillies
  144: { primary: '#CE1141', secondary: '#13274F' }, // Braves
  145: { primary: '#27251F', secondary: '#C4CED4' }, // White Sox
  146: { primary: '#00A3E0', secondary: '#FF6600' }, // Marlins
  147: { primary: '#003087', secondary: '#E4002C' }, // Yankees
  158: { primary: '#12284B', secondary: '#FFC52F' }, // Brewers
};

function updateThemeColors(teamId) {
  const colors = TEAM_COLORS[teamId];
  if (!colors) return;

  document.documentElement.style.setProperty('--orange',     colors.primary);
  document.documentElement.style.setProperty('--orange-dim', colors.primary + '26'); // ~15% opacity
  document.documentElement.style.setProperty('--blue-bright', colors.secondary);
}
