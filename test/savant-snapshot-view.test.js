import { describe, expect, it } from 'vitest';
import { buildTeamSavantSnapshotRows } from '../client/src/pages/OverviewPage.jsx';

describe('unified Statcast Snapshot view', () => {
  it('formats verified Savant metrics with source-appropriate precision', () => {
    expect(buildTeamSavantSnapshotRows({
      expectedBA: 0.2812,
      expectedSLG: 0.4729,
      expectedWOBA: 0.3514,
      exitVelocity: 89.56,
      hardHitPercent: 43.21,
      barrelPercent: 9.87,
      launchAngle: 12.34,
    }).map(row => row.display)).toEqual([
      '0.281', '0.473', '0.351', '89.6 mph', '43.2%', '9.9%', '12.3°',
    ]);
  });

  it('keeps missing Savant fields explicitly unavailable', () => {
    const rows = buildTeamSavantSnapshotRows({ expectedBA: 0.28, hardHitPercent: null });
    expect(rows.find(row => row.label === 'xBA').display).toBe('0.280');
    expect(rows.find(row => row.label === 'Hard-hit').display).toBe('—');
    expect(rows.find(row => row.label === 'Launch angle').display).toBe('—');
  });
});
