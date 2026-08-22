import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

beforeEach(() => {
  cleanup();
  localStorage.clear();
  global.__consoleErrors.length = 0;
});

describe('Organization player directory', () => {
  it('replaces the static by-team grid with a clearly labeled official roster directory', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTitle('Talent'));
    await user.click(await screen.findByRole('tab', { name: 'Prospects' }));
    await screen.findByText(/Top Prospect Batters/, {}, { timeout: 8000 });
    await user.click(await screen.findByRole('button', { name: 'By Team' }));

    expect(await screen.findByText('Organization Player Directory')).toBeInTheDocument();
    expect(screen.getByText(/not MLB Pipeline Top 30/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load all 30 official rosters/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Search selected organization roster')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  }, 15000);
});
