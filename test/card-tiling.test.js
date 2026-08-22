import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const overview = fs.readFileSync(path.join(root, 'client/src/pages/OverviewPage.jsx'), 'utf8');
const otherPages = fs.readFileSync(path.join(root, 'client/src/pages/OtherPages.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'client/src/index.css'), 'utf8');

describe('dashboard card tile alignment', () => {
  it('uses shared responsive grid wrappers for Overview card rows', () => {
    expect((overview.match(/className="overview-responsive-grid/g) || []).length).toBeGreaterThanOrEqual(5);
    expect(overview).toContain('overview-decision-row');
    expect(overview).toContain('alignItems:\'start\'');
  });

  it('stretches desktop panels to the row baseline without fixed card heights', () => {
    expect(styles).toContain('.skip-overview-page .overview-responsive-grid{align-items:stretch !important;}');
    expect(styles).toContain('.skip-overview-page .overview-responsive-grid > .skip-panel{align-self:stretch;height:100%;display:flex;flex-direction:column;}');
    expect(styles).toContain('.skip-overview-page .overview-responsive-grid > .skip-panel > div:last-child{flex:1;min-height:0;}');
  });

  it('returns mobile panels to natural content height', () => {
    expect(styles).toContain('@media (max-width:720px)');
    expect(styles).toContain('.skip-overview-page .overview-responsive-grid > .skip-panel{height:auto;}');
  });

  it('extends balanced alignment to newer peer-card rows without fixed content filler', () => {
    expect(overview).toContain('skip-balanced-grid');
    expect((otherPages.match(/className="skip-balanced-grid(?:\s[^\"]*)?"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(styles).toContain('.skip-balanced-grid{align-items:stretch;}');
    expect(styles).toContain('.skip-balanced-grid > .skip-panel{height:100%;}');
    expect(styles).not.toContain('.skip-balanced-grid > .skip-panel > div:last-child{flex:1');
  });

  it('tightens Overview balanced-grid gaps at mobile widths', () => {
    expect(styles).toContain('.skip-overview-page .skip-balanced-grid{gap:8px !important;}');
  });
});
