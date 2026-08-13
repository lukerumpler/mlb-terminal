import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PitchChartTool, { atBatsUnchanged } from '../client/src/components/PitchChartTool.jsx';

beforeEach(() => {
  cleanup();
  localStorage.clear();
  global.__consoleErrors.length = 0;
});

describe('PitchChartTool (Roadmap #8)', () => {
  it('disables result buttons until a zone is selected, then logs a pitch into the current at-bat', async () => {
    const user = userEvent.setup();
    render(<PitchChartTool />);

    const ballBtn = screen.getByRole('button', { name:'Ball' });
    expect(ballBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name:'Zone 5' }));
    expect(screen.getByRole('button', { name:'Zone 5' })).toHaveAttribute('aria-pressed', 'true');
    expect(ballBtn).not.toBeDisabled();

    await user.click(ballBtn);

    // Count updates, and the pitch shows up under Current At-Bat as "Z5".
    expect(screen.getByText('1-0')).toBeInTheDocument();
    expect(screen.getByText('Z5')).toBeInTheDocument();
    // Zone selection clears after logging, so the next pitch starts fresh.
    expect(screen.getByRole('button', { name:'Zone 5' })).toHaveAttribute('aria-pressed', 'false');
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('closes the at-bat on a walk (4th ball) and moves it into the Pitch Log', async () => {
    const user = userEvent.setup();
    render(<PitchChartTool />);

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name:'Zone 1' }));
      await user.click(screen.getByRole('button', { name:'Ball' }));
    }

    // Count resets after the walk, and "No pitches logged yet" is back.
    expect(screen.getByText('0-0')).toBeInTheDocument();
    expect(screen.getByText(/No pitches logged yet this at-bat/)).toBeInTheDocument();

    // The completed at-bat now appears in the log with a Walk outcome and 4 pitches.
    expect(screen.getByText('Walk')).toBeInTheDocument();
    expect(screen.getByText('4 pitches')).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('Record Out increments the outs display and rolls to a new inning at 3', async () => {
    const user = userEvent.setup();
    render(<PitchChartTool />);

    expect(screen.getByText(/Inning 1/)).toBeInTheDocument();
    const outBtn = screen.getByRole('button', { name:'Record Out' });
    await user.click(outBtn);
    expect(screen.getByText(/1 out\b/)).toBeInTheDocument();
    await user.click(outBtn);
    expect(screen.getByText(/2 outs/)).toBeInTheDocument();
    await user.click(outBtn);
    // 3rd out rolls to inning 2, 0 outs.
    expect(screen.getByText(/Inning 2/)).toBeInTheDocument();
    expect(screen.getByText(/0 outs/)).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('rolling to a new inning clears any in-progress at-bat, not just the outs count', async () => {
    const user = userEvent.setup();
    render(<PitchChartTool />);

    // Log a pitch into an at-bat that never gets formally closed (e.g. the
    // charter records a mid-at-bat caught-stealing via Record Out instead).
    await user.click(screen.getByRole('button', { name:'Zone 5' }));
    await user.click(screen.getByRole('button', { name:'Called Strike' }));
    expect(screen.getByText('0-1')).toBeInTheDocument();
    expect(screen.getByText('Z5')).toBeInTheDocument();

    const outBtn = screen.getByRole('button', { name:'Record Out' });
    await user.click(outBtn);
    await user.click(outBtn);
    await user.click(outBtn); // 3rd out — rolls to inning 2

    expect(screen.getByText(/Inning 2/)).toBeInTheDocument();
    // Count resets and "Current At-Bat" is empty again...
    expect(screen.getByText('0-0')).toBeInTheDocument();
    expect(screen.getByText(/No pitches logged yet this at-bat/)).toBeInTheDocument();
    // ...but the real pitch that was charted isn't silently discarded — it's
    // archived into the Pitch Log under an honest "Inning ended" outcome
    // rather than just vanishing (optimized from an earlier, discard-on-
    // rollover version of this fix: real charted data shouldn't disappear
    // just because the half-inning ended before the at-bat was formally
    // closed out).
    expect(screen.getByText('Inning ended')).toBeInTheDocument();
    expect(screen.getByText('1 pitch')).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('Advance Inning clears an in-progress at-bat the same way', async () => {
    const user = userEvent.setup();
    render(<PitchChartTool />);

    await user.click(screen.getByRole('button', { name:'Zone 3' }));
    await user.click(screen.getByRole('button', { name:'Ball' }));
    expect(screen.getByText('1-0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name:'Advance Inning' }));
    expect(screen.getByText(/Inning 2/)).toBeInTheDocument();
    expect(screen.getByText('0-0')).toBeInTheDocument();
    expect(screen.getByText(/No pitches logged yet this at-bat/)).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('requires confirmation before New Session clears the log', async () => {
    const user = userEvent.setup();
    render(<PitchChartTool />);

    await user.click(screen.getByRole('button', { name:'Zone 1' }));
    await user.click(screen.getByRole('button', { name:'Ball' }));
    expect(screen.getByText('Z1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name:'New Session' }));
    // Cancel — the logged pitch should still be there.
    await user.click(screen.getByRole('button', { name:'Cancel' }));
    expect(screen.getByText('Z1')).toBeInTheDocument();

    // Confirm this time — the current at-bat clears.
    await user.click(screen.getByRole('button', { name:'New Session' }));
    await user.click(screen.getByRole('button', { name:'Confirm' }));
    expect(screen.getByText(/No pitches logged yet this at-bat/)).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('persists across remounts via localStorage, like Scouting Notes does', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PitchChartTool />);
    await user.click(screen.getByRole('button', { name:'Zone 9' }));
    await user.click(screen.getByRole('button', { name:'Foul' }));
    expect(screen.getByText('Z9')).toBeInTheDocument();
    unmount();

    render(<PitchChartTool />);
    expect(screen.getByText('Z9')).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('typing in an unrelated field (Pitcher name) does not disturb an already-completed at-bat log entry', async () => {
    // Regression test for the PitchLog memoization fix: usePitchChart's
    // setField re-loads the *whole* session from localStorage on every
    // call (see lib/pitchChart.js), which gives `atBats` a brand-new array
    // reference even when only pitcherName actually changed. Without
    // atBatsUnchanged as PitchLog's memo comparator (default reference-
    // equality would never hit here), this exact interaction would
    // needlessly re-render/reconcile the whole completed-at-bat history —
    // this test only proves the *visible outcome* stays correct and stable
    // through that interaction, not the render-count internals themselves
    // (see the atBatsUnchanged unit tests below for that).
    const user = userEvent.setup();
    render(<PitchChartTool />);

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name:'Zone 1' }));
      await user.click(screen.getByRole('button', { name:'Ball' }));
    }
    expect(screen.getByText('Walk')).toBeInTheDocument();
    expect(screen.getByText('4 pitches')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Pitcher name'), 'Kyle Bradish');

    expect(screen.getByDisplayValue('Kyle Bradish')).toBeInTheDocument();
    expect(screen.getByText('Walk')).toBeInTheDocument();
    expect(screen.getByText('4 pitches')).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });
});

describe('atBatsUnchanged (PitchLog memoization comparator)', () => {
  const abA = { id:'ab_a' };
  const abB = { id:'ab_b' };

  it('treats two different-reference-but-same-content arrays as unchanged', () => {
    // The exact scenario this comparator exists for: same logical list,
    // new array reference (as usePitchChart's re-load-from-localStorage
    // pattern always produces on every commit).
    expect(atBatsUnchanged({ atBats:[abB, abA] }, { atBats:[{ ...abB }, { ...abA }] })).toBe(true);
  });

  it('detects a newly-prepended at-bat (length changes)', () => {
    expect(atBatsUnchanged({ atBats:[abA] }, { atBats:[abB, abA] })).toBe(false);
  });

  it('detects a session reset to empty (length changes to 0)', () => {
    expect(atBatsUnchanged({ atBats:[abB, abA] }, { atBats:[] })).toBe(false);
  });

  it('treats two empty arrays as unchanged', () => {
    expect(atBatsUnchanged({ atBats:[] }, { atBats:[] })).toBe(true);
  });

  it('detects a same-length swap (defensive — not expected from usePitchChart, but the comparator should not silently miss it if the id differs)', () => {
    expect(atBatsUnchanged({ atBats:[abA] }, { atBats:[abB] })).toBe(false);
  });
});
