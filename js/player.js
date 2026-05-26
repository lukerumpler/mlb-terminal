/* ============================================================
   MLB ANALYTICS DASHBOARD — JARVIS v5
   PLAYER LOGIC: search, fetch, render
   ============================================================ */

/* ── SEARCH ─────────────────────────────────────────────────── */
async function searchPlayer(name) {
  try {
    const res  = await fetch(`/api/mlb?path=/people/search&names=${encodeURIComponent(name)}`);
    const data = await res.json();
    return data.people || [];
  } catch (err) {
    console.error("Player search failed:", err);
    return [];
  }
}

/* ── FETCH PLAYER ────────────────────────────────────────────── */
async function fetchPlayerData(mlbId, year = 2026) {
  try {
    const res  = await fetch(
      `/api/mlb?path=/people/${mlbId}&hydrate=stats(type=season,group=hitting,season=${year}),currentTeam`
    );
    const data = await res.json();
    return data.people?.[0] || null;
  } catch (err) {
    console.error("Player fetch failed:", err);
    return null;
  }
}

/* ── FETCH STATCAST ──────────────────────────────────────────── */
async function fetchStatcastData(year = 2026) {
  try {
    const [expectedRes, statcastRes, batTrackingRes, sprintSpeedRes, oaaRes] = await Promise.all([
      fetch(`/api/savant?endpoint=expected_statistics&year=${year}`),
      fetch(`/api/savant?endpoint=statcast_leaderboard&year=${year}`),
      fetch(`/api/savant?endpoint=bat-tracking&seasonStart=${year}&seasonEnd=${year}`),
      fetch(`/api/savant?endpoint=sprint_speed&year=${year}`),
      fetch(`/api/savant?endpoint=oaa&year=${year}`)
    ]);
    const [expected, statcast, batTracking, sprintSpeed, oaa] = await Promise.all([
      expectedRes.json(), statcastRes.json(), batTrackingRes.json(),
      sprintSpeedRes.json(), oaaRes.json()
    ]);
    return { expected, statcast, batTracking, sprintSpeed, oaa };
  } catch (err) {
    console.error("Statcast fetch failed:", err);
    return { expected: [], statcast: [], batTracking: [], sprintSpeed: [], oaa: [] };
  }
}

/* ── FIND STATCAST PLAYER ────────────────────────────────────── */
function findStatcastPlayer(data, mlbId) {
  const id  = String(mlbId);
  const find = (arr) => Array.isArray(arr) ? arr.find(p => String(p.player_id) === id) || null : null;
  return {
    expected:    find(data.expected),
    statcast:    find(data.statcast),
    batTracking: find(data.batTracking),
    sprintSpeed: find(data.sprintSpeed),
    oaa:         find(data.oaa)
  };
}

/* ── MAIN LOAD ───────────────────────────────────────────────── */
async function loadPlayer() {
  const searchInput = document.getElementById("psearch");
  const query = searchInput?.value?.trim();

  if (!query) {
    alert("Please enter a player name in the search box.");
    return;
  }

  setHeroLoading();

  try {
    let mlbId, player;
    const isNumericId = /^\d+$/.test(query);

    if (isNumericId) {
      mlbId  = query;
      player = { id: mlbId, fullName: query };
    } else {
      const results = await searchPlayer(query);
      if (!results.length) { setHeroError("PLAYER NOT FOUND", "TRY ANOTHER NAME"); return; }
      player = results[0];
      mlbId  = player.id;
    }

    const [playerData, savantData] = await Promise.all([
      fetchPlayerData(mlbId),
      fetchStatcastData()
    ]);

    if (!playerData) { setHeroError("DATA UNAVAILABLE", ""); return; }

    const { expected, statcast, batTracking, sprintSpeed, oaa } = findStatcastPlayer(savantData, mlbId);
    const scoutingGrades    = calculateScoutingGrades(statcast, sprintSpeed, oaa);
    const contractProjection = projectContract(playerData, { war: 3.5 });

    console.log("✅ Player:", playerData?.fullName);
    console.log("   Statcast:", statcast ? "FOUND" : "NOT FOUND");
    console.log("   Expected:", expected ? "FOUND" : "NOT FOUND");

    renderHero(playerData, statcast);
    renderQuickStats(playerData, statcast);
    renderSeasonStats(playerData);
    renderFlags(playerData, expected, statcast, oaa);
    renderBattingTable(playerData);
    renderAdvanced(expected, statcast, scoutingGrades, contractProjection);
    renderScoutingGrades(scoutingGrades);
    renderContractProjection(contractProjection);
    renderSeasonProjections(playerData);
    renderTeam(playerData);

  } catch (err) {
    console.error("Load player error:", err);
    setHeroError("ERROR LOADING", "CHECK CONSOLE");
  }
}

