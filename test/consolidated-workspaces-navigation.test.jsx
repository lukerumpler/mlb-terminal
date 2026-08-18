import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

describe('consolidated workspace navigation', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('replaces separate sidebar entries with Talent and Intelligence workspace controls', async () => {
    render(<App />);

    expect(await screen.findByTitle('Talent')).toBeInTheDocument();
    expect(screen.getByTitle('Intelligence')).toBeInTheDocument();
    expect(document.querySelector('.skip-sidebar button[title="Prospects"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Draft"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="AMD / IMD"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Knowledge"]')).toBeNull();
  });

  it('uses horizontal Talent sub-tabs to switch between Prospects and Draft Board', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTitle('Talent'));
    const workspaceTabs = await screen.findByRole('tablist', { name: 'Talent workspace sections' });
    expect(screen.getByRole('tab', { name: 'Prospects' })).toHaveAttribute('aria-selected', 'true');
    expect(workspaceTabs).toHaveTextContent('Draft Board');

    await user.click(screen.getByRole('tab', { name: 'Draft Board' }));
    expect(screen.getByRole('tab', { name: 'Draft Board' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(document.body.textContent).not.toMatch(/This tab failed to load/));
  });

  it('uses horizontal Intelligence sub-tabs for Intelligence, AMD/IMD, and Knowledge', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTitle('Intelligence'));
    await screen.findByRole('tablist', { name: 'Intelligence workspace sections' });
    expect(screen.getByRole('tab', { name: 'Intelligence' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'AMD / IMD' }));
    expect(screen.getByRole('tab', { name: 'AMD / IMD' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Knowledge' }));
    expect(screen.getByRole('tab', { name: 'Knowledge' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(document.body.textContent).not.toMatch(/This tab failed to load/));
  });

  it('foregrounds Search and leaves theme selection in Settings', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByTitle('Search everything')).toBeInTheDocument();
    expect(document.querySelector('.skip-sidebar button[title="Toggle light / dark theme"]')).toBeNull();

    await user.click(screen.getByTitle('Settings'));
    expect(await screen.findByText('Appearance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark mode|light mode/i })).toBeInTheDocument();
  });
});
