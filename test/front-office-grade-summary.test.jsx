import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildFrontOfficeGradeSummary, FrontOfficeGradeCards, resolveMetricProviderStatus } from '../client/src/pages/OverviewPage.jsx';

describe('Front Office Overall grade', () => {
  it('weights current performance and applies the approved capped organization-outlook nudge', () => {
    const summary = buildFrontOfficeGradeSummary([
      { label: 'Offense', grade: 'C' },
      { label: 'Pitching', grade: 'B' },
      { label: 'Defense', grade: 'A+' },
      { label: 'Baserunning', grade: 'A' },
      { label: 'Depth', grade: 'A+' },
      { label: 'Future Value', grade: 'B' },
    ]);
    expect(summary).toMatchObject({ grade: 'B', points: 2.87, corePoints: 2.73, outlookPoints: 3.65, componentCount: 6 });
    expect(summary.detail).toMatch(/moves it 15% toward the organization outlook average/i);
  });

  it('rebalances only available core facets and never lets outlook create an Overall grade by itself', () => {
    const partialCore = buildFrontOfficeGradeSummary([
      { label: 'Offense', grade: 'A+' },
      { label: 'Pitching', grade: 'A-' },
      { label: 'Depth', grade: '—' },
    ]);
    expect(partialCore).toMatchObject({ grade: 'A', points: 4.02, corePoints: 4.02, outlookPoints: null, componentCount: 2 });
    expect(partialCore.detail).toMatch(/reweighted to 100%/i);

    const noCore = buildFrontOfficeGradeSummary([
      { label: 'Depth', grade: 'A+' },
      { label: 'Future Value', grade: 'A' },
    ]);
    expect(noCore).toMatchObject({ grade: '—', componentCount: 0, corePoints: null, outlookPoints: null });
    expect(noCore.detail).toMatch(/no verified current-performance grades/i);
  });

  it('explains both the Overall calculation and a component limitation through keyboard-accessible controls', () => {
    const grades = [{ label: 'Defense', grade: 'A+', color: '#008080', detail: 'Calculated from verified active-roster position coverage; it is not Statcast OAA.' }];
    render(<FrontOfficeGradeCards grades={grades} overall={buildFrontOfficeGradeSummary(grades)} />);
    expect(screen.getByRole('button', { name: /Overall.*4\.30/i })).toBeInTheDocument();
    expect(screen.getByText('4.30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /overall/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Weighted current-performance score from defense/i);
    fireEvent.click(screen.getByRole('button', { name: /defense/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/not Statcast OAA/i);
  });

  it('labels absent FanGraphs WAR components as a coverage gap while preserving a real zero', () => {
    expect(resolveMetricProviderStatus(null, 'provider-blocked')).toBe('coverage-gap');
    expect(resolveMetricProviderStatus(undefined, 'unavailable')).toBe('coverage-gap');
    expect(resolveMetricProviderStatus(0, 'cached')).toBe('cached');
  });
});
