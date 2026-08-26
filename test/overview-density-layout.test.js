import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'client/src/index.css'), 'utf8');
const overview = readFileSync(join(process.cwd(), 'client/src/pages/OverviewPage.jsx'), 'utf8');

describe('current Overview density layout contract', () => {
  it('targets the live compact briefing instead of the retired executive-briefing markup', () => {
    expect(overview).toContain('className="skip-compact-executive-briefing"');
    expect(css).toMatch(/\.skip-overview-page \.skip-compact-executive-briefing\s*\{[^}]*min-height:0;[^}]*height:auto;[^}]*justify-content:flex-start;/s);
  });

  it('keeps the Supporting Analysis handoff and detailed decision row content-sized', () => {
    expect(css).toMatch(/\.skip-overview-page \.skip-overview-deferred-analysis-intro\s*\{\s*margin-top:24px;/);
    expect(css).toMatch(/\.skip-overview-page \.overview-responsive-grid\.overview-decision-row\.skip-overview-deferred-analysis\s*\{[^}]*min-height:0 !important;[^}]*align-items:start !important;/s);
  });
});
