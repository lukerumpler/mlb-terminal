import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PitchShapePanel, { aggregatePitcherPitches, binVelocities } from '../client/src/components/PitchShapePanel.jsx';

beforeEach(() => {
  cleanup();
  global.__consoleErrors.length = 0;
});

// A plausible pitch_arsenal row shape, using the column names api/savant.js's
// comment says this endpoint most likely returns.
const MOCK_ARSENAL_PRIMARY = [
  { pitch_type:'FF', pitch_name:'4-Seam Fastball', pitches:466, pitch_usage:54.5, velocity:94.0, spin_rate:2104, pitcher_break_z_induced:16.0, pitcher_break_x:11.1, release_extension:6.6, whiff_percent:22.0, k_percent:32.8, put_away:43, hard_hit_percent:31.4, xwoba:0.323, run_value:-12 },
  { pitch_type:'SL', pitch_name:'Slider',          pitches:218, pitch_usage:25.5, velocity:78.8, spin_rate:2183, pitcher_break_z_induced:0.3,  pitcher_break_x:-6.3, release_extension:6.8, whiff_percent:62.4, k_percent:36.4, put_away:37, hard_hit_percent:15.0, xwoba:0.230, run_value:-8  },
  { pitch_type:'CH', pitch_name:'Changeup',        pitches:171, pitch_usage:20.0, velocity:83.2, spin_rate:1641, pitcher_break_z_induced:7.0,  pitcher_break_x:14.1, release_extension:6.9, whiff_percent:45.3, k_percent:40.9, put_away:60, hard_hit_percent:20.0, xwoba:0.331, run_value:-3  },
];

// Same three pitches, but using a different plausible column-naming variant
// per field (pfx_x/pfx_z instead of pitcher_break_x/pitcher_break_z_induced,
// release_speed instead of velocity, avg_spin instead of spin_rate) — this
// is exactly the "Savant might not use the exact name I guessed" case the
// pick() helper exists for.
const MOCK_ARSENAL_ALT_NAMES = [
  { pitch_type:'SI', pitch_name:'Sinker', pitches:132, pitch_percent:34.2, release_speed:95.5, avg_spin:2354, pfx_z:14.7, pfx_x:16.0 },
  { pitch_type:'FC', pitch_name:'Cutter',  pitches:122, pitch_percent:31.6, release_speed:89.4, avg_spin:2286, pfx_z:3.6,  pfx_x:1.5  },
];

// Raw per-pitch rows (api/savant.js's pitcher_pitches endpoint, trimmed
// server-side to exactly these 3 fields). 4-Seam thrown mostly to RHH,
// Slider almost exclusively to LHH — deliberately lopsided so the LHH/RHH
// split assertions below can't pass by coincidence on a near-50/50 mock.
function buildMockPitches() {
  const pitches = [];
  for (let i = 0; i < 30; i++) pitches.push({ pitch_type:'FF', release_speed: 93 + (i % 4), stand: i < 24 ? 'R' : 'L' });
  for (let i = 0; i < 20; i++) pitches.push({ pitch_type:'SL', release_speed: 78 + (i % 3), stand: i < 2 ? 'R' : 'L' });
  return pitches;
}
const MOCK_PITCHES = buildMockPitches();

