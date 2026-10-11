import { describe, expect, it } from 'vitest';
import {
  parseBaseballReferenceTeamWarHtml,
  parseFanGraphsAggregateWarHtml,
} from '../server/api/fangraphs-models.js';

const brRow = (rk, name, cells) =>
  `<tr><th scope="row">${rk}</th><td><a href="/teams/${name.slice(0, 3).toUpperCase()}/2026.shtml">${name}</a></td>${cells
    .map(c => `<td>${c}</td>`)
    .join('')}</tr>`;

const brTable = (headerRows, rows) =>
  `<table><thead>${headerRows}</thead><tbody>${rows}</tbody></table>`;

describe('Baseball-Reference WAR parser hardening', () => {
  it('reads WAR by header, not by the cell next to the team name', () => {
    const html = brTable(
      '<tr><th>Rk</th><th>Tm</th><th>Payroll</th><th>WAR</th></tr>',
      brRow(1, 'Boston Red Sox', ['$200M', '41.2'])
    );
    expect(parseBaseballReferenceTeamWarHtml(html, 2026)[0]).toMatchObject({
      team: 'Boston Red Sox',
      totalWAR: 41.2,
    });
  });

  it('keeps columns aligned when an over-header row uses colspan', () => {
    const html = brTable(
      '<tr><th></th><th colspan="2">Group</th><th>x</th></tr>' +
        '<tr><th>Rk</th><th>Tm</th><th>Ignore</th><th>WAR</th></tr>',
      brRow(1, 'Seattle Mariners', ['9', '33.4'])
    );
    expect(parseBaseballReferenceTeamWarHtml(html, 2026)[0].totalWAR).toBe(33.4);
  });

  it('populates batting, pitching and defensive WAR when the columns exist', () => {
    const html = brTable(
      '<tr><th>Rk</th><th>Tm</th><th>Batting WAR</th><th>pWAR</th><th>Fld</th><th>WAR</th></tr>',
      brRow(1, 'Atlanta Braves', ['22.1', '14.3', '3.2', '39.6'])
    );
    expect(parseBaseballReferenceTeamWarHtml(html, 2026)[0]).toMatchObject({
      battingWAR: 22.1,
      pitchingWAR: 14.3,
      defensiveWAR: 3.2,
      totalWAR: 39.6,
    });
  });

  it('keeps oWAR (offence-only) separate from position-player batting WAR', () => {
    // FanGraphs batting WAR includes defense; oWAR does not, so they must never be averaged.
    const html = brTable(
      '<tr><th>Rk</th><th>Tm</th><th>oWAR</th><th>WAR</th></tr>',
      brRow(1, 'Atlanta Braves', ['18.0', '39.6'])
    );
    const row = parseBaseballReferenceTeamWarHtml(html, 2026)[0];
    expect(row.battingWAR).toBeNull();
    expect(row.offensiveWAR).toBe(18);
  });

  it('keeps the sign of negative WAR written with a Unicode minus', () => {
    const html = brTable(
      '<tr><th>Rk</th><th>Tm</th><th>WAR</th></tr>',
      brRow(30, 'Colorado Rockies', ['\u22122.4'])
    );
    expect(parseBaseballReferenceTeamWarHtml(html, 2026)[0].totalWAR).toBe(-2.4);
  });

  it('lists a team once even if it appears in several tables', () => {
    const table = brTable(
      '<tr><th>Rk</th><th>Tm</th><th>WAR</th></tr>',
      brRow(1, 'Houston Astros', ['35.0'])
    );
    expect(parseBaseballReferenceTeamWarHtml(table + table, 2026)).toHaveLength(1);
  });

  it('returns nothing for HTML with no team links', () => {
    expect(parseBaseballReferenceTeamWarHtml('<p>blocked</p>', 2026)).toEqual([]);
  });
});

describe('FanGraphs aggregate WAR parser hardening', () => {
  const fgTable = rows =>
    `<table><tr><th>Team</th><th>WAR</th></tr>${rows
      .map(([t, w]) => `<tr><td>${t}</td><td>${w}</td></tr>`)
      .join('')}</table>`;

  it('ignores league total rows and keeps negative values signed', () => {
    const result = parseFanGraphsAggregateWarHtml(
      {
        battingHtml: fgTable([['LAD', '25.1'], ['Total', '500.0'], ['COL', '\u22121.5']]),
        pitchingHtml: fgTable([['LAD', '15.0'], ['League', '400.0'], ['COL', '3.0']]),
      },
      2026
    );
    expect(result.teams.map(t => t.team).sort()).toEqual(['COL', 'LAD']);
    const col = result.teams.find(t => t.team === 'COL');
    expect(col).toMatchObject({ battingWAR: -1.5, pitchingWAR: 3, totalWAR: 1.5 });
  });

  it('leaves total WAR null when only one side parsed', () => {
    const result = parseFanGraphsAggregateWarHtml(
      { battingHtml: fgTable([['SD', '20.0']]), pitchingHtml: '<p>blocked</p>' },
      2026
    );
    expect(result.teams[0]).toMatchObject({ team: 'SD', battingWAR: 20, pitchingWAR: null, totalWAR: null });
  });
});
