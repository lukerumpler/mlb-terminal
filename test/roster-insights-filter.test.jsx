import { describe, expect, it } from 'vitest';
import { buildRosterRows, rosterStatValue } from '../client/src/pages/OverviewPage.jsx';

const players = {
  hitting: [
    { id: 1, name: 'Slugger', position: '1B', stat: { ops: '.920', homeRuns: 32, avg: '.285', plateAppearances: 320 } },
    { id: 2, name: 'Runner', position: 'CF', stat: { ops: '.760', homeRuns: 8, avg: '.310', plateAppearances: 90 } },
  ],
  pitching: [
    { id: 3, name: 'Ace', position: 'SP', stat: { era: '2.90', whip: '1.04', strikeOuts: 145, inningsPitched: 72 } },
    { id: 4, name: 'Reliever', position: 'RP', stat: { era: '3.80', whip: '1.20', strikeOuts: 62, inningsPitched: 18 } },
  ],
};

describe('roster insights filters', () => {
  it('filters by position and sorts hitters by a selected stat descending', () => {
    const rows = buildRosterRows(players, 'all', 'homeRuns');
    expect(rows.map(row => row.name)).toEqual(['Slugger', 'Runner']);
    expect(rosterStatValue(rows[0], 'homeRuns')).toBe(32);
  });

  it('filters to multiple positions and sorts pitching metrics in the lower-is-better direction', () => {
    const rows = buildRosterRows(players, ['SP', 'RP'], 'era', 0, 0);
    expect(rows.map(row => row.name)).toEqual(['Ace', 'Reliever']);
    expect(rosterStatValue(rows[0], 'era')).toBe(2.9);
  });

  it('keeps hitter and pitcher result sets separated by the selected stat family', () => {
    const rows = buildRosterRows(players, 'all', 'strikeOuts', 0, 30);
    expect(rows.map(row => row.name)).toEqual(['Ace']);
  });

  it('excludes low-sample batting outliers when a PA threshold is selected', () => {
    const rows = buildRosterRows(players, [], 'ops', 150, 0);
    expect(rows.map(row => row.name)).toEqual(['Slugger']);
  });
});