/* ── HERO STATE HELPERS ──────────────────────────────────────── */
function setHeroLoading() {
  const n = document.getElementById("hero-name");
  const t = document.getElementById("hero-team");
  if (n) n.textContent = "LOADING...";
  if (t) t.textContent = "FETCHING DATA";
}
function setHeroError(msg, sub) {
  const n = document.getElementById("hero-name");
  const t = document.getElementById("hero-team");
  if (n) n.textContent = msg;
  if (t) t.textContent = sub;
}

/* ── HERO ────────────────────────────────────────────────────── */
function renderHero(player, statcast) {
  if (!player) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set("hero-name", player.fullName?.toUpperCase() || "UNKNOWN");
  set("hero-team", player.currentTeam?.name?.toUpperCase() || "—");
  set("hero-pos",  player.primaryPosition?.abbreviation || "—");
  set("hero-age",  player.currentAge ? `AGE ${player.currentAge}` : "—");
  set("hero-bats", (player.batSide?.code && player.pitchHand?.code)
    ? `B/T: ${player.batSide.code}/${player.pitchHand.code}` : "—");

  // Headshot — high resolution
  const photo = document.getElementById("hero-photo");
  if (photo) {
    photo.src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`;
    photo.alt = player.fullName;
  }

  // Team color stripe on photo
  const stripe = document.getElementById("hero-team-stripe");
  if (stripe && typeof TEAM_COLORS !== "undefined" && player.currentTeam?.id) {
    const colors = TEAM_COLORS[player.currentTeam.id];
    if (colors) stripe.style.background = colors.primary;
  }
}

/* ── QUICK STATS ─────────────────────────────────────────────── */
function renderQuickStats(player, statcast) {
  const s   = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("stat-avg", s.avg       ? Number(s.avg).toFixed(3) : ".000");
  set("stat-hr",  s.homeRuns  ?? "0");
  set("stat-rbi", s.rbi       ?? "0");
  set("stat-ops", s.ops       ? Number(s.ops).toFixed(3) : ".000");
}

/* ── SEASON STATS TABLE ──────────────────────────────────────── */
function renderSeasonStats(player) {
  const s     = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const tbody = document.getElementById("season-stats-body");
  if (!tbody) return;
  const rows = [
    ["Games",        s.gamesPlayed  ?? "—"],
    ["At Bats",      s.atBats       ?? "—"],
    ["Hits",         s.hits         ?? "—"],
    ["Doubles",      s.doubles      ?? "—"],
    ["Home Runs",    s.homeRuns     ?? "—"],
    ["RBI",          s.rbi          ?? "—"],
    ["AVG",          s.avg          ? Number(s.avg).toFixed(3)  : "—"],
    ["OBP",          s.obp          ? Number(s.obp).toFixed(3)  : "—"],
    ["SLG",          s.slg          ? Number(s.slg).toFixed(3)  : "—"],
    ["OPS",          s.ops          ? Number(s.ops).toFixed(3)  : "—"],
    ["Stolen Bases", s.stolenBases  ?? "—"],
    ["Strikeouts",   s.strikeOuts   ?? "—"],
    ["Walks",        s.baseOnBalls  ?? "—"]
  ];
  tbody.innerHTML = rows.map(([label, value]) =>
    `<tr><td>${label}</td><td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${value}</td><td style="color:var(--text-dim)">—</td></tr>`
  ).join("");
}

/* ── FLAGS ───────────────────────────────────────────────────── */
function renderFlags(player, expected, statcast, oaa) {
  const container = document.getElementById("flags-container");
  if (!container) return;
  const s     = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const flags = [];

  if (expected?.est_woba && expected.est_woba > 0.400)
    flags.push({ icon: "🔥", title: "Elite xwOBA",
      desc: `${Number(expected.est_woba).toFixed(3)} xwOBA ranks in the top tier league-wide.` });
  if (statcast?.avg_hit_speed && statcast.avg_hit_speed > 92)
    flags.push({ icon: "💥", title: "Hard Contact Machine",
      desc: `${statcast.avg_hit_speed} mph average exit velocity.` });
  if (statcast?.brl_percent && statcast.brl_percent > 10)
    flags.push({ icon: "🎯", title: "Elite Barrel Rate",
      desc: `${statcast.brl_percent}% barrel rate is elite.` });
  if ((s.homeRuns ?? 0) >= 20)
    flags.push({ icon: "💣", title: "Power Threat",
      desc: `${s.homeRuns} home runs this season.` });
  if ((s.stolenBases ?? 0) >= 15)
    flags.push({ icon: "🏃", title: "Speed Weapon",
      desc: `${s.stolenBases} stolen bases this season.` });
  if (oaa?.oaa && oaa.oaa >= 10)
    flags.push({ icon: "🧤", title: "Elite Defender",
      desc: `${oaa.oaa} Outs Above Average ranks among the league's best.` });
  else if (oaa?.oaa && oaa.oaa <= -5)
    flags.push({ icon: "⚠️", title: "Defensive Liability",
      desc: `${oaa.oaa} OAA indicates below-average defense.` });
  if (expected?.est_ba_minus_ba_diff && expected.est_ba_minus_ba_diff > 0.020)
    flags.push({ icon: "📈", title: "Due For Regression Up",
      desc: `xBA is ${Number(expected.est_ba_minus_ba_diff).toFixed(3)} above actual BA — expect improvement.` });
  if (!flags.length)
    flags.push({ icon: "📋", title: "Player Loaded",
      desc: `${player?.fullName} data loaded successfully.` });

  container.innerHTML = flags.map(f => `
    <div class="flag-card">
      <div class="flag-icon">${f.icon}</div>
      <div>
        <div class="flag-title">${f.title}</div>
        <div class="flag-desc">${f.desc}</div>
      </div>
    </div>`).join("");
}

/* ── BATTING TABLE ───────────────────────────────────────────── */
function renderBattingTable(player) {
  const tbody = document.getElementById("batting-stats-body");
  if (!tbody) return;
  const splits = player?.stats?.[0]?.splits || [];
  if (!splits.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-dim)">No batting data available</td></tr>`;
    return;
  }
  tbody.innerHTML = splits.map(split => {
    const s = split.stat;
    return `<tr>
      <td>${split.season || "—"}</td>
      <td>${s.gamesPlayed ?? "—"}</td><td>${s.atBats ?? "—"}</td>
      <td>${s.hits ?? "—"}</td><td>${s.doubles ?? "—"}</td>
      <td>${s.homeRuns ?? "—"}</td><td>${s.rbi ?? "—"}</td>
      <td>${s.avg ? Number(s.avg).toFixed(3) : "—"}</td>
      <td>${s.obp ? Number(s.obp).toFixed(3) : "—"}</td>
      <td>${s.slg ? Number(s.slg).toFixed(3) : "—"}</td>
      <td>${s.ops ? Number(s.ops).toFixed(3) : "—"}</td>
    </tr>`;
  }).join("");
}

