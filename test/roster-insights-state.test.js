import { describe, expect, it } from 'vitest';
import { shouldResetRosterInsightsState } from '../client/src/lib/rosterInsightsState.js';

describe('roster insights state reset guard', () => {
  it('does not reset for the repeated effect pass of the same team', () => {
    expect(shouldResetRosterInsightsState('LAD', 'LAD')).toBe(false);
  });

  it('resets when the selected team changes', () => {
    expect(shouldResetRosterInsightsState('LAD', 'SEA')).toBe(true);
    expect(shouldResetRosterInsightsState('', 'LAD')).toBe(true);
  });
});

