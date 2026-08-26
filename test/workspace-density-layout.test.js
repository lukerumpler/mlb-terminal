import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'client/src/index.css'), 'utf8');
const pages = readFileSync(join(process.cwd(), 'client/src/pages/OtherPages.jsx'), 'utf8');

describe('League and Intelligence workspace density contract', () => {
  it('uses explicit current workspace selectors instead of broad page heuristics', () => {
    expect(pages).toContain('page-enter skip-league-workspace');
    expect(pages).toContain('skip-balanced-grid skip-league-analysis-grid');
    expect(pages).toContain('page-enter skip-intelligence-workspace');
    expect(pages).toContain('className="skip-intelligence-primary-grid"');
    expect(pages).toContain('className="skip-intelligence-primary-column"');
  });

  it('keeps unlike Intelligence panels content-sized and stacks the grid on phones', () => {
    expect(css).toMatch(/\.skip-intelligence-primary-column > \.skip-panel\s*\{\s*align-self:start; height:auto;/);
    expect(css).toMatch(/\.skip-intelligence-primary-column \{ display:flex; min-width:0; flex-direction:column; gap:10px; \}/);
    expect(css).toMatch(/@media \(max-width:720px\)\s*\{\s*\.skip-intelligence-primary-grid \{ grid-template-columns:1fr !important;/s);
  });
});
