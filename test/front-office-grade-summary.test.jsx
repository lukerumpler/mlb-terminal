import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFrontOfficeEvaluationViewModel, buildFrontOfficeGradeSummary, FrontOfficeGradeCards, FrontOfficeScoreRingPreview, getEvaluationPresentation, resolveMetricProviderStatus } from '../client/src/pages/OverviewPage.jsx';

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
    expect(screen.getByRole('button', { name: /Overall.*4\.30/i })).toHaveStyle({ minHeight: '62px' });
    expect(screen.getByTitle(/Offense 45%, Pitching 40%, Defense 10%, Baserunning 5%/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /overall/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Weighted current-performance score from defense/i);
    fireEvent.click(screen.getByRole('button', { name: /defense/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/not Statcast OAA/i);
  });

  it('shows an Overall score direction only after a comparable team score changes', () => {
    window.localStorage.clear();
    const grades = [{ label: 'Offense', grade: 'B', color: '#008080', detail: 'Verified.' }];
    const { rerender } = render(<FrontOfficeGradeCards grades={grades} teamKey="SFG" overall={{ grade: 'B', points: 3, detail: 'Initial score.' }} />);
    expect(screen.queryByLabelText(/Overall score (increased|decreased)/i)).not.toBeInTheDocument();

    rerender(<FrontOfficeGradeCards grades={grades} teamKey="SFG" overall={{ grade: 'B+', points: 3.2, detail: 'Improved score.' }} />);
    expect(screen.getByLabelText(/Overall score increased by 0\.20/i)).toHaveTextContent('↑');

    rerender(<FrontOfficeGradeCards grades={grades} teamKey="SFG" overall={{ grade: 'B', points: 3, detail: 'Reduced score.' }} />);
    expect(screen.getByLabelText(/Overall score decreased by 0\.20/i)).toHaveTextContent('↓');
  });

  it('labels absent FanGraphs WAR components as a coverage gap while preserving a real zero', () => {
    expect(resolveMetricProviderStatus(null, 'provider-blocked')).toBe('coverage-gap');
    expect(resolveMetricProviderStatus(undefined, 'unavailable')).toBe('coverage-gap');
    expect(resolveMetricProviderStatus(0, 'cached')).toBe('cached');
  });

  it('offers a query-parameter-isolated ScoreRing that preserves the canonical grade, scale, and calculation detail', () => {
    const grades = [
      { label: 'Offense', grade: 'A', color: '#c68a1d', detail: 'Verified team offense input.' },
      { label: 'Pitching', grade: 'A', color: '#a84937', detail: 'Verified team pitching input.' },
      { label: 'Defense', grade: 'A', color: '#157a6e', detail: 'Verified roster defense input.' },
      { label: 'Baserunning', grade: 'A', color: '#157a6e', detail: 'Verified baserunning input.' },
      { label: 'Depth', grade: 'A', color: '#58606f', detail: 'Verified organization depth input.' },
      { label: 'Future Value', grade: 'A', color: '#7656a8', detail: 'Verified prospect input.' },
    ];
    const overall = { grade: 'A', points: 4.03, detail: 'Canonical weighted team evaluation.' };
    const onActiveLabelChange = vi.fn();

    expect(getEvaluationPresentation('?evaluationView=score-ring')).toBe('score-ring');
    expect(getEvaluationPresentation('?evaluationView=other')).toBe('baseline');
    expect(buildFrontOfficeEvaluationViewModel({ teamName: 'Los Angeles Dodgers', grades, overall })).toMatchObject({
      overallGrade: 'A', overallRating: 4.03, ratingScaleMax: 4.3, normalizedScore: 94, status: 'available',
    });
    expect(buildFrontOfficeEvaluationViewModel({ teamName: 'No Data', grades: [], overall: buildFrontOfficeGradeSummary([]) })).toMatchObject({
      overallGrade: '—', normalizedScore: null, status: 'unavailable',
    });

    const { rerender, container } = render(<FrontOfficeScoreRingPreview teamName="Los Angeles Dodgers" grades={grades} overall={overall} teamKey="LAD" activeLabel={null} onActiveLabelChange={onActiveLabelChange} />);
    const overallButton = screen.getByRole('button', { name: /show overall calculation details: a, 4\.03 out of 4\.30/i });
    expect(screen.getByText('94')).toBeInTheDocument();

    fireEvent.click(overallButton);
    expect(onActiveLabelChange).toHaveBeenLastCalledWith('Overall');
    rerender(<FrontOfficeScoreRingPreview teamName="Los Angeles Dodgers" grades={grades} overall={overall} teamKey="LAD" activeLabel="Overall" onActiveLabelChange={onActiveLabelChange} />);
    expect(within(container).getByRole('tooltip')).toHaveTextContent('Canonical weighted team evaluation.');

    overallButton.focus();
    fireEvent.keyDown(overallButton, { key: 'Escape' });
    expect(onActiveLabelChange).toHaveBeenLastCalledWith(null);
    expect(overallButton).toHaveFocus();
  });
});