/* ── 20-80 SCOUTING GRADES ───────────────────────────────────── */
function calculateScoutingGrades(statcast, sprintSpeed, oaa) {
  const grades = {};
  if (statcast?.avg_hit_speed) {
    if      (statcast.avg_hit_speed >= 95) grades.exitVelo = 80;
    else if (statcast.avg_hit_speed >= 92) grades.exitVelo = 70;
    else if (statcast.avg_hit_speed >= 89) grades.exitVelo = 60;
    else if (statcast.avg_hit_speed >= 86) grades.exitVelo = 50;
    else if (statcast.avg_hit_speed >= 83) grades.exitVelo = 40;
    else                                    grades.exitVelo = 30;
  }
  if (sprintSpeed?.sprint_speed) {
    if      (sprintSpeed.sprint_speed >= 30) grades.sprintSpeed = 80;
    else if (sprintSpeed.sprint_speed >= 29) grades.sprintSpeed = 70;
    else if (sprintSpeed.sprint_speed >= 28) grades.sprintSpeed = 60;
    else if (sprintSpeed.sprint_speed >= 27) grades.sprintSpeed = 50;
    else if (sprintSpeed.sprint_speed >= 26) grades.sprintSpeed = 40;
    else                                      grades.sprintSpeed = 30;
  }
  if (oaa?.oaa !== undefined) {
    if      (oaa.oaa >= 15) grades.fielding = 80;
    else if (oaa.oaa >= 10) grades.fielding = 70;
    else if (oaa.oaa >= 5)  grades.fielding = 60;
    else if (oaa.oaa >= 0)  grades.fielding = 50;
    else if (oaa.oaa >= -5) grades.fielding = 40;
    else                     grades.fielding = 30;
  }
  return grades;
}

