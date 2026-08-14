import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const overviewSource = fs.readFileSync(path.join(projectRoot, 'client/src/pages/OverviewPage.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'client/src/App.jsx'), 'utf8');
const prospectsSource = fs.readFileSync(path.join(projectRoot, 'client/src/pages/ProspectsPage.jsx'), 'utf8');
const savantSource = fs.readFileSync(path.join(projectRoot, 'server/api/savant.js'), 'utf8');

describe('Team Overview and Prospects enhancement contract', () => {
  it('exposes an Overview action that targets the Prospects tab', () => {
    expect(overviewSource).toContain("new CustomEvent('skip-navigate'");
    expect(overviewSource).toContain("tab:'prospects'");
    expect(appSource).toContain("window.addEventListener('skip-navigate'");
    expect(appSource).toContain('setTab(nextTab)');
  });

  it('connects Exit Velocity Distribution to a team-scoped Savant source', () => {
    expect(overviewSource).toContain('getTeamExitVelocity');
    expect(overviewSource).toContain('buildExitVelocityBins');
    expect(overviewSource).toContain('teamExitVelocitySource');
    expect(overviewSource).toContain('Baseball Savant Statcast Search · verified roster rollup');
    expect(overviewSource).toContain('Team exit velocity');
    expect(overviewSource).toContain('teamSavantState');
    expect(savantSource).toContain('team_exit_velocity');
    expect(savantSource).toContain('launch_speed');
    expect(savantSource).toContain('team_exit_velocity requires an MLB team abbreviation');
  });

  it('renders the decision-ready summary surfaces on both pages', () => {
    expect(overviewSource).toContain('Front Office Read');
    expect(overviewSource).toContain('Decision Lens');
    expect(overviewSource).toContain('AI Scout Insights');
    expect(overviewSource).toContain('AI-assisted');
    expect(overviewSource).toContain('Local fallback');
    expect(prospectsSource).toContain('Prospect Board');
    expect(prospectsSource).toContain('Scouting Workflow');
    expect(prospectsSource).toContain('Filter by position');
    expect(prospectsSource).toContain('Filter by age');
    expect(prospectsSource).toContain('Filter by projected ETA');
    expect(prospectsSource).toContain('Sort prospects');
  });
});
