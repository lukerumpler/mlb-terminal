import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'client/src/App.jsx'), 'utf8');

describe('provider retry bundle boundary', () => {
  it('reuses the already-loaded MLB module for provider retries', () => {
    expect(appSource).toContain(
      "import { getTodaysGames, getStandings, getSavantData, getTeamModelSources } from './api/mlb.js';",
    );
    expect(appSource).not.toContain("await import('./api/mlb.js')");
    expect(appSource).toContain('await Promise.all([getTodaysGames(), getStandings()]);');
    expect(appSource).toContain('await getTeamModelSources(team?.abbr);');
    expect(appSource).toContain('await getSavantData();');
  });
});
