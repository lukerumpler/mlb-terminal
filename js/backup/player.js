/* ============================================================
   MLB INTELLIGENCE TERMINAL - PLAYER LOGIC
   ============================================================ */

/* ── SEARCH ─────────────────────────────────────────────────── */
async function searchPlayer(name) {
  try {
    const res = await fetch(`/api/mlb?path=/people/search&names=${encodeURIComponent(name)}`);
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
    const res = await fetch(
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
    const [expectedRes, statcastRes] = await Promise.all([
      fetch(`/api/savant?endpoint=expected_statistics&year=${year}`),
      fetch(`/api/savant?endpoint=statcast_leaderboard&year=${year}`)
    ]);
    const expected = await expectedRes.json();
    const statcast = await statcastRes.json();
    return { expected, statcast };
  } catch (err) {
    console.error("Statcast fetch failed:", err);
    return { expected: [], statcast: [] };
  }
}

/* ── FIND STATCAST PLAYER ────────────────────────────────────── */
function findStatcastPlayer(data, mlbId) {
  const id = String(mlbId);
  const expected = Array.isArray(data.expected)
    ? data.expected.find(p => String(p.player_id) === id) || null
    : null;
  const statcast = Array.isArray(data.statcast)
    ? data.statcast.find(p => String(p.player_id) === id) || null
    : null;
  return { expected, statcast };
}

/* ── MAIN LOAD ───────────────────────────────────────────────── */
async function loadPlayer() {
  const searchInput = document.querySelector("#psearch, .cmd-bar input");
  const query = searchInput?.value?.trim();

  if (!query) {
    alert("Please search for a player first.");
    return;
  }

  setHeroLoading();

  try {
    let mlbId, player;
    const isNumericId = /^\d+$/.test(query);

    if (isNumericId) {
      mlbId = query;
      player = { id: mlbId, fullName: query };
    } else {
      const results = await searchPlayer(query);
      if (!results.length) {
        setHeroError("PLAYER NOT FOUND", "TRY ANOTHER NAME");
        return;
      }
      player = results[0];
      mlbId = player.id;
    }

    const [playerData, savantData] = await Promise.all([
      fetchPlayerData(mlbId),
      fetchStatcastData()
    ]);

    if (!playerData) { setHeroError("DATA UNAVAILABLE", ""); return; }

    const { expected, statcast } = findStatcastPlayer(savantData, mlbId);

    console.log("Player:", playerData?.fullName);
    console.log("Stats:", playerData?.stats?.[0]?.splits?.[0]?.stat);
    console.log("Statcast:", statcast ? "FOUND" : "NOT FOUND");
    console.log("Expected:", expected ? "FOUND" : "NOT FOUND");

    renderHero(playerData, statcast);
    renderQuickStats(playerData, statcast);
    renderSeasonStats(playerData);
    renderFlags(playerData, expected, statcast);
    renderBattingTable(playerData);
    renderAdvanced(expected, statcast);
    renderTeam(playerData);

  } catch (err) {
    console.error("Load player error:", err);
    setHeroError("ERROR LOADING", "CHECK CONSOLE");
  }
}

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
  set("hero-name",  player.fullName?.toUpperCase() || "UNKNOWN");
  set("hero-team",  player.currentTeam?.name?.toUpperCase() || "—");
  set("hero-pos",   player.primaryPosition?.abbreviation || "—");
  set("hero-age",   player.currentAge ? `AGE ${player.currentAge}` : "—");
  set("hero-bats",  (player.batSide?.code && player.pitchHand?.code)
    ? `B/T: ${player.batSide.code}/${player.pitchHand.code}` : "—");

  const photo = document.getElementById("hero-photo");
  if (photo) {
    photo.src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`;
    photo.alt = player.fullName;
  }
}

/* ── QUICK STATS ─────────────────────────────────────────────── */
function renderQuickStats(player, statcast) {
  const s = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("stat-avg", s.avg ? Number(s.avg).toFixed(3) : ".000");
  set("stat-hr",  s.homeRuns ?? "0");
  set("stat-rbi", s.rbi ?? "0");
  set("stat-ops", s.ops ? Number(s.ops).toFixed(3) : ".000");
}

/* ── SEASON STATS TABLE ──────────────────────────────────────── */
function renderSeasonStats(player) {
  const s = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const tbody = document.getElementById("season-stats-body");
  if (!tbody) return;
  const rows = [
    ["Games", s.gamesPlayed ?? "—"],
    ["At Bats", s.atBats ?? "—"],
    ["Hits", s.hits ?? "—"],
    ["Doubles", s.doubles ?? "—"],
    ["Home Runs", s.homeRuns ?? "—"],
    ["RBI", s.rbi ?? "—"],
    ["AVG", s.avg ? Number(s.avg).toFixed(3) : "—"],
    ["OBP", s.obp ? Number(s.obp).toFixed(3) : "—"],
    ["SLG", s.slg ? Number(s.slg).toFixed(3) : "—"],
    ["OPS", s.ops ? Number(s.ops).toFixed(3) : "—"],
    ["Stolen Bases", s.stolenBases ?? "—"],
    ["Strikeouts", s.strikeOuts ?? "—"],
    ["Walks", s.baseOnBalls ?? "—"]
  ];
  tbody.innerHTML = rows.map(([label, value]) =>
    `<tr><td>${label}</td><td>${value}</td><td style="color:var(--text-dim)">—</td></tr>`
  ).join("");
}

/* ── FLAGS ───────────────────────────────────────────────────── */
function renderFlags(player, expected, statcast) {
  const container = document.getElementById("flags-container");
  if (!container) return;
  const s = player?.stats?.[0]?.splits?.[0]?.stat || {};
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
  if (expected?.est_ba_minus_ba_diff && expected.est_ba_minus_ba_diff > 0.020)
    flags.push({ icon: "📈", title: "Due For Regression Up",
      desc: `xBA is ${Number(expected.est_ba_minus_ba_diff).toFixed(3)} above actual BA — expect improvement.` });
  if (!flags.length)
    flags.push({ icon: "📋", title: "Player Loaded",
      desc: `${player?.fullName} data loaded successfully.` });

  container.innerHTML = flags.map(f => `
    <div class="flag-card">
      <div class="flag-icon">${f.icon}</div>
      <div><div class="flag-title">${f.title}</div><div class="flag-desc">${f.desc}</div></div>
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

/* ── ADVANCED METRICS ────────────────────────────────────────── */
function renderAdvanced(expected, statcast) {
  const container = document.getElementById("advanced-stats-container");
  if (!container) return;
  if (!expected && !statcast) {
    container.innerHTML = `<p style="color:var(--text-dim);text-align:center;padding:20px">No Statcast data available.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="stat-label">xBA</div>
        <div class="stat-val">${expected?.est_ba ? Number(expected.est_ba).toFixed(3) : "—"}</div>
        <div class="stat-rank">Expected BA</div></div>
      <div class="stat-cell"><div class="stat-label">xSLG</div>
        <div class="stat-val">${expected?.est_slg ? Number(expected.est_slg).toFixed(3) : "—"}</div>
        <div class="stat-rank">Expected SLG</div></div>
      <div class="stat-cell"><div class="stat-label">xwOBA</div>
        <div class="stat-val">${expected?.est_woba ? Number(expected.est_woba).toFixed(3) : "—"}</div>
        <div class="stat-rank">Expected wOBA</div></div>
      <div class="stat-cell"><div class="stat-label">Exit Velo</div>
        <div class="stat-val">${statcast?.avg_hit_speed ? Number(statcast.avg_hit_speed).toFixed(1) : "—"}</div>
        <div class="stat-rank">Avg Exit Velocity</div></div>
      <div class="stat-cell"><div class="stat-label">Barrel%</div>
        <div class="stat-val">${statcast?.brl_percent != null ? statcast.brl_percent + "%" : "—"}</div>
        <div class="stat-rank">Barrel Rate</div></div>
      <div class="stat-cell"><div class="stat-label">Hard Hit%</div>
        <div class="stat-val">${statcast?.hard_hit_percent != null ? statcast.hard_hit_percent + "%" : "—"}</div>
        <div class="stat-rank">Hard Hit Rate</div></div>
      <div class="stat-cell"><div class="stat-label">K%</div>
        <div class="stat-val">${statcast?.k_percent != null ? statcast.k_percent + "%" : "—"}</div>
        <div class="stat-rank">Strikeout Rate</div></div>
      <div class="stat-cell"><div class="stat-label">BB%</div>
        <div class="stat-val">${statcast?.bb_percent != null ? statcast.bb_percent + "%" : "—"}</div>
        <div class="stat-rank">Walk Rate</div></div>
    </div>`;
}

/* ── TEAM STATS — FIXED API CALLS ────────────────────────────── */
async function renderTeam(player) {
  if (!player) return;
  const teamId = player.currentTeam?.id;
  if (!teamId) return;

  try {
    const [standingsRes, rosterRes, hittingRes, pitchingRes] = await Promise.all([
      fetch(`/api/mlb?path=/standings&leagueId=103,104&season=2026`),
      fetch(`/api/mlb?path=/teams/${teamId}/roster&rosterType=active&season=2026`),
      // ✅ FIXED: use /teams/{id}/stats endpoint instead of hydrate on /teams/{id}
      fetch(`/api/mlb?path=/teams/${teamId}/stats&group=hitting&season=2026&stats=season&gameType=R`),
      fetch(`/api/mlb?path=/teams/${teamId}/stats&group=pitching&season=2026&stats=season&gameType=R`)
    ]);

    const [standingsData, rosterData, hittingData, pitchingData] = await Promise.all([
      standingsRes.json(),
      rosterRes.json(),
      hittingRes.json(),
      pitchingRes.json()
    ]);

    renderStandings(standingsData, teamId);
    renderTeamOffense(hittingData);
    renderRoster(rosterData);
    renderTeamPitching(pitchingData);

  } catch (err) {
    console.error("Team stats error:", err);
    ["standings-body","team-offense-body","roster-body","team-pitching-body"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">Error loading team data</td></tr>`;
    });
  }
}

function renderStandings(data, currentTeamId) {
  const tbody = document.getElementById("standings-body");
  if (!tbody) return;
  const division = data.records?.find(div =>
    div.teamRecords?.some(t => t.team?.id == currentTeamId)
  );
  if (!division?.teamRecords?.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">No standings data</td></tr>`;
    return;
  }
  tbody.innerHTML = division.teamRecords.map(record => {
    const isCurrent = record.team?.id == currentTeamId;
    const gb = record.gamesBack;
    return `<tr${isCurrent ? ' style="background:rgba(232,114,42,.08);color:#fff"' : ''}>
      <td style="${isCurrent ? 'color:var(--orange);font-weight:700' : ''}">${record.team?.name || "—"}</td>
      <td>${record.wins ?? "—"}</td>
      <td>${record.losses ?? "—"}</td>
      <td>${record.winningPercentage ? Number(record.winningPercentage).toFixed(3) : "—"}</td>
      <td>${!gb || gb === "0" || gb === 0 ? "—" : gb}</td>
    </tr>`;
  }).join("");
}

function renderTeamOffense(hittingData) {
  const tbody = document.getElementById("team-offense-body");
  if (!tbody) return;
  // /teams/{id}/stats returns { stats: [{ splits: [{ stat: {...} }] }] }
  const s = hittingData?.stats?.[0]?.splits?.[0]?.stat || {};
  const rows = [
    ["AVG",  s.avg        ? Number(s.avg).toFixed(3)  : "—"],
    ["OBP",  s.obp        ? Number(s.obp).toFixed(3)  : "—"],
    ["SLG",  s.slg        ? Number(s.slg).toFixed(3)  : "—"],
    ["OPS",  s.ops        ? Number(s.ops).toFixed(3)  : "—"],
    ["HR",   s.homeRuns   ?? "—"],
    ["RBI",  s.rbi        ?? "—"],
    ["R",    s.runs       ?? "—"],
    ["SB",   s.stolenBases ?? "—"],
  ];
  tbody.innerHTML = rows.map(([label, value]) =>
    `<tr><td>${label}</td><td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${value}</td></tr>`
  ).join("");
}

function renderRoster(rosterData) {
  const tbody = document.getElementById("roster-body");
  if (!tbody) return;
  const roster = rosterData.roster || [];
  if (!roster.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-dim)">No roster data</td></tr>`;
    return;
  }
  tbody.innerHTML = roster.map(p => {
    const num    = p.jerseyNumber ?? "—";
    const name   = p.person?.fullName || "—";
    const pos    = p.position?.abbreviation || "—";
    const status = p.status?.description || "Active";
    return `<tr class="roster-row" style="cursor:pointer" onclick="selectPlayerByName('${name.replace(/'/g, "\\'")}')">
      <td style="color:var(--orange);font-family:'Bebas Neue',sans-serif">${num}</td>
      <td style="font-weight:700">${name}</td>
      <td><span style="background:rgba(90,180,245,.12);color:var(--blue-bright);padding:2px 7px;border-radius:5px;font-size:10px;font-weight:700;font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px">${pos}</span></td>
      <td style="color:var(--text-dim);font-size:10px">${status}</td>
    </tr>`;
  }).join("");
}

function renderTeamPitching(pitchingData) {
  const tbody = document.getElementById("team-pitching-body");
  if (!tbody) return;
  const s = pitchingData?.stats?.[0]?.splits?.[0]?.stat || {};
  const rows = [
    ["ERA",  s.era                ? Number(s.era).toFixed(2)                : "—"],
    ["WHIP", s.whip               ? Number(s.whip).toFixed(3)               : "—"],
    ["K/9",  s.strikeoutsPer9Inn  ? Number(s.strikeoutsPer9Inn).toFixed(2)  : "—"],
    ["BB/9", s.walksPer9Inn       ? Number(s.walksPer9Inn).toFixed(2)       : "—"],
    ["W",    s.wins    ?? "—"],
    ["SV",   s.saves   ?? "—"],
    ["K",    s.strikeOuts ?? "—"],
  ];
  tbody.innerHTML = rows.map(([label, value]) =>
    `<tr><td>${label}</td><td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${value}</td></tr>`
  ).join("");
}

function selectPlayerByName(fullName) {
  const input = document.querySelector("#psearch, .cmd-bar input");
  if (input) input.value = fullName;
  loadPlayer();
}