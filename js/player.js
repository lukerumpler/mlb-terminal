/* ============================================================
   MLB ANALYTICS DASHBOARD — JARVIS v5
   PLAYER LOGIC: search, fetch, render, advanced metrics
   ============================================================ */

/* ── UTILS ─────────────────────────────────────────────────── */
function formatStat(val, decimals = 3) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  const num = Number(val).toFixed(decimals);
  // Remove leading zero for batting averages (e.g., 0.300 -> .300)
  return num.startsWith("0.") ? num.substring(1) : num;
}

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
let _statcastCache = null;

async function fetchStatcastData(year = 2026) {
  if (_statcastCache) return _statcastCache;
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
    _statcastCache = { expected, statcast, batTracking, sprintSpeed, oaa };
    return _statcastCache;
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
    
    const advancedMetrics = calculateAdvancedMetrics(playerData, expected, statcast, oaa);
    const scoutingGrades    = calculateScoutingGrades(statcast, sprintSpeed, oaa);
    const contractProjection = projectContract(playerData, { war: advancedMetrics.projWar });

    renderHero(playerData, statcast);
    renderQuickStats(playerData, statcast);
    renderSeasonStats(playerData);
    renderFlags(playerData, expected, statcast, oaa);
    renderBattingTable(playerData);
    renderAdvanced(expected, statcast, scoutingGrades, contractProjection, advancedMetrics);
    renderScoutingGrades(scoutingGrades);
    renderContractProjection(contractProjection);
    renderSeasonProjections(playerData, advancedMetrics);
    renderTeam(playerData);

  } catch (err) {
    console.error("Load player error:", err);
    setHeroError("ERROR LOADING", "CHECK CONSOLE");
  }
}

/* ── ADVANCED CALCS ─────────────────────────────────────────── */
function calculateAdvancedMetrics(player, expected, statcast, oaa) {
  const s = player?.stats?.[0]?.splits?.[0]?.stat || {};
  
  // Fantasy Points (Standard Points League)
  const hits = s.hits || 0;
  const dbls = s.doubles || 0;
  const trpl = s.triples || 0;
  const hr   = s.homeRuns || 0;
  const tb   = (hits - dbls - trpl - hr) + (dbls * 2) + (trpl * 3) + (hr * 4);
  const fantasyPoints = (tb) + (s.runs || 0) + (s.rbi || 0) + (s.baseOnBalls || 0) + (s.stolenBases || 0) - ((s.strikeOuts || 0) * 0.5);
  
  // Projected WAR (xwOBA + Defense regression)
  const xwOBA = expected?.est_woba || 0.320;
  const defensiveValue = (oaa?.oaa || 0) * 0.5;
  let projWar = ((xwOBA - 0.320) * 20) + defensiveValue + 2.0;
  projWar = Math.max(0, projWar);

  return {
    fantasyPoints: fantasyPoints.toFixed(1),
    projWar: projWar.toFixed(1),
    xwOBA: xwOBA.toFixed(3)
  };
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
  const photo = document.getElementById("hero-photo");
  if (photo) photo.src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`;
}

/* ── QUICK STATS ─────────────────────────────────────────────── */
function renderQuickStats(player, statcast) {
  const s   = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("stat-avg", formatStat(s.avg));
  set("stat-hr",  s.homeRuns  ?? "0");
  set("stat-rbi", s.rbi       ?? "0");
  set("stat-ops", formatStat(s.ops));
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
    ["Home Runs",    s.homeRuns     ?? "—"],
    ["RBI",          s.rbi          ?? "—"],
    ["AVG",          formatStat(s.avg)],
    ["OBP",          formatStat(s.obp)],
    ["SLG",          formatStat(s.slg)],
    ["OPS",          formatStat(s.ops)]
  ];
  tbody.innerHTML = rows.map(([label, value]) =>
    `<tr><td>${label}</td><td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${value}</td><td style="color:var(--text-dim)">—</td></tr>`
  ).join("");
}

/* ── BATTING TABLE ───────────────────────────────────────────── */
function renderBattingTable(player) {
  const tbody = document.getElementById("batting-stats-body");
  if (!tbody) return;
  const splits = player?.stats?.[0]?.splits || [];
  if (!splits.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-dim)">No batting data</td></tr>`;
    return;
  }
  tbody.innerHTML = splits.map(split => {
    const s = split.stat;
    return `<tr>
      <td>${split.season || "—"}</td>
      <td>${s.gamesPlayed ?? "—"}</td><td>${s.atBats ?? "—"}</td>
      <td>${s.hits ?? "—"}</td><td>${s.homeRuns ?? "—"}</td>
      <td>${formatStat(s.avg)}</td>
      <td>${formatStat(s.ops)}</td>
    </tr>`;
  }).join("");
}

/* ── HERO HELPERS ────────────────────────────────────────────── */
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

/* ── 20-80 SCOUTING GRADES ───────────────────────────────────── */
function calculateScoutingGrades(statcast, sprintSpeed, oaa) {
  const grades = { exitVelo: 50, sprintSpeed: 50, fielding: 50 };
  if (statcast?.avg_hit_speed) {
    const ev = statcast.avg_hit_speed;
    grades.exitVelo = ev >= 95 ? 80 : ev >= 92 ? 70 : ev >= 89 ? 60 : ev >= 86 ? 50 : 40;
  }
  if (sprintSpeed?.sprint_speed) {
    const ss = sprintSpeed.sprint_speed;
    grades.sprintSpeed = ss >= 30 ? 80 : ss >= 29 ? 70 : ss >= 28 ? 60 : ss >= 27 ? 50 : 40;
  }
  if (oaa?.oaa !== undefined) {
    const d = oaa.oaa;
    grades.fielding = d >= 15 ? 80 : d >= 10 ? 70 : d >= 5 ? 60 : d >= 0 ? 50 : 40;
  }
  return grades;
}

