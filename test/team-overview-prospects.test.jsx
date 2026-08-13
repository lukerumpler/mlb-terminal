import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const overviewSource = fs.readFileSync(path.join(projectRoot, 'client/src/pages/OverviewPage.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'client/src/App.jsx'), 'utf8');
const prospectsSource = fs.readFileSync(path.join(projectRoot, 'client/src/pages/ProspectsPage.jsx'), 'utf8');

describe('Team Overview and Prospects enhancement contract', () => {
  it('exposes an Overview action that targets the Prospects tab', () => {
    expect(overviewSource).toContain("new CustomEvent('skip-navigate'");
    expect(overviewSource).toContain("tab:'prospects'");
    expect(appSource).toContain("window.addEventListener('skip-navigate'");
    expect(appSource).toContain('setTab(nextTab)');
  });

  it('renders the decision-ready summary surfaces on both pages', () => {
    expect(overviewSource).toContain('Front Office Read');
    expect(overviewSource).toContain('Decision Lens');
    expect(prospectsSource).toContain('Prospect Board');
    expect(prospectsSource).toContain('Scouting Workflow');
  });
});
