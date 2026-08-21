import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFrontOfficeEvaluationViewModel, buildFrontOfficeGradeSummary, deriveBaserunningGrade, deriveFrontOfficeCoverageGrades, deriveOrganizationFutureValue, FrontOfficeGradeCards, FrontOfficeScoreRingPreview, getEvaluationPresentation, resolveMetricProviderStatus } from '../client/src/pages/OverviewPage.jsx';

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

describe('Front Office targeted facet integrity', () => {
  it('requires a meaningful steal-attempt sample and favors rate-normalized opportunity plus success efficiency', () => {
    const insufficient = deriveBaserunningGrade({ stolenBases: 4, caughtStealing: 2, plateAppearances: 240 });
    expect(insufficient).toMatchObject({ percentile: null, status: 'insufficient-sample', attempts: 6, minimumAttempts: 8 });

    const qualified = deriveBaserunningGrade({
      stolenBases: 20,
      caughtStealing: 4,
      plateAppearances: 600,
      comparisonRows: [
        { stolenBases: 12, caughtStealing: 4, plateAppearances: 600 },
        { stolenBases: 18, caughtStealing: 8, plateAppearances: 600 },
        { stolenBases: 25, caughtStealing: 10, plateAppearances: 600 },
      ],
    });
    expect(qualified).toMatchObject({ status: 'verified-rate', attempts: 24, opportunityMetric: 'stolen bases per 600 PA' });
    expect(qualified.percentile).toBeGreaterThan(qualified.volumePercentile);
  });

  it('keeps the verified stolen-base model functional without Statcast, then blends optional team sprint speed and extra-base-taken context transparently', () => {
    const baseInput = {
      stolenBases: 20,
      caughtStealing: 4,
      plateAppearances: 600,
      comparisonRows: [
        { stolenBases: 12, caughtStealing: 4, plateAppearances: 600 },
        { stolenBases: 18, caughtStealing: 8, plateAppearances: 600 },
        { stolenBases: 25, caughtStealing: 10, plateAppearances: 600 },
      ],
    };
    const baseline = deriveBaserunningGrade(baseInput);
    const enhanced = deriveBaserunningGrade({ ...baseInput, sprintSpeedPercentile: 90, extraBasesTakenPercentile: 10 });
    const sprintOnly = deriveBaserunningGrade({ ...baseInput, sprintSpeedPercentile: 90 });

    expect(baseline).toMatchObject({ statcastInputCount: 0, modelWeights: { stolenBaseModel: 100, sprintSpeed: 0, extraBasesTaken: 0 } });
    expect(enhanced).toMatchObject({ statcastInputCount: 2, modelWeights: { stolenBaseModel: 50, sprintSpeed: 25, extraBasesTaken: 25 } });
    expect(enhanced.percentile).toBe(Math.round(baseline.percentile * 0.5 + 90 * 0.25 + 10 * 0.25));
    expect(sprintOnly).toMatchObject({ statcastInputCount: 1, modelWeights: { stolenBaseModel: 75, sprintSpeed: 25, extraBasesTaken: 0 } });
    expect(sprintOnly.percentile).toBe(Math.round(baseline.percentile * 0.75 + 90 * 0.25));
  });

  it('withholds a defense performance grade until comparable Statcast OAA is present, then makes OAA the primary signal', () => {
    const players = {
      hitting: [
        { position: 'C', stat: { plateAppearances: 80 } }, { position: '1B', stat: { plateAppearances: 80 } },
        { position: '2B', stat: { plateAppearances: 80 } }, { position: '3B', stat: { plateAppearances: 80 } },
        { position: 'SS', stat: { plateAppearances: 80 } }, { position: 'LF', stat: { plateAppearances: 80 } },
        { position: 'CF', stat: { plateAppearances: 80 } }, { position: 'RF', stat: { plateAppearances: 80 } },
      ],
      pitching: [{ position: 'P', stat: { inningsPitched: 40 } }, { position: 'P', stat: { inningsPitched: 40 } }],
    };
    const awaitingOaa = deriveFrontOfficeCoverageGrades({ players, liveDataMode: 'live', teamAbbr: 'LAD' });
    expect(awaitingOaa).toMatchObject({ defensePct: null, defenseStatus: 'awaiting-statcast', depthStatus: 'verified' });

    const verified = deriveFrontOfficeCoverageGrades({ players, liveDataMode: 'live', teamAbbr: 'LAD', oaaPercentile: 90, oaaPopulationCount: 30 });
    expect(verified).toMatchObject({ defenseStatus: 'verified', oaaPercentile: 90, oaaPopulationCount: 30, workloadCoveragePct: 100 });
    expect(verified.defensePct).toBeGreaterThan(80);
    expect(verified.depthPct).toBeGreaterThan(verified.rosterDepthPct);
  });

  it('reports official non-pitcher fielding innings as a coverage-only context without changing the OAA-first defense model', () => {
    const players = {
      hitting: [
        { position: 'C', stat: { plateAppearances: 80 } }, { position: '1B', stat: { plateAppearances: 80 } },
        { position: '2B', stat: { plateAppearances: 80 } }, { position: '3B', stat: { plateAppearances: 80 } },
        { position: 'SS', stat: { plateAppearances: 80 } }, { position: 'LF', stat: { plateAppearances: 80 } },
        { position: 'CF', stat: { plateAppearances: 80 } }, { position: 'RF', stat: { plateAppearances: 80 } },
      ],
      pitching: [{ position: 'P', stat: { inningsPitched: 40 } }],
    };
    const base = deriveFrontOfficeCoverageGrades({ players, liveDataMode: 'live', teamAbbr: 'LAD', oaaPercentile: 75, oaaPopulationCount: 30 });
    const withInnings = deriveFrontOfficeCoverageGrades({
      players,
      liveDataMode: 'live',
      teamAbbr: 'LAD',
      oaaPercentile: 75,
      oaaPopulationCount: 30,
      teamGames: 10,
      fieldingDataMode: 'live',
      fieldingRows: [
        { position: 'C', stat: { innings: '90.0' } },
        { position: 'SS', stat: { innings: '90.0' } },
        { position: 'P', stat: { innings: '90.0' } },
      ],
    });
    expect(withInnings).toMatchObject({ nonPitcherInnings: 180, expectedDefensiveInnings: 720, defensiveInningCoveragePct: 25, defensiveInningRowCount: 2 });
    expect(withInnings.defensePct).toBe(base.defensePct);
  });

  it('uses only a comparable multi-prospect SKIP snapshot for future value and exposes the separate quality tiers', () => {
    const futureValue = deriveOrganizationFutureValue('LAD');
    expect(futureValue).toMatchObject({ status: 'snapshot-complete' });
    expect(futureValue.prospectCount).toBeGreaterThanOrEqual(5);
    expect(futureValue.organizationCount).toBeGreaterThanOrEqual(20);
    expect(futureValue.futureValuePct).toBeGreaterThanOrEqual(0);
    expect(futureValue.topThreeAverage).toBeGreaterThanOrEqual(futureValue.topFiveAverage);
    expect(futureValue.ageToLevel.evaluatedCount).toBeGreaterThan(0);
    expect(futureValue.ageToLevel.youngForLevel + futureValue.ageToLevel.onTrack + futureValue.ageToLevel.oldForLevel).toBe(futureValue.ageToLevel.evaluatedCount);
  });
});
