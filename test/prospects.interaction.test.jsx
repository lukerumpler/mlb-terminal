import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

beforeEach(() => {
  cleanup();
  localStorage.clear();
  global.__consoleErrors.length = 0;
});

async function goToProspects(user) {
  render(<App />);
  const navButton = await screen.findByRole('button', { name: /Prospects/ });
  await user.click(navButton);
  // Wait for the actual batter table to render, not just the absence of the
  // error-boundary text — in this test environment (unbundled, on-the-fly
  // JSX transform) the first render of a heavy page can take a couple of
  // real seconds, well past what any fixed short timeout would cover.
  await screen.findByText(/Top Prospect Batters/, {}, { timeout: 8000 });
}

describe('Prospects page — merged feature interactions', () => {
  it('renders the compact Farm System Summary score card', async () => {
    const user = userEvent.setup();
    await goToProspects(user);
    expect(screen.getByText('Farm System Summary')).toBeInTheDocument();
    expect(screen.getByText(/Score model:/)).toBeInTheDocument();
    expect(screen.getByText(/tracked prospects across/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  }, 15000);

  it('opens a scouting card from the batter table and closes it', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const cardButtons = screen.getAllByRole('button', { name: /Card/ });
    expect(cardButtons.length).toBeGreaterThan(0);
    await user.click(cardButtons[0]);

    // ProspectCard renders a dialog with a close button.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 15000 });
    const closeBtn = within(dialog).getByRole('button', { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);

    await user.click(closeBtn);
  }, 15000);

  it('toggles a watchlist star without crashing and persists to localStorage', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const stars = document.querySelectorAll('button[aria-pressed]');
    // WatchStar buttons use aria-pressed; grab the first one found in the table.
    const starButtons = screen.getAllByTitle(/watchlist/i);
    expect(starButtons.length).toBeGreaterThan(0);
    await user.click(starButtons[0]);

    // Should not crash, and localStorage should now hold something.
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    const keys = Object.keys(localStorage);
    expect(keys.some(k => k.toLowerCase().includes('watch'))).toBe(true);
  });

  it('selects two prospects and opens the Compare tool', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const compareChecks = screen.getAllByTitle(/add to comparison/i);
    expect(compareChecks.length).toBeGreaterThanOrEqual(2);
    await user.click(within(compareChecks[0]).getByRole('checkbox'));
    await user.click(within(compareChecks[1]).getByRole('checkbox'));

    const compareBtn = await screen.findByRole('button', { name: /Compare \(2\)/ });
    await user.click(compareBtn);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/eFV/);
    });
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it('opens the Scatterplot builder', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const scatterBtn = await screen.findByRole('button', { name: /Scatterplot/ });
    await user.click(scatterBtn);

    await new Promise(r => setTimeout(r, 300));
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    expect(global.__consoleErrors.filter(e => e.includes('Error') && !e.includes('network unavailable')).length).toBe(0);
  });

  it('colors the Scatterplot builder by a chosen stat (Roadmap #4) without crashing', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const scatterBtn = await screen.findByRole('button', { name: /Scatterplot/ });
    await user.click(scatterBtn);
    await new Promise(r => setTimeout(r, 300));

    // Default state: position coloring, no gradient legend.
    expect(screen.getByText(/Color = position/)).toBeInTheDocument();

    const colorSelect = screen.getByRole('combobox', { name: /Color by/ });
    await user.selectOptions(colorSelect, 'ops');

    expect(await screen.findByText(/Color = OPS/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    expect(global.__consoleErrors.filter(e => e.includes('Error') && !e.includes('network unavailable')).length).toBe(0);

    // Switching pools resets color-by rather than carrying over a stat key
    // (e.g. 'ops') that doesn't exist on the pitcher axis list. Scoped to
    // the scatter builder's own controls row — the Prospects page has its
    // own separate, identically-labeled Batters/Pitchers toggle elsewhere.
    const controlsRow = colorSelect.closest('label').parentElement;
    const pitchersBtn = within(controlsRow).getByRole('button', { name: /^Pitchers$/ });
    await user.click(pitchersBtn);
    expect(screen.getByText(/Color = position/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it('shows sortable Trend and ETA columns on both batter and pitcher tables (Roadmap #6)', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    // Column headers are clickable (SortTh renders role="button").
    let trendHeader = screen.getByRole('button', { name: /^Trend/ });
    let etaHeader = screen.getByRole('button', { name: /^ETA(\s|$)/ });
    expect(trendHeader).toBeInTheDocument();
    expect(etaHeader).toBeInTheDocument();

    // Sorting by ETA, then by Trend (including toggling direction on a
    // second click), shouldn't crash the table.
    await user.click(etaHeader);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    await user.click(trendHeader);
    await user.click(trendHeader);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);

    // Same two columns exist on the Pitchers table.
    const pitchersToggle = screen.getAllByRole('button', { name: /^Pitchers$/ })[0];
    await user.click(pitchersToggle);
    trendHeader = await screen.findByRole('button', { name: /^Trend/ });
    etaHeader = screen.getByRole('button', { name: /^ETA(\s|$)/ });
    expect(trendHeader).toBeInTheDocument();
    expect(etaHeader).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    expect(global.__consoleErrors.filter(e => e.includes('Error') && !e.includes('network unavailable')).length).toBe(0);
  }, 12000);

  it('filters by level and by watchlist-only without crashing', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const select = document.querySelector('select');
    expect(select).toBeTruthy();
    await user.selectOptions(select, select.options[1].value);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);

    const watchOnlyBtn = await screen.findByRole('button', { name: /Watchlist Only/ });
    await user.click(watchOnlyBtn);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it('filters by position, age, ETA, and changes the sort order', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const position = screen.getByRole('combobox', { name: /Filter by position/ });
    const age = screen.getByRole('combobox', { name: /Filter by age/ });
    const eta = screen.getByRole('combobox', { name: /Filter by projected ETA/ });
    const sort = screen.getByRole('combobox', { name: /Sort prospects/ });

    expect(position.options.length).toBeGreaterThan(1);
    await user.selectOptions(position, position.options[1].value);
    await user.selectOptions(age, '21to22');
    expect(eta.options.length).toBeGreaterThan(1);
    await user.selectOptions(eta, eta.options[1].value);
    await user.selectOptions(sort, 'fv');

    expect(sort).toHaveValue('fv');
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    expect(global.__consoleErrors.filter(e => e.includes('Error') && !e.includes('network unavailable')).length).toBe(0);
  });
});

