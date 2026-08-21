import { describe, expect, it } from 'vitest';
import { buildCrossTeamComparisonRows } from '../client/src/pages/OtherPages.jsx';

describe('all-team comparison data', () => {
  const teams = {
    alpha: { id: 1, abbr: 'ALP', name: 'Alpha Club' },
    bravo: { id: 2, abbr: 'BRV', name: 'Bravo Club' },
    charlie: { id: 3, abbr: 'CHR', name: 'Charlie Club' },
  };

  it('joins numeric team definitions to string provider keys', () => {
    const rows = buildCrossTeamComparisonRows({
      teams,
      teamStats: { hitting: { '1': { ops: '.800' }, '2': { ops: '.700' } }, pitching: {} },
    });
    expect(rows.map(row => row.abbr)).toEqual(['ALP', 'BRV']);
    expect(rows.map(row => row.value)).toEqual([0.8, 0.7]);
  });

  it('excludes teams without the selected metric instead of emitting NaN rows', () => {
    const rows = buildCrossTeamComparisonRows({
      teams,
      teamStats: { hitting: { 1: { ops: '.800' }, 3: { ops: null } }, pitching: {} },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].abbr).toBe('ALP');
    expect(rows.every(row => Number.isFinite(row.value))).toBe(true);
  });

  it('uses team name as a deterministic tie-breaker', () => {
    const rows = buildCrossTeamComparisonRows({
      teams,
      teamStats: { hitting: { 1: { ops: '.750' }, 2: { ops: '.750' } }, pitching: {} },
    });
    expect(rows.map(row => row.name)).toEqual(['Alpha Club', 'Bravo Club']);
  });
});