describe('PitchShapePanel (Roadmap #1)', () => {
  it('shows an empty state, not a crash, when there is no arsenal data', () => {
    render(<PitchShapePanel arsenal={null} />);
    expect(screen.getByText(/No Statcast pitch-arsenal data/i)).toBeInTheDocument();
    render(<PitchShapePanel arsenal={[]} />);
    expect(screen.getAllByText(/No Statcast pitch-arsenal data/i).length).toBeGreaterThan(0);
  });

  it('renders pitch rows, usage, and the per-pitch table from a typical arsenal response', () => {
    render(<PitchShapePanel arsenal={MOCK_ARSENAL_PRIMARY} throws="R" />);

    // Pitch names appear (usage list + table both reference them).
    expect(screen.getAllByText('4-Seam Fastball').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Slider').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Changeup').length).toBeGreaterThan(0);

    // Usage percentages rendered (appears in both the usage-bar list and
    // the per-pitch table, so allow for either/both).
    expect(screen.getAllByText('54.5%').length).toBeGreaterThan(0);

    // Table column headers present for fields this mock actually has.
    expect(screen.getByText('Velo')).toBeInTheDocument();
    expect(screen.getByText('Whiff%')).toBeInTheDocument();

    // Handedness caption under the break plot.
    expect(screen.getByText(/Throws R/)).toBeInTheDocument();

    expect(global.__consoleErrors.length).toBe(0);
  });

  it('still populates break/velocity charts when Savant uses alternate column names (pick() fallback)', () => {
    render(<PitchShapePanel arsenal={MOCK_ARSENAL_ALT_NAMES} />);

    expect(screen.getAllByText('Sinker').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cutter').length).toBeGreaterThan(0);
    // Usage under the pitch_percent variant name still renders as a number
    // (appears in both the usage-bar list and the table).
    expect(screen.getAllByText('34.2%').length).toBeGreaterThan(0);
    // iVB/HB columns show real numbers (not '—') sourced from pfx_z/pfx_x.
    expect(screen.getAllByText('14.7').length).toBeGreaterThan(0);

    expect(global.__consoleErrors.length).toBe(0);
  });

  it('only renders table columns that have real data, not all-dash columns', () => {
    render(<PitchShapePanel arsenal={MOCK_ARSENAL_ALT_NAMES} />);
    // This mock has no whiff/k/put-away/xwOBA fields at all.
    expect(screen.queryByText('Whiff%')).not.toBeInTheDocument();
    expect(screen.queryByText('xwOBA')).not.toBeInTheDocument();
    // But it does have Velo/iVB/HB/Spin, sourced via the alt column names.
    expect(screen.getByText('Velo')).toBeInTheDocument();
    expect(screen.getByText('iVB')).toBeInTheDocument();
  });

  it('without raw pitch data, keeps the old avg-velocity bar and the honest LHH/RHH caveat (fallback path)', () => {
    render(<PitchShapePanel arsenal={MOCK_ARSENAL_PRIMARY} />);
    expect(screen.getByText('Avg. Velocity by Pitch')).toBeInTheDocument();
    expect(screen.getByText(/not split vs\. LHH\/RHH/)).toBeInTheDocument();
    expect(screen.queryByText('Velocity Distribution by Pitch')).not.toBeInTheDocument();
    expect(screen.queryByText(/vs LHH\/RHH/)).not.toBeInTheDocument();
  });

  it('with raw pitch data, shows the real velocity histogram and LHH/RHH mini-bars instead', () => {
    render(<PitchShapePanel arsenal={MOCK_ARSENAL_PRIMARY} pitches={MOCK_PITCHES} />);
    expect(screen.getByText('Velocity Distribution by Pitch')).toBeInTheDocument();
    expect(screen.queryByText('Avg. Velocity by Pitch')).not.toBeInTheDocument();
    expect(screen.queryByText(/not split vs\. LHH\/RHH/)).not.toBeInTheDocument();
    // 30 FF: 24 R / 6 L → vsL/vsR = 20/80. 20 SL: 2 R / 18 L → vsL/vsR = 90/10.
    expect(screen.getByText('20/80')).toBeInTheDocument();
    expect(screen.getByText('90/10')).toBeInTheDocument();
    expect(screen.getByText(/Live Savant, pitch-level/)).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });
});

describe('aggregatePitcherPitches (Roadmap #1, pitch-level split)', () => {
  it('groups velocities and LHH/RHH counts per pitch type', () => {
    const { velocityByType, usageByHand } = aggregatePitcherPitches(MOCK_PITCHES);
    expect(velocityByType.FF.length).toBe(30);
    expect(velocityByType.SL.length).toBe(20);
    expect(usageByHand.FF.total).toBe(30);
    expect(usageByHand.FF.vsR).toBeCloseTo(80, 5);
    expect(usageByHand.FF.vsL).toBeCloseTo(20, 5);
    expect(usageByHand.SL.vsL).toBeCloseTo(90, 5);
  });

  it('skips rows with a missing/invalid pitch_type, stand, or release_speed rather than crashing or fabricating a bucket', () => {
    const messy = [
      { pitch_type:'FF', release_speed:95, stand:'R' },
      { pitch_type:null, release_speed:95, stand:'R' },   // no pitch_type — skipped entirely
      { pitch_type:'FF', release_speed:null, stand:'R' }, // no velocity — excluded from velocityByType, still counts for hand
      { pitch_type:'FF', release_speed:95, stand:'X' },   // invalid stand — excluded from usageByHand
      {},                                                  // empty row
    ];
    const { velocityByType, usageByHand } = aggregatePitcherPitches(messy);
    expect(velocityByType.FF).toEqual([95, 95]); // row 1 and row 4 — row 4's invalid *stand* doesn't affect velocity grouping
    expect(usageByHand.FF.total).toBe(2); // the two real 'R' rows with pitch_type FF
  });

  it('returns empty structures, not a throw, for null/non-array input', () => {
    expect(aggregatePitcherPitches(null)).toEqual({ velocityByType: {}, usageByHand: {} });
    expect(aggregatePitcherPitches([])).toEqual({ velocityByType: {}, usageByHand: {} });
  });
});

describe('binVelocities (Roadmap #1, velocity histogram)', () => {
  it('buckets values into the correct 1-mph-wide bins', () => {
    const bins = binVelocities([94, 94, 94, 95, 96, 96]);
    const totalCount = bins.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(6);
    const ninetyFour = bins.find(b => b.bin > 94 && b.bin < 95);
    expect(ninetyFour.count).toBe(3);
  });

  it('returns an empty array for no values, not a throw', () => {
    expect(binVelocities([])).toEqual([]);
    expect(binVelocities(null)).toEqual([]);
  });

  it('handles a single repeated value without a divide-by-zero-width bin', () => {
    const bins = binVelocities([95, 95, 95]);
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});
