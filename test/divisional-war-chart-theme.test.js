import { describe, expect, it } from 'vitest';
import { getDivisionalWarFill } from '../client/src/components/OverviewCharts.jsx';
import { C } from '../client/src/constants/colors.js';

describe('divisional WAR chart team theme preview', () => {
  it('uses the selected club accent only for the selected team while peers retain the neutral comparison color', () => {
    const padresAccent = '#78502D';
    expect(getDivisionalWarFill({ team:'SD' }, 'SD', padresAccent)).toBe(padresAccent);
    expect(getDivisionalWarFill({ team:'LAD' }, 'SD', padresAccent)).toBe(C.purple);
  });

  it('keeps the existing teal selection fallback when no club accent is supplied', () => {
    expect(getDivisionalWarFill({ team:'LAD' }, 'LAD')).toBe(C.teal);
  });
});
