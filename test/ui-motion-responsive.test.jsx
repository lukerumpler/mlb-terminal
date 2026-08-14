import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'client/src/App.jsx'), 'utf8');
const documentSource = fs.readFileSync(path.join(projectRoot, 'client/index.html'), 'utf8');
const playersSource = fs.readFileSync(path.join(projectRoot, 'client/src/pages/PlayersPage.jsx'), 'utf8');
const prospectsSource = fs.readFileSync(path.join(projectRoot, 'client/src/pages/ProspectsPage.jsx'), 'utf8');

describe('SKIP motion and responsive UI hooks', () => {
  it('keeps grouped workspace navigation and accessible labels in the shell', () => {
    expect(appSource).toContain('aria-label="SKIP workspace navigation"');
    expect(appSource).toContain('className="skip-nav-section"');
    expect(appSource).toContain('section:\'Evaluation\'');
    expect(appSource).toContain('title={t.label}');
    expect(appSource).toContain('width:196');
    expect(appSource).toContain('height:46');
    expect(appSource).toContain("padding:'16px 18px 24px'");
  });

  it('keeps reduced-motion support and mobile rail rules in the document styles', () => {
    expect(appSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(appSource).toContain('.skip-panel:hover');
    expect(documentSource).toContain('.skip-nav-section');
    expect(documentSource).toContain('.skip-stat-strip > div { min-height:78px; }');
  });

  it('adds dedicated mobile hooks to dense player and prospect views', () => {
    expect(playersSource).toContain('skip-player-hero');
    expect(playersSource).toContain('skip-player-main-grid');
    expect(prospectsSource).toContain('skip-prospect-summary-grid');
    expect(prospectsSource).toContain('skip-prospect-workspace-grid');
    expect(documentSource).toContain('.skip-player-main-grid { grid-template-columns:1fr !important;');
    expect(documentSource).toContain('.skip-prospect-workspace-grid { grid-template-columns:1fr !important;');
  });
});
