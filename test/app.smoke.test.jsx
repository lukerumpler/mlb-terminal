import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../client/src/App.jsx';

const TABS = [
  'Overview', 'Players', 'Prospects', 'Draft', 'League', 'Intelligence',
  'AMD / IMD', 'Knowledge', 'Scouting Notes', 'Intel Feed', 'Follow List', 'Settings',
];

beforeEach(() => {
  cleanup();
  global.__consoleErrors.length = 0;
});

describe('SKIP app — full tab cycle', () => {
  it('mounts without crashing', async () => {
    render(<App />);
    // Overview is the default tab; give its first async effect a tick.
    await waitFor(() => expect(document.body.textContent.length).toBeGreaterThan(0));
  });

  for (const label of TABS) {
    it(`renders the "${label}" tab without an error-boundary fallback`, async () => {
      const user = userEvent.setup();
      render(<App />);

      const navButton = await screen.findByRole('button', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      await user.click(navButton);

      // Let lazy() + Suspense + any first-render useEffect settle.
      await waitFor(() => {
        expect(document.body.textContent).not.toMatch(/This tab failed to load/);
      }, { timeout: 10000 });

      // Give async data effects (which all fail fast against the mocked
      // offline fetch) a moment to resolve and re-render before asserting.
      await new Promise(r => setTimeout(r, 300));

      expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    });
  }
});
