import { describe, expect, it } from 'vitest';
import { mergeLahmanCareerGaps } from '../client/src/api/mlb.js';

describe('mergeLahmanCareerGaps', () => {
  it('fills a season the live API has no row for at all', () => {
    const live = [{ season: '2022', stat: { atBats: 500 } }, { season: '2024', stat: { atBats: 480 } }];
    const lahman = [{ season: '2022', stat: { atBats: 999 } }, { season: '2023', stat: { atBats: 450 } }];
    const merged = mergeLahmanCareerGaps(live, lahman);
    expect(merged.map(r => r.season)).toEqual(['2022', '2023', '2024']);
    expect(merged.find(r => r.season === '2022').stat.atBats).toBe(500);
    expect(merged.find(r => r.season === '2023').stat.atBats).toBe(450);
  });

  it('never overwrites a season the live API already returned, even an empty stat line', () => {
    const live = [{ season: '2019', stat: {} }];
    const lahman = [{ season: '2019', stat: { atBats: 600 } }];
    const merged = mergeLahmanCareerGaps(live, lahman);
    expect(merged).toHaveLength(1);
    expect(merged[0].stat).toEqual({});
  });

  it('returns live rows unchanged when no Lahman rows are available', () => {
    const live = [{ season: '2024', stat: { atBats: 480 } }];
    expect(mergeLahmanCareerGaps(live, [])).toBe(live);
    expect(mergeLahmanCareerGaps(live, null)).toBe(live);
  });

  it('treats a missing live array as empty and sorts the merged result chronologically', () => {
    const lahman = [{ season: '2022', stat: {} }, { season: '2005', stat: { atBats: 300 } }];
    expect(mergeLahmanCareerGaps(null, lahman).map(row => row.season)).toEqual(['2005', '2022']);
  });
});
