// dev-mock-data.js — LOCAL VISUAL QA ONLY, never shipped, never used in
// production or by real users. Synthetic data used to verify the actual
// rendering of PlateDisciplinePercentiles/PitchShapePanel/ContactHeatmap/
// RadarCard with populated data, since this sandbox cannot reach the real
// MLB Stats API / Baseball Savant to get real data to render. Every value
// below is made up for testing purposes — none of it should be read as a
// claim about a real player's real statistics.

function pctPopulation(center, spread, n = 60) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = center + (Math.sin(i * 12.9898) * 43758.5453 % 1) * spread * 2 - spread;
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

const JUDGE_ID = 592450;

export const mockProfile = {
  people: [{
    id: JUDGE_ID,
    fullName: 'Aaron Judge (MOCK TEST DATA)',
    firstName: 'Aaron', lastName: 'Judge',
    primaryNumber: '99',
    currentAge: 34,
    birthDate: '1992-04-26',
    height: '6\' 7"', weight: 282,
    primaryPosition: { code: '9', name: 'Outfielder', type: 'Outfielder', abbreviation: 'OF' },
    batSide: { code: 'R', description: 'Right' },
    pitchHand: { code: 'R', description: 'Right' },
    currentTeam: { id: 147, name: 'New York Yankees' },
    mlbDebutDate: '2016-08-13',
  }],
};

export const mockHittingSeason = {
  stats: [{
    group: { displayName: 'hitting' },
    splits: [{
      season: '2026',
      stat: {
        gamesPlayed: 128, atBats: 470, runs: 112, hits: 138, doubles: 22, triples: 1,
        homeRuns: 44, rbi: 101, baseOnBalls: 98, strikeOuts: 148, avg: '.294',
        obp: '.412', slg: '.611', ops: '1.023', stolenBases: 8,
      },
    }],
  }],
};
export const mockPitchingSeason = { stats: [{ group: { displayName: 'pitching' }, splits: [] }] };
export const mockHittingCareer = {
  stats: [{
    group: { displayName: 'hitting' },
    splits: [
      { season: '2023', stat: { avg: '.267', homeRuns: 37, ops: '.960' } },
      { season: '2024', stat: { avg: '.322', homeRuns: 58, ops: '1.159' } },
      { season: '2025', stat: { avg: '.301', homeRuns: 41, ops: '1.012' } },
      { season: '2026', stat: { avg: '.294', homeRuns: 44, ops: '1.023' } },
    ],
  }],
};
export const mockPitchingCareer = { stats: [{ group: { displayName: 'pitching' }, splits: [] }] };

export const mockContract = {
  found: true, id: JUDGE_ID, name: 'Aaron Judge (MOCK TEST DATA)',
  team: 'NYY', years: '2023-2031', totalValue: '$360M', aav: '$40M',
};

// Savant-shaped rows. player_id matches Judge; ~40 extra synthetic rows so
// percentile() has a real population to rank against.
function savantPopulation(extra = {}) {
  const rows = [];
  const names = ['Player A','Player B','Player C','Player D','Player E','Player F','Player G','Player H'];
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    rows.push({
      player_id: 400000 + i,
      player_name: names[i % names.length] + ' ' + i,
      whiff_percent: (18 + t * 20).toFixed(1),
      oz_swing_percent: (20 + t * 15).toFixed(1),
      z_contact_percent: (95 - t * 25).toFixed(1),
      zone_percent: (40 + t * 15).toFixed(1),
      groundballs_percent: (35 + t * 20).toFixed(1),
      est_woba: (0.280 + t * 0.13).toFixed(3),
      avg_hit_speed: (86 + t * 8).toFixed(1),
      launch_angle_avg: (6 + t * 14).toFixed(1),
      brl_percent: (4 + t * 12).toFixed(1),
      hard_hit_percent: (28 + t * 22).toFixed(1),
      sweet_spot_percent: (28 + t * 12).toFixed(1),
      ...extra,
    });
  }
  // Judge's own row — deliberately near the top of the pool on the good stats
  rows.push({
    player_id: JUDGE_ID, player_name: 'Aaron Judge (MOCK TEST DATA)',
    whiff_percent: '24.1', oz_swing_percent: '22.8', z_contact_percent: '81.4',
    zone_percent: '46.2', groundballs_percent: '38.9',
    est_woba: '.412', avg_hit_speed: '95.8', launch_angle_avg: '14.2',
    brl_percent: '15.9', hard_hit_percent: '54.2', sweet_spot_percent: '38.7',
    sprint_speed: '27.1', oaa: '4',
  });
  return rows;
}

export const mockExpectedStats = savantPopulation();
export const mockStatcastLeaderboard = savantPopulation();
export const mockBatTracking = savantPopulation().map(r => ({ id: r.player_id, ...r, avg_bat_speed: '73.5', fast_swing_rate: '42.1' }));
export const mockSprintSpeed = [{ player_id: JUDGE_ID, sprint_speed: '27.1' }];
export const mockOaa = [{ player_id: JUDGE_ID, oaa: '4' }];

// Contact-point rows — testing ContactHeatmap.jsx's actual rendering logic
// with properly-shaped data, independent of whether these exact Savant
// field names are the real ones (that's a separate, already-flagged
// question — see api/savant.js's contact_points comment).
export const mockContactPoints = Array.from({ length: 45 }, (_, i) => {
  const jitterX = (Math.sin(i * 17.31) * 10000 % 1);
  const jitterY = (Math.sin(i * 41.7) * 10000 % 1);
  const zone = (i % 9) + 1; // cycle through Statcast zones 1-9 for grid coverage
  const outcomes = ['swinging_strike', 'called_strike', 'foul', 'hit_into_play', 'ball'];
  return {
    player_id: JUDGE_ID,
    batter: JUDGE_ID,
    stand: 'R',
    zone,
    description: outcomes[i % outcomes.length],
    intercept_ball_minus_batter_pos_x_inches: (10 + jitterX * 14).toFixed(1),
    intercept_ball_minus_batter_pos_y_inches: (26 + jitterY * 10).toFixed(1),
  };
});