/* ── CONTRACT PROJECTION ─────────────────────────────────────── */
function projectContract(player, stats) {
  const currentAge   = player?.currentAge || 25;
  const warPerYear   = stats?.war || 2.0;
  const dollarsPerWar = 8000000;
  let projectedWar = warPerYear;
  if (currentAge > 29) {
    projectedWar = Math.max(0.5, warPerYear - ((currentAge - 29) * 0.2));
  }
  const projectedAAV = projectedWar * dollarsPerWar;
  const years        = Math.max(1, 6 - Math.floor((currentAge - 25) / 2));
  const totalValue   = projectedAAV * years;
  return {
    projectedAAV:  projectedAAV.toFixed(0),
    years,
    totalValue:    totalValue.toFixed(0),
    estimatedWar:  projectedWar.toFixed(1)
  };
}

/* ── ADVANCED METRICS ────────────────────────────────────────── */
function renderAdvanced(expected, statcast, scoutingGrades, contractProjection) {
  const container = document.getElementById("advanced-stats-container");
  if (!container) return;
  if (!expected && !statcast) {
    container.innerHTML = `<p style="color:var(--text-dim);text-align:center;padding:20px">No Statcast data available.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell">
        <div class="stat-label">xBA</div>
        <div class="stat-val">${expected?.est_ba ? Number(expected.est_ba).toFixed(3) : "—"}</div>
        <div class="stat-rank">Expected BA</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">xSLG</div>
        <div class="stat-val">${expected?.est_slg ? Number(expected.est_slg).toFixed(3) : "—"}</div>
        <div class="stat-rank">Expected SLG</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">xwOBA</div>
        <div class="stat-val">${expected?.est_woba ? Number(expected.est_woba).toFixed(3) : "—"}</div>
        <div class="stat-rank">Expected wOBA</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Exit Velo</div>
        <div class="stat-val">${statcast?.avg_hit_speed ? Number(statcast.avg_hit_speed).toFixed(1) : "—"}</div>
        <div class="stat-rank">Avg Exit Velocity</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Barrel%</div>
        <div class="stat-val">${statcast?.brl_percent != null ? statcast.brl_percent + "%" : "—"}</div>
        <div class="stat-rank">Barrel Rate</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Hard Hit%</div>
        <div class="stat-val">${statcast?.hard_hit_percent != null ? statcast.hard_hit_percent + "%" : "—"}</div>
        <div class="stat-rank">Hard Hit Rate</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">K%</div>
        <div class="stat-val">${statcast?.k_percent != null ? statcast.k_percent + "%" : "—"}</div>
        <div class="stat-rank">Strikeout Rate</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">BB%</div>
        <div class="stat-val">${statcast?.bb_percent != null ? statcast.bb_percent + "%" : "—"}</div>
        <div class="stat-rank">Walk Rate</div>
      </div>
    </div>`;
}

/* ── SCOUTING GRADES RENDER ──────────────────────────────────── */
function renderScoutingGrades(scoutingGrades) {
  const container = document.getElementById("scouting-grades-container");
  if (!container) return;
  const gradeColor = g => g >= 70 ? "var(--green)" : g >= 55 ? "var(--blue-bright)" : g >= 45 ? "#fff" : g >= 35 ? "var(--gold)" : "var(--red)";
  container.innerHTML = `
    <div class="stat-cell">
      <div class="stat-label">Exit Velo</div>
      <div class="stat-val" style="color:${gradeColor(scoutingGrades?.exitVelo)}">${scoutingGrades?.exitVelo || "—"}</div>
      <div class="stat-rank">Raw Power</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Sprint Speed</div>
      <div class="stat-val" style="color:${gradeColor(scoutingGrades?.sprintSpeed)}">${scoutingGrades?.sprintSpeed || "—"}</div>
      <div class="stat-rank">Speed</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Fielding</div>
      <div class="stat-val" style="color:${gradeColor(scoutingGrades?.fielding)}">${scoutingGrades?.fielding || "—"}</div>
      <div class="stat-rank">Defense (OAA)</div>
    </div>`;
}

/* ── CONTRACT PROJECTION RENDER ──────────────────────────────── */
function renderContractProjection(contractProjection) {
  const container = document.getElementById("contract-projection-container");
  if (!container) return;
  const aav   = parseInt(contractProjection?.projectedAAV) || 0;
  const total = parseInt(contractProjection?.totalValue)   || 0;
  container.innerHTML = `
    <div class="stat-cell">
      <div class="stat-label">Est. AAV</div>
      <div class="stat-val">$${(aav / 1000000).toFixed(1)}M</div>
      <div class="stat-rank">Annual Average Value</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Years</div>
      <div class="stat-val">${contractProjection?.years || "—"}</div>
      <div class="stat-rank">Projected Length</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Total Value</div>
      <div class="stat-val">$${(total / 1000000).toFixed(0)}M</div>
      <div class="stat-rank">Total Contract</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Est. WAR</div>
      <div class="stat-val">${contractProjection?.estimatedWar || "—"}</div>
      <div class="stat-rank">WAR per Season</div>
    </div>`;
}

/* ── SEASON PROJECTIONS RENDER ───────────────────────────────── */
function renderSeasonProjections(playerData) {
  const container = document.getElementById("season-projections-container");
  if (!container) return;
  // Placeholder projections — replace with real projection system
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="stat-label">2026 AVG</div><div class="stat-val">.290</div><div class="stat-rank">↑ +10 pts</div></div>
      <div class="stat-cell"><div class="stat-label">2026 HR</div><div class="stat-val">35</div><div class="stat-rank">Projected HRs</div></div>
      <div class="stat-cell"><div class="stat-label">2026 RBI</div><div class="stat-val">95</div><div class="stat-rank">Projected RBIs</div></div>
      <div class="stat-cell"><div class="stat-label">2026 WAR</div><div class="stat-val">4.5</div><div class="stat-rank">All-Star Range</div></div>
    </div>`;
}

/* ── TEAM STATS (called after player load) ───────────────────── */
async function renderTeam(player) {
  if (!player) return;
  const teamId = player.currentTeam?.id;
  if (!teamId) return;

  try {
    const [standingsRes, rosterRes, hittingRes, pitchingRes] = await Promise.all([
      fetch(`/api/mlb?path=/standings&leagueId=103,104&season=2026`),
      fetch(`/api/mlb?path=/teams/${teamId}/roster&rosterType=active&season=2026`),
      fetch(`/api/mlb?path=/teams/${teamId}/stats&group=hitting&season=2026&stats=season&gameType=R`),
      fetch(`/api/mlb?path=/teams/${teamId}/stats&group=pitching&season=2026&stats=season&gameType=R`)
    ]);

    const [standingsData, rosterData, hittingData, pitchingData] = await Promise.all([
      standingsRes.json(), rosterRes.json(), hittingRes.json(), pitchingRes.json()
    ]);

    renderStandings(standingsData, teamId);
    renderRoster(rosterData);
    renderTeamOffenseCards(hittingData);
    renderTeamPitchingCards(pitchingData);

  } catch (err) {
    console.error("Team stats error:", err);
  }
}

/* ── SELECT PLAYER BY NAME (roster click) ────────────────────── */
function selectPlayerByName(fullName) {
  const input = document.getElementById("psearch");
  if (input) input.value = fullName;
  switchTab("profile");
  loadPlayer();
}