/* ── CONTRACT PROJECTION ─────────────────────────────────────── */
function projectContract(player, stats) {
  const age = player?.currentAge || 25;
  const war = parseFloat(stats?.war) || 2.0;
  const aav = war * 8000000;
  const yrs = Math.max(1, 6 - Math.floor((age - 25) / 2));
  return {
    projectedAAV: aav.toFixed(0),
    years: yrs,
    totalValue: (aav * yrs).toFixed(0),
    estimatedWar: war.toFixed(1)
  };
}

/* ── RENDERERS ───────────────────────────────────────────────── */
function renderAdvanced(expected, statcast, scoutingGrades, contractProjection, advanced) {
  const container = document.getElementById("advanced-stats-container");
  if (!container) return;
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="stat-label">xwOBA</div><div class="stat-val">${advanced.xwOBA}</div><div class="stat-rank">Expected wOBA</div></div>
      <div class="stat-cell"><div class="stat-label">Exit Velo</div><div class="stat-val">${statcast?.avg_hit_speed || "—"}</div><div class="stat-rank">Avg EV</div></div>
      <div class="stat-cell"><div class="stat-label">Barrel%</div><div class="stat-val">${statcast?.brl_percent || "—"}%</div><div class="stat-rank">Barrel Rate</div></div>
      <div class="stat-cell"><div class="stat-label">Hard Hit%</div><div class="stat-val">${statcast?.hard_hit_percent || "—"}%</div><div class="stat-rank">Hard Hit Rate</div></div>
    </div>`;
}

function renderScoutingGrades(scoutingGrades) {
  const container = document.getElementById("scouting-grades-container");
  if (!container) return;
  const color = g => g >= 70 ? "var(--green)" : g >= 50 ? "#fff" : "var(--red)";
  container.innerHTML = `
    <div class="stat-cell"><div class="stat-label">Power</div><div class="stat-val" style="color:${color(scoutingGrades.exitVelo)}">${scoutingGrades.exitVelo}</div></div>
    <div class="stat-cell"><div class="stat-label">Speed</div><div class="stat-val" style="color:${color(scoutingGrades.sprintSpeed)}">${scoutingGrades.sprintSpeed}</div></div>
    <div class="stat-cell"><div class="stat-label">Defense</div><div class="stat-val" style="color:${color(scoutingGrades.fielding)}">${scoutingGrades.fielding}</div></div>`;
}

function renderContractProjection(contractProjection) {
  const container = document.getElementById("contract-projection-container");
  if (!container) return;
  container.innerHTML = `
    <div class="stat-cell"><div class="stat-label">Est. AAV</div><div class="stat-val">$${(contractProjection.projectedAAV/1e6).toFixed(1)}M</div></div>
    <div class="stat-cell"><div class="stat-label">Years</div><div class="stat-val">${contractProjection.years}</div></div>
    <div class="stat-cell"><div class="stat-label">Total</div><div class="stat-val">$${(contractProjection.totalValue/1e6).toFixed(0)}M</div></div>`;
}

function renderSeasonProjections(playerData, advanced) {
  const container = document.getElementById("season-projections-container");
  if (!container) return;
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="stat-label">PROJ WAR</div><div class="stat-val">${advanced.projWar}</div><div class="stat-rank">Full Season</div></div>
      <div class="stat-cell"><div class="stat-label">FANTASY PTS</div><div class="stat-val">${advanced.fantasyPoints}</div><div class="stat-rank">Current Points</div></div>
    </div>`;
}

function renderFlags(player, expected, statcast, oaa) {
  const container = document.getElementById("flags-container");
  if (!container) return;
  const s = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const flags = [];
  if (expected?.est_woba && expected.est_woba > 0.400) flags.push({ icon: "🔥", title: "Elite xwOBA", desc: `${formatStat(expected.est_woba)} xwOBA.` });
  if (statcast?.avg_hit_speed && statcast.avg_hit_speed > 92) flags.push({ icon: "💥", title: "Hard Contact", desc: `${statcast.avg_hit_speed} mph Avg EV.` });
  if (statcast?.brl_percent && statcast.brl_percent > 10) flags.push({ icon: "🎯", title: "Barrel Rate", desc: `${statcast.brl_percent}% barrel rate.` });
  container.innerHTML = flags.map(f => `<div class="flag-card"><div class="flag-icon">${f.icon}</div><div><div class="flag-title">${f.title}</div><div class="flag-desc">${f.desc}</div></div></div>`).join("");
}

async function renderTeam(player) {
  if (!player) return;
  const teamId = player.currentTeam?.id;
  if (teamId && typeof loadTeam === "function") loadTeam(teamId);
}

function selectPlayerByName(fullName) {
  const input = document.getElementById("psearch");
  if (input) input.value = fullName;
  if (typeof switchTab === "function") switchTab("profile");
  loadPlayer();
}

/* ── FUTURE FRAMEWORK: COLLEGE & MINOR LEAGUES ──────────────── */
// Framework for college data
async function getCollegeMatches() {
  if (typeof rapidFetch !== "function") return [];
  return await rapidFetch("/matches");
}

// Framework for minor league data
async function getMinorLeagueStats(playerId, year = 2026) {
  try {
    const res = await fetch(`/api/mlb?path=/people/${playerId}/stats?stats=season&group=hitting&season=${year}&sportId=11,12,13,14`);
    return await res.json();
  } catch (err) {
    console.error("Minor league fetch failed:", err);
    return null;
  }
}
