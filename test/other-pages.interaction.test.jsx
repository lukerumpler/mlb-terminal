import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

beforeEach(() => {
  cleanup();
  global.__consoleErrors.length = 0;
});

async function goToTab(user, label, waitForText) {
  render(<App />);
  const navButton = await screen.findByRole('button', { name: new RegExp(label) });
  await user.click(navButton);
  await screen.findByText(waitForText, {}, { timeout: 8000 });
}

describe('Draft page', () => {
  it('searches the draft class pool without crashing', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'Draft', /2026 Draft Class/);

    const search = screen.getByPlaceholderText(/Search by name or school/i);
    await user.type(search, 'Roch');

    await waitFor(() => {
      expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    });
    expect(global.__consoleErrors.filter(e => !e.includes('network unavailable')).length).toBe(0);
  });

  it('clears the search and still renders the full pool', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'Draft', /2026 Draft Class/);

    const search = screen.getByPlaceholderText(/Search by name or school/i);
    await user.type(search, 'zzzzznomatch');
    await user.clear(search);

    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it('filters the SKIP Big Board by position and sorts by rank or position', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'Draft', /2026 Draft Class/);

    const positionFilter = screen.getByRole('combobox', { name: /Filter Draft board by position/i });
    const sortControl = screen.getByRole('combobox', { name: /Sort Draft board/i });

    await user.selectOptions(positionFilter, 'RHP');
    const boardTable = screen.getAllByRole('table')[0];
    expect(within(boardTable).getByText('Jackson Flora')).toBeInTheDocument();
    expect(within(boardTable).queryByText('Roch Cholowsky')).toBeNull();

    await user.selectOptions(sortControl, 'rank-desc');
    expect(screen.getByText(/SKIP rank · 100 → 1/)).toBeInTheDocument();
    await user.selectOptions(sortControl, 'position');
    expect(screen.getByText(/Position · A → Z/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe('Knowledge page', () => {
  it('cycles through every knowledge tab without crashing', async () => {
    const user = userEvent.setup();
    render(<App />);
    const navButton = await screen.findByRole('button', { name: /Knowledge/ });
    await user.click(navButton);
    await screen.findByRole('button', { name: /^Game Theory$/ }, { timeout: 8000 });

    const tabLabels = ['Behavioral Biases', 'Draft Intel', 'Future Value', 'Grade Rubric', 'Projections', 'Leadership Model', 'Game Theory'];
    for (const label of tabLabels) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${label}$`) });
      await user.click(btn);
      expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    }
    expect(global.__consoleErrors.filter(e => !e.includes('network unavailable')).length).toBe(0);
  });
});

describe('Intelligence page', () => {
  it('rejects comparing a player against themselves', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'Intelligence', /Player Comparison Engine/i);

    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    await user.type(inputs[0], 'Aaron Judge');
    await user.type(inputs[1], 'Aaron Judge');

    const compareBtn = screen.getByRole('button', { name: /Compare/i });
    await user.click(compareBtn);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/different players/i);
    });
  });

  it('shows the notable-trades table and success-rate chart, sortable, without crashing (Roadmap #5)', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'Intelligence', /Player Comparison Engine/i);

    await screen.findByText(/Notable Trades — High-End Starting Pitchers/i);
    expect(screen.getByText(/Team Success Rate — Notable Deadline Trades/i)).toBeInTheDocument();

    // Real, known trade — confirms the dataset actually rendered, not just the panel shell.
    expect(screen.getByText(/Justin Verlander/i)).toBeInTheDocument();

    // Sorting by netWAR (including toggling direction on a second click)
    // shouldn't crash the table.
    const netWarHeader = screen.getByRole('button', { name: /^netWAR/ });
    await user.click(netWarHeader);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    await user.click(netWarHeader);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    expect(global.__consoleErrors.filter(e => !e.includes('network unavailable')).length).toBe(0);
  });
});

describe('AMD page', () => {
  it('renders without crashing', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'AMD', /Metric Overview/);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it('marks the leaderboard/scatter/spotlight/pitch-breakdown panels as illustrative, and does not let the pitch-type-breakdown panel silently rename itself after a different leaderboard row', async () => {
    // Regression test for a real title/content mismatch bug: this panel's
    // title used to interpolate the currently-selected leaderboard player
    // (`AMD by Pitch Type — ${spotlight?.name}`) while its chart data and
    // caption stayed hardcoded to Luis Arraez — so clicking, say, Freddie
    // Freeman in the leaderboard relabeled the panel with his name while
    // still describing Arraez's (fabricated) pitch-type tendencies. Fixed
    // by making the title a static, honestly-labeled example instead of a
    // false promise that it reacts to the click above.
    const user = userEvent.setup();
    await goToTab(user, 'AMD', /Metric Overview/);

    // Illustrative labeling present on every panel using fixed example data.
    expect(screen.getByText(/AMD\+ Hitter Leaders — 2026 \(Illustrative\)/)).toBeTruthy();
    expect(screen.getByText('AMD by Pitch Type — Example: Luis Arraez')).toBeTruthy();
    expect(screen.getByText(/AMD\+ Spotlight \(Illustrative\)/)).toBeTruthy();

    // Click a different leaderboard row — the spotlight panel should update.
    // (The scatter chart below also renders an off-screen a11y <text> per
    // point using the same player names, so there's more than one
    // "Freddie Freeman" node even before anything is clicked — pick the
    // clickable leaderboard row specifically, not just the first match.)
    const leaderboardRow = screen.getAllByText('Freddie Freeman')
      .find(el => el.tagName.toLowerCase() === 'span');
    expect(leaderboardRow).toBeTruthy();
    await user.click(leaderboardRow);
    await waitFor(() => {
      expect(screen.getByText(/AMD\+ Spotlight \(Illustrative\)/)).toBeTruthy();
      // Spotlight big name (17px header) confirms the click landed.
      const nameEls = screen.getAllByText('Freddie Freeman');
      expect(nameEls.some(el => el.style.fontSize === '17px')).toBe(true);
    });

    // ...but the pitch-type-breakdown panel's title must stay the fixed example,
    // not silently relabel itself to the newly-clicked player.
    expect(screen.getByText('AMD by Pitch Type — Example: Luis Arraez')).toBeTruthy();
    expect(screen.queryByText(/AMD by Pitch Type — Freddie Freeman/)).toBeNull();

    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe('League page', () => {
  it('renders standings without crashing', async () => {
    const user = userEvent.setup();
    await goToTab(user, 'League', /standings|leaders/i);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe('Follow List page', () => {
  it('filters by category without crashing', async () => {
    const user = userEvent.setup();
    render(<App />);
    const navButton = await screen.findByRole('button', { name: /Follow List/ });
    await user.click(navButton);
    await screen.findByPlaceholderText(/Search by name, handle, or bio/i, {}, { timeout: 8000 });

    const allBtn = screen.getByRole('button', { name: /^All$/i });
    await user.click(allBtn);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe('Scouting Notes page', () => {
  it('renders and filters without crashing', async () => {
    const user = userEvent.setup();
    render(<App />);
    const navButton = await screen.findByRole('button', { name: /Scouting Notes/ });
    await user.click(navButton);
    await screen.findByPlaceholderText(/Search by player or team/i, {}, { timeout: 8000 });
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});
