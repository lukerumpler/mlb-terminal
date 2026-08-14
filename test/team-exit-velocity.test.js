import { describe, expect, it } from 'vitest';
import { buildExitVelocityBins } from '../client/src/pages/OverviewPage.jsx';

describe('team exit-velocity distribution', () => {
  it('bins verified launch speeds into 5 mph ranges with percentages', () => {
    const bins = buildExitVelocityBins([
      { launch_speed: 91.2 },
      { launch_speed: 92.8 },
      { launch_speed: 97.1 },
      { launch_speed: null },
      { launch_speed: 'not-a-number' },
    ]);

    expect(bins).toEqual([
      { mph: 90, pct: 66.7, count: 2 },
      { mph: 95, pct: 33.3, count: 1 },
    ]);
  });

  it('returns no chart bins when the source has no verified launch speeds', () => {
    expect(buildExitVelocityBins([])).toEqual([]);
    expect(buildExitVelocityBins([{ launch_speed: null }, { launch_speed: '—' }])).toEqual([]);
  });
});
