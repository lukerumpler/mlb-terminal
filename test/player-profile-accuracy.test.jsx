import { describe, expect, it } from 'vitest';
import {
  formatProfileMetric,
  getLivePerformanceItems,
} from '../client/src/pages/PlayersPage.jsx';
import { computeAMD } from '../client/src/engine/skip.js';
import { selectSeasonSplit } from '../client/src/api/mlb.js';

describe('player profile data accuracy guards', () => {
  it('renders missing advanced metrics as unavailable and preserves real zeroes', () => {
    const empty = getLivePerformanceItems({});
    expect(empty).toHaveLength(7);
    expect(empty.every(item => item.val === '—')).toBe(true);

    const values = getLivePerformanceItems({
      avg_hit_speed: 0,
      launch_angle_avg: 12.34,
      sweet_spot_percent: 0,
      brl_percent: 7.8,
      hard_hit_percent: 0,
      oz_swing_percent: 28.2,
      z_contact_percent: 86.4,
    });
    expect(values.map(item => item.val)).toEqual([
      '0.0 mph', '12.3°', '0.0%', '7.8%', '0.0%', '28.2%', '86.4%',
    ]);
  });

  it('does not convert invalid or empty metric values into proxy numbers', () => {
    expect(formatProfileMetric(undefined, 1, ' mph')).toBe('—');
    expect(formatProfileMetric('', 1, '%')).toBe('—');
    expect(formatProfileMetric('not-a-number', 3)).toBe('—');
    expect(formatProfileMetric(0, 3)).toBe('0.000');
  });

  it('prefers a current-sport aggregate split over an arbitrary team split', () => {
    const split = selectSeasonSplit([
      { sport: { id: 1 }, team: { id: 147 }, stat: { ops: '.900' } },
      { sport: { id: 1 }, isTotal: true, stat: { ops: '1.050' } },
      { sport: { id: 12 }, isTotal: true, stat: { ops: '.700' } },
    ], 1);
    expect(split.stat.ops).toBe('1.050');

    const milbSplit = selectSeasonSplit([
      { sport: { id: 12 }, team: { id: 120 }, stat: { era: '3.50' } },
      { sport: { id: 12 }, team: { id: 121 }, stat: { era: '4.10' } },
    ], 12);
    expect(milbSplit.team.id).toBe(120);
  });

  it('requires complete valid bat-tracking inputs before computing AMD/IMD', () => {
    expect(computeAMD({ avg_bat_speed: 72 })).toBeNull();
    expect(computeAMD({
      squared_up_per_swing: '',
      blast_per_swing: 0,
      swings_competitive: 100,
      swords: 5,
    })).toBeNull();
    expect(computeAMD({
      squared_up_per_swing: 0.32,
      blast_per_swing: 0.06,
      swings_competitive: 100,
      swords: 8,
      avg_bat_speed: 72,
    })).toMatchObject({
      amdPlus: expect.any(Number),
      imdPlus: expect.any(Number),
      batSpeed: 72,
    });
  });
});
