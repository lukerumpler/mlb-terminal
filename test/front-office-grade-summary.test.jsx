import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildFrontOfficeGradeSummary, FrontOfficeGradeCards, resolveMetricProviderStatus } from '../client/src/pages/OverviewPage.jsx';

describe('Front Office Overall grade', () => {
  it('averages only available component grades and never invents a neutral score for unavailable components', () => {
    const summary = buildFrontOfficeGradeSummary([
      { label: 'Offense', grade: 'A+' },
      { label: 'Pitching', grade: 'A-' },
      { label: 'Depth', grade: '—' },
    ]);
    expect(summary).toMatchObject({ grade: 'A', componentCount: 2, averagePoints: 7 });
    expect(summary.detail).toMatch(/Unavailable components are excluded/i);
  });

  it('explains both the Overall calculation and a component limitation through keyboard-accessible controls', () => {
    const grades = [{ label: 'Defense', grade: 'A+', color: '#008080', detail: 'Calculated from verified active-roster position coverage; it is not Statcast OAA.' }];
    render(<FrontOfficeGradeCards grades={grades} overall={buildFrontOfficeGradeSummary(grades)} />);
    fireEvent.click(screen.getByRole('button', { name: /overall/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Arithmetic average of 1 available component grade/i);
    fireEvent.click(screen.getByRole('button', { name: /defense/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/not Statcast OAA/i);
  });

  it('labels absent FanGraphs WAR components as a coverage gap while preserving a real zero', () => {
    expect(resolveMetricProviderStatus(null, 'provider-blocked')).toBe('coverage-gap');
    expect(resolveMetricProviderStatus(undefined, 'unavailable')).toBe('coverage-gap');
    expect(resolveMetricProviderStatus(0, 'cached')).toBe('cached');
  });
});
