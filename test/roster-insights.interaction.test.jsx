import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

beforeEach(() => cleanup());

describe('Roster Insights rendered filters', () => {
  it('updates position and stat sorting controls in the Overview panel', async () => {
    const user = userEvent.setup();
    render(<App />);

    const positionSelect = await screen.findByRole('combobox', { name: 'Filter roster insights by position' });
    const statSelect = await screen.findByRole('combobox', { name: 'Sort roster insights by player statistic' });

    // The offline test fixture has no roster rows, so only the safe default
    // position option is available; the transformation test covers populated
    // position options separately.
    await user.selectOptions(positionSelect, 'all');
    await user.selectOptions(statSelect, 'era');

    expect(positionSelect).toHaveValue('all');
    expect(statSelect).toHaveValue('era');
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/No roster players match|Roster leader data is unavailable|Loading roster leaders/);
    });
  });
});
