import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

describe('consolidated workspace navigation', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('replaces standalone sidebar entries with combined workspace controls and an accessible alert bell', async () => {
    render(<App />);
    expect(await screen.findByTitle('Talent')).toBeInTheDocument();
    expect(screen.getByTitle('Intel Feed')).toBeInTheDocument();
    expect(screen.getByLabelText(/Settings: \d+ active alerts/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /active alerts/i })).toBeInTheDocument();
    expect(document.querySelector('.skip-sidebar button[title="Players"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Follow List"]')).toBeNull();
  });

  it('opens Players in Talent, Follow List in Intel Feed, and Alerts in Settings through accessible sub-tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTitle('Talent'));
    await screen.findByRole('tablist', { name: 'Talent workspace sections' });
    expect(screen.getByRole('tab', { name: 'Players' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByTitle('Intel Feed'));
    await screen.findByRole('tablist', { name: 'Intel Feed workspace sections' });
    await user.click(screen.getByRole('tab', { name: 'Follow List' }));
    expect(screen.getByRole('tab', { name: 'Follow List' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByTitle('Settings'));
    await screen.findByRole('tablist', { name: 'Settings workspace sections' });
    await user.click(screen.getByRole('tab', { name: 'Alerts' }));
    expect(await screen.findByText('Active Alerts')).toBeInTheDocument();
  });
});
