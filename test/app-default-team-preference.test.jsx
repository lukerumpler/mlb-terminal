import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../client/src/App.jsx';
import { DEFAULT_TEAM_PREFERENCE_KEY } from '../client/src/lib/defaultTeamPreference.js';
import { __resetMlbClientStateForTests } from '../client/src/api/mlb.js';

describe('App default Team Overview preference', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    __resetMlbClientStateForTests();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => '{}',
    })));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to Milwaukee when no browser preference is saved', async () => {
    render(<App />);
    expect(await screen.findByRole('combobox', { name: 'Select team' }, { timeout: 8000 })).toHaveValue('mil');
  });

  it('uses the saved browser preference when the initial Team Overview mounts', async () => {
    window.localStorage.setItem(DEFAULT_TEAM_PREFERENCE_KEY, 'nyy');
    render(<App />);

    // Mounting the whole App can take longer than Testing Library's 1 s default on a slow
    // runner (it measured ~1.2 s here), so wait up to 8 s. The assertion is unchanged.
    expect(await screen.findByRole('combobox', { name: 'Select team' }, { timeout: 8000 })).toHaveValue('nyy');
  });
});
