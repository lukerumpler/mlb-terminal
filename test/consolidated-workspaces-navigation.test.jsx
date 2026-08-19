import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

describe('consolidated workspace navigation', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('replaces separate sidebar entries with Talent, Intelligence, Intel Feed, and Settings workspace controls', async () => {
    render(<App />);

    expect(await screen.findByTitle('Talent')).toBeInTheDocument();
    expect(screen.getByTitle('Intelligence')).toBeInTheDocument();
    expect(screen.getByTitle('Intel Feed')).toBeInTheDocument();
    expect(document.querySelector('.skip-sidebar button[title="Prospects"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Players"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Draft"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="AMD / IMD"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Knowledge"]')).toBeNull();
    expect(document.querySelector('.skip-sidebar button[title="Follow List"]')).toBeNull();
    expect(screen.getByLabelText(/Settings: \d+ active alerts/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /active alerts/i })).toBeInTheDocument();
  });

  it('uses horizontal Talent sub-tabs to switch between Players, Prospects, and Draft Board', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTitle('Talent'));
    const workspaceTabs = await screen.findByRole('tablist', { name: 'Talent workspace sections' });
    expect(screen.getByRole('tab', { name: 'Players' })).toHaveAttribute('aria-selected', 'true');
    expect(workspaceTabs).toHaveTextContent('Prospects');
    expect(workspaceTabs).toHaveTextContent('Draft Board');

    await user.click(screen.getByRole('tab', { name: 'Draft Board' }));
    expect(screen.getByRole('tab', { name: 'Draft Board' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(document.body.textContent).not.toMatch(/This tab failed to load/));
  });

  it('uses Intel Feed sub-tabs to switch between the feed and followed-player activity', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTitle('Intel Feed'));
    await screen.findByRole('tablist', { name: 'Intel Feed workspace sections' });
    expect(screen.getByRole('tab', { name: 'Intel Feed' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Follow List' }));
    expect(screen.getByRole('tab', { name: 'Follow List' })).toHaveAttribute('aria-selected', 'true');
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

  it('keeps theme selection and alerts together in Settings, with a bell indicator for alerts', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByTitle('Search everything')).toBeInTheDocument();
    expect(document.querySelector('.skip-sidebar button[title="Toggle light / dark theme"]')).toBeNull();

    await user.click(screen.getByTitle('Settings'));
    await screen.findByRole('tablist', { name: 'Settings workspace sections' });
    expect(await screen.findByText('Appearance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark mode|light mode/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Alerts' }));
    expect(screen.getByRole('tab', { name: 'Alerts' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Active Alerts')).toBeInTheDocument();
    expect(screen.getByText('Live operational sources')).toBeInTheDocument();
    expect(screen.queryByText(/Illustrative examples/i)).toBeNull();
  });

  it('renders cache health inside Settings and offers compact primary switching for mobile layouts', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTitle('Settings'));
    expect(await screen.findByText('Cache Health')).toBeInTheDocument();
    expect(screen.getByText('Live internal telemetry')).toBeInTheDocument();

    const switcher = document.querySelector('.skip-mobile-workspace-switcher');
    expect(switcher).toHaveAttribute('aria-label', 'Quick workspace switcher');
    const talentButton = within(switcher).getByRole('button', { name: /Talent/i, hidden:true });
    await user.click(talentButton);
    expect(await screen.findByRole('tablist', { name: 'Talent workspace sections' })).toBeInTheDocument();
  });
});