describe('Command palette', () => {
  it('opens with the Search button and can navigate tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    const searchBtn = await screen.findByRole('button', { name: /Search/ });
    await user.click(searchBtn);

    await waitFor(() => {
      expect(document.querySelector('input')).toBeTruthy();
    });
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

  it('renders sticky grouped headers for batter and pitcher ranking tables', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    expect(document.querySelectorAll('.skip-long-table').length).toBeGreaterThan(0);
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Hitting production')).toBeInTheDocument();

    const pitchersToggle = screen.getAllByRole('button', { name: /^Pitchers$/ })[0];
    await user.click(pitchersToggle);
    expect(await screen.findByText('Pitching performance')).toBeInTheDocument();
    expect(document.querySelectorAll('.skip-long-table').length).toBeGreaterThan(0);
  });

  it('mounts compact mobile card collections for both ranking pools', async () => {
    const user = userEvent.setup();
    await goToProspects(user);

    const batterCards = document.querySelectorAll('.skip-prospect-mobile-card');
    expect(batterCards.length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Batter prospect cards')).toBeInTheDocument();

    const pitchersToggle = screen.getAllByRole('button', { name: /^Pitchers$/ })[0];
    await user.click(pitchersToggle);
    expect(screen.getByLabelText('Pitcher prospect cards')).toBeInTheDocument();
    expect(document.querySelectorAll('.skip-prospect-mobile-card').length).toBeGreaterThan(0);
  });
