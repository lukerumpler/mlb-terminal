import { describe, expect, it } from 'vitest';
import { getMlbRecentDateRange } from '../client/src/api/mlb.js';

describe('official MLB recent player-stat date ranges', () => {
  it('uses the Eastern baseball day and returns exactly fourteen inclusive calendar days', () => {
    expect(getMlbRecentDateRange(14, new Date('2026-08-21T03:30:00.000Z'))).toEqual({
      startDate: '2026-08-07',
      endDate: '2026-08-20',
    });
  });

  it('never widens an invalid request below one official baseball day', () => {
    expect(getMlbRecentDateRange(0, new Date('2026-08-21T03:30:00.000Z'))).toEqual({
      startDate: '2026-08-20',
      endDate: '2026-08-20',
    });
  });
});
