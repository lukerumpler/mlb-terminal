import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { captureVerifiedSnapshot, deriveVerifiedTrends, TREND_SNAPSHOT_STORAGE_KEY } from '../client/src/lib/trendSnapshots.js';
import ScoutingGradesPreview, { SCOUTING_GRADE_PREVIEW_ROWS, buildScoutingGradeRows } from '../client/src/components/ScoutingGradesPreview.jsx';
import LiveScoreTicker from '../client/src/components/LiveScoreTicker.jsx';
import { StatStrip } from '../client/src/components/atoms.jsx';

const projectRoot = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'client/src/App.jsx'), 'utf8');

describe('verified trend snapshots', () => {
  beforeEach(() => localStorage.clear());

  it('captures verified finite values and derives the next delta from the prior baseline', () => {
    const metrics = { ops: { label:'Team OPS', value:0.700, status:'verified', source:'MLB Stats API' }, era: { label:'Team ERA', value:3.5, status:'verified', source:'MLB Stats API' }, war: { value:null, status:'unavailable' } };
    expect(captureVerifiedSnapshot('lad:2026', metrics, 1000)).toBeNull();
    const nextMetrics = { ...metrics, ops:{ ...metrics.ops, value:0.725 }, era:{ ...metrics.era, value:3.2 } };
    captureVerifiedSnapshot('lad:2026', nextMetrics, 2000);
    const previous = { capturedAt:1000, metrics };
    const trends = deriveVerifiedTrends(nextMetrics, previous);
    expect(trends.ops).toMatchObject({ status:'verified', direction:'up', baselineAt:1000 });
    expect(trends.ops.delta).toBeCloseTo(0.025, 6);
    expect(trends.war).toMatchObject({ status:'unavailable' });
    expect(localStorage.getItem(TREND_SNAPSHOT_STORAGE_KEY)).toContain('0.725');
  });
});

describe('ticker and scouting preview contracts', () => {
  it('uses explicit refresh states without an in-process interval', () => {
    expect(appSource).toContain('const refreshTicker = useCallback');
    expect(appSource).toContain('<LiveScoreTicker status={tickerStatus}');
    expect(appSource).not.toContain('setInterval(refresh, 30_000');
  });

  it('renders loading, empty, error, stale, and updating states with retry behavior', () => {
    const retry = vi.fn();
    const { rerender } = render(<LiveScoreTicker status="loading" />);
    expect(screen.getByRole('status', { hidden:true })).toBeInTheDocument();
    rerender(<LiveScoreTicker status="empty" />);
    expect(screen.getByText('No games in progress right now.')).toBeInTheDocument();
    rerender(<LiveScoreTicker status="error" onRetry={retry} />);
    screen.getByRole('button', { name:'RETRY' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<LiveScoreTicker status="stale" ticks={['LAD 3, SD 1 (▲6)']} />);
    expect(screen.getByText(/Scores may be out of date/)).toBeInTheDocument();
    rerender(<LiveScoreTicker status="refreshing" ticks={['LAD 3, SD 1 (▲6)']} />);
    expect(screen.getByText('UPDATING')).toBeInTheDocument();
  });

  it('shows a verified trend arrow only when a baseline-derived trend is present', () => {
    const { rerender, container } = render(<StatStrip items={[{ lbl:'Team OPS', val:'0.725', sub:'Offense' }]} />);
    expect(container.querySelector('[aria-label*="Team OPS trend"]')).toBeNull();
    rerender(<StatStrip items={[{ lbl:'Team OPS', val:'0.725', sub:'Offense', trend:{ status:'verified', direction:'up', displayDelta:'+0.025' } }]} />);
    expect(container.querySelector('[aria-label="Team OPS trend up"]')).toHaveTextContent('▲ +0.025');
  });

  it('renders 20–80 grade structure with verified proxy population and honest unavailable values', () => {
    const player = { isPitcher:false, savant:{ est_ba:0.320, est_slg:0.700 }, expectedStatisticsPopulation:[{ est_ba:0.240, est_slg:0.400 }, { est_ba:0.280, est_slg:0.500 }, { est_ba:0.320, est_slg:0.620 }, { est_ba:0.360, est_slg:0.700 }] };
    const rows = buildScoutingGradeRows({ player });
    expect(rows.find(row => row.key === 'hit')).toMatchObject({ status:'estimated', source:'Baseball Savant · expected statistics' });
    expect(rows.find(row => row.key === 'power')).toMatchObject({ status:'estimated', source:'Baseball Savant · expected statistics' });
    const { container } = render(<ScoutingGradesPreview player={player} />);
    expect(screen.getByText('ESTIMATED PROXIES')).toBeInTheDocument();
    expect(screen.getByText(/Estimated proxies use verified Baseball Savant/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter scouting grade attributes'), { target:{ value:'available' } });
    expect(screen.getByText('Hit')).toBeInTheDocument();
    expect(screen.getByText('Power')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort scouting grade attributes'), { target:{ value:'current-desc' } });
    const visibleAttributeLabels = [...container.querySelectorAll('strong')].map(node => node.textContent);
    expect(visibleAttributeLabels.slice(0, 2)).toEqual(['Power', 'Hit']);
    fireEvent.change(screen.getByLabelText('Sort scouting grade attributes'), { target:{ value:'attribute' } });
    expect(screen.getByText(/2\/5 shown/)).toBeInTheDocument();
    expect(SCOUTING_GRADE_PREVIEW_ROWS).toHaveLength(5);
  });
});
