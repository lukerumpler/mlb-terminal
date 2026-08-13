import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ContactHeatmap from '../client/src/components/ContactHeatmap.jsx';

beforeEach(() => {
  cleanup();
  global.__consoleErrors.length = 0;
});

// Real Statcast Search column names (baseballsavant.mlb.com/csv-docs) — this
// component doesn't guess at alternates the way PitchShapePanel/the retired
// ContactPointPanel do, so there's no "alt names" fixture to test here; a
// row either has these exact two fields or it's correctly treated as unusable.
const rightRow = (x, y) => ({ intercept_ball_minus_batter_pos_x_inches: x, intercept_ball_minus_batter_pos_y_inches: y, stand: 'R' });
const leftRow  = (x, y) => ({ intercept_ball_minus_batter_pos_x_inches: x, intercept_ball_minus_batter_pos_y_inches: y, stand: 'L' });

const MOCK_STANDARD_HITTER = [rightRow(4.1, 28.4), rightRow(6.8, 31.0), rightRow(-2.2, 24.9)];

const MOCK_SWITCH_HITTER = [
  rightRow(5.0, 29.1), rightRow(3.2, 26.8),
  leftRow(-4.4, 22.0), leftRow(-6.1, 30.5), leftRow(-1.0, 19.7),
];

describe('ContactHeatmap (Roadmap #3)', () => {
  it('shows an empty state, not a crash, when there is no contact-point data', () => {
    render(<ContactHeatmap contactPoints={null} />);
    expect(screen.getByText(/No Statcast intercept-point data/i)).toBeInTheDocument();
    render(<ContactHeatmap contactPoints={[]} />);
    expect(screen.getAllByText(/No Statcast intercept-point data/i).length).toBeGreaterThan(0);
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('renders a single cloud panel for a standard (non-switch) hitter', () => {
    render(<ContactHeatmap contactPoints={MOCK_STANDARD_HITTER} />);
    expect(screen.getByText('Bats Right')).toBeInTheDocument();
    expect(screen.queryByText('Bats Left')).not.toBeInTheDocument();
    expect(screen.getAllByText(/3 swings/).length).toBeGreaterThan(0);
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('renders two side-by-side cloud panels (Bats Right / Bats Left) for a switch hitter', () => {
    render(<ContactHeatmap contactPoints={MOCK_SWITCH_HITTER} />);
    expect(screen.getByText('Bats Right')).toBeInTheDocument();
    expect(screen.getByText('Bats Left')).toBeInTheDocument();
    expect(screen.getAllByText(/2 swings/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 swings/).length).toBeGreaterThan(0);
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('never fabricates a point when a row is missing either coordinate', () => {
    render(<ContactHeatmap contactPoints={[
      { intercept_ball_minus_batter_pos_x_inches: 5.0, intercept_ball_minus_batter_pos_y_inches: null, stand: 'R' },
      { intercept_ball_minus_batter_pos_x_inches: null, intercept_ball_minus_batter_pos_y_inches: 20.0, stand: 'R' },
    ]} />);
    // Both rows are missing one coordinate each -> both filtered out ->
    // falls back to the panel-level empty state, not a fabricated dot.
    expect(screen.getByText(/No Statcast intercept-point data/i)).toBeInTheDocument();
  });

  it('ignores rows with non-numeric coordinates rather than crashing', () => {
    render(<ContactHeatmap contactPoints={[
      { intercept_ball_minus_batter_pos_x_inches: 'not-a-number', intercept_ball_minus_batter_pos_y_inches: 20.0, stand: 'R' },
      ...MOCK_STANDARD_HITTER,
    ]} />);
    expect(screen.getByText('Bats Right')).toBeInTheDocument();
    // The bad row is dropped, so the count reflects only the 3 good rows.
    expect(screen.getAllByText(/3 swings/).length).toBeGreaterThan(0);
    expect(global.__consoleErrors.length).toBe(0);
  });
});
