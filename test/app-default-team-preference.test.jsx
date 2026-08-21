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

  it('uses the saved browser preference when the initial Team Overview mounts', async () => {
    window.localStorage.setItem(DEFAULT_TEAM_PREFERENCE_KEY, 'nyy');
    render(<App />);

    expect(await screen.findByRole('combobox', { name: 'Select team' })).toHaveValue('nyy');
  });
});
