import { describe, expect, it } from 'vitest';
import { buildRosterRows, rosterStatValue } from '../client/src/pages/OverviewPage.jsx';

const players = {
  hitting: [
    { id: 1, name: 'Slugger', position: '1B', stat: { ops: '.920', homeRuns: 32, avg: '.285' } },
    { id: 2, name: 'Runner', position: 'CF', stat: { ops: '.760', homeRuns: 8, avg: '.310' } },
  ],
  pitching: [
    { id: 3, name: 'Ace', position: 'SP', stat: { era: '2.90', whip: '1.04', strikeOuts: 145 } },
    { id: 4, name: 'Reliever', position: 'RP', stat: { era: '3.80', whip: '1.20', strikeOuts: 62 } },
  ],
};

describe('roster insights filters', () => {
  it('filters by position and sorts hitters by a selected stat descending', () => {
    const rows = buildRosterRows(players, 'all', 'homeRuns');
    expect(rows.map(row => row.name)).toEqual(['Slugger', 'Runner']);
    expect(rosterStatValue(rows[0], 'homeRuns')).toBe(32);
  });

  it('filters to a position and sorts pitching metrics in the lower-is-better direction', () => {
    const rows = buildRosterRows(players, 'SP', 'era');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ace');
    expect(rosterStatValue(rows[0], 'era')).toBe(2.9);
  });

  it('keeps hitter and pitcher result sets separated by the selected stat family', () => {
    const rows = buildRosterRows(players, 'all', 'strikeOuts');
    expect(rows.map(row => row.name)).toEqual(['Ace', 'Reliever']);
  });
});
