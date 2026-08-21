import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsPage } from '../client/src/pages/OtherPages.jsx';

describe('Settings default Team Overview preference', () => {
  it('exposes an accessible team selector and sends the selected key to the persisted preference callback', () => {
    const updateDefaultTeamKey = vi.fn();
    render(<SettingsPage theme="light" toggleTheme={() => {}} defaultTeamKey="sd" updateDefaultTeamKey={updateDefaultTeamKey} />);

    const selector = screen.getByRole('combobox', { name: 'Default Team Overview' });
    expect(selector).toHaveValue('sd');
    expect(screen.getByText(/This preference is saved only in this browser/)).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'nyy' } });
    expect(updateDefaultTeamKey).toHaveBeenCalledWith('nyy');
  });
});
