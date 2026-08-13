import { describe, expect, it } from 'vitest';
import {
  formatProfileMetric,
  getLivePerformanceItems,
  metricPopulationPercentile,
  buildSavantPercentileAxes,
  normalizeSprayPoint,
} from '../client/src/pages/PlayersPage.jsx';
import { computeAMD } from '../client/src/engine/skip.js';
import { selectSeasonSplit } from '../client/src/api/mlb.js';
import { percentileLabel } from '../client/src/lib/percentile.js';

describe('player profile data accuracy guards', () => {
  it('formats percentile labels with the correct ordinal suffix', () => {
    expect([92, 93, 98, 99, 100].map(percentileLabel)).toEqual(['92nd', '93rd', '98th', '99th', '100th']);
    expect(percentileLabel(null)).toBe('—');
  });

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

  it('normalizes Baseball Savant spray coordinates to a realistic field plot', () => {
    expect(normalizeSprayPoint({ hc_x: 125, hc_y: 198, events: 'field_out' })).toMatchObject({ cx: 70, cy: 80, color: expect.any(String) });
    const pulled = normalizeSprayPoint({ hc_x: 40, hc_y: 30, events: 'home_run' });
    expect(pulled.cx).toBeLessThan(20);
    expect(pulled.cy).toBeGreaterThan(15);
    expect(pulled.color).toBeTruthy();
    expect(normalizeSprayPoint({ intercept_ball_minus_batter_pos_x_inches: 4 })).toBeNull();
  });

  it('does not convert invalid or empty metric values into proxy numbers', () => {
    expect(formatProfileMetric(undefined, 1, ' mph')).toBe('—');
    expect(formatProfileMetric('', 1, '%')).toBe('—');
    expect(formatProfileMetric('not-a-number', 3)).toBe('—');
    expect(formatProfileMetric(0, 3)).toBe('0.000');
  });

  it('maps raw Savant values to percentile widths and preserves a 99th-percentile xSLG', () => {
    const expected = Array.from({ length: 100 }, (_, i) => ({ est_slg: 0.400 + i * 0.002 }));
    const axes = buildSavantPercentileAxes({
      savant: { est_woba: 0.500, est_slg: 0.598, avg_hit_speed: 95, whiff_percent: 20, oz_swing_percent: 20 },
      expectedStatisticsPopulation: expected,
      statcastPopulation: [
        { avg_hit_speed: 80, whiff_percent: 30, oz_swing_percent: 40 },
        { avg_hit_speed: 90, whiff_percent: 25, oz_swing_percent: 30 },
        { avg_hit_speed: 95, whiff_percent: 20, oz_swing_percent: 20 },
      ],
      batTrackingPopulation: [],
      batTracking: { avg_bat_speed: 75 },
    }, false);

    const xslg = axes.find(row => row.axis === 'xSLG');
    expect(xslg.rawLabel).toBe('0.598');
    expect(xslg.pct).toBe(99);
    expect(xslg.pct).not.toBe(Math.round(xslg.raw * 100));
    expect(metricPopulationPercentile(90, [{ value: 70 }, { value: 80 }, { value: 90 }], ['value'], false)).toBe(0);
  });

  it('does not create a percentile radar from missing Savant populations', () => {
    expect(buildSavantPercentileAxes({ savant: { est_slg: 0.600 } }, false)).toEqual([]);
    expect(formatProfileMetric(0.598, 3)).toBe('0.598');
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
