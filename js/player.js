/* ============================================================
   MLB INTELLIGENCE TERMINAL - PLAYER LOGIC
   FULL FIXED VERSION
   ============================================================ */

/* ============================================================
   SEARCH MLB API FOR PLAYER ID
   ============================================================ */
async function searchPlayer(name) {
  try {
    const res = await fetch(
      `/api/mlb?path=/people/search&names=${encodeURIComponent(name)}`
    );

    const data = await res.json();

    return data.people || [];
  } catch (err) {
    console.error("Player search failed:", err);
    return [];
  }
}

/* ============================================================
   FETCH FULL PLAYER DATA
   ============================================================ */
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

/* ============================================================
   FETCH STATCAST DATA
   ============================================================ */
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

    return {
      expected: [],
      statcast: []
    };
  }
}

/* ============================================================
   FIND PLAYER IN STATCAST DATA
   FIXED VERSION
   ============================================================ */
function findStatcastPlayer(data, mlbId) {
  // Convert MLB ID to string once
  const id = String(mlbId);

  // Safe lookup for expected stats
  const expected = Array.isArray(data.expected)
    ? data.expected.find(
        p => String(p.player_id) === id
      ) || null
    : null;

  // Safe lookup for statcast leaderboard stats
  const statcast = Array.isArray(data.statcast)
    ? data.statcast.find(
        p => String(p.player_id) === id
      ) || null
    : null;

  return {
    expected,
    statcast
  };
}

/* ============================================================
   MAIN PLAYER LOADER
   ============================================================ */
async function loadPlayer() {
  const select = document.getElementById("player-select");
  const searchInput = document.querySelector(".cmd-bar input");

  // Prefer search bar input first
  const query =
    searchInput?.value?.trim() ||
    select?.value?.trim();

  if (!query) {
    alert("Please select or search for a player first.");
    return;
  }

  document.getElementById("hero-name").textContent =
    "LOADING...";

  document.getElementById("hero-team").textContent =
    "FETCHING DATA";

  try {
    let mlbId;
    let player;

    // If query is already numeric, treat as MLB ID
    const isNumericId = /^\d+$/.test(query);

    if (isNumericId) {
      mlbId = query;

      player = {
        id: mlbId,
        fullName: searchInput?.value || ""
      };
    } else {
      // Search by player name
      const results = await searchPlayer(query);

      if (!results.length) {
        document.getElementById("hero-name").textContent =
          "PLAYER NOT FOUND";

        document.getElementById("hero-team").textContent =
          "TRY ANOTHER NAME";

        return;
      }

      player = results[0];
      mlbId = player.id;
    }

    // Fetch MLB + Statcast data together
    const [playerData, savantData] = await Promise.all([
      fetchPlayerData(mlbId),
      fetchStatcastData()
    ]);

    if (!playerData) {
      document.getElementById("hero-name").textContent =
        "DATA UNAVAILABLE";

      return;
    }

    // Match Statcast player
    const { expected, statcast } =
      findStatcastPlayer(savantData, mlbId);

    /* ========================================================
       DEBUG LOGS
       ======================================================== */
    console.log("Player:", playerData?.fullName);

    console.log(
      "Stats:",
      playerData?.stats?.[0]?.splits?.[0]?.stat
    );

    console.log(
      "Statcast Match:",
      statcast ? "FOUND" : "NOT FOUND"
    );

    console.log(
      "Expected Match:",
      expected ? "FOUND" : "NOT FOUND"
    );

    /* ========================================================
       RENDER EVERYTHING
       ======================================================== */
    renderHero(playerData, statcast);

    renderQuickStats(playerData, statcast);

    renderSeasonStats(playerData);

    renderFlags(playerData, expected, statcast);

    renderBattingTable(playerData);

    renderAdvanced(expected, statcast);

    renderTeam(playerData);

  } catch (err) {
    console.error("Load player error:", err);

    document.getElementById("hero-name").textContent =
      "ERROR LOADING";
  }
}

/* ============================================================
   HERO SECTION
   ============================================================ */
function renderHero(player, statcast) {
  if (!player) return;

  document.getElementById("hero-name").textContent =
    player.fullName?.toUpperCase() || "UNKNOWN";

  document.getElementById("hero-team").textContent =
    player.currentTeam?.name?.toUpperCase() || "—";

  document.getElementById("hero-pos").textContent =
    player.primaryPosition?.abbreviation || "—";

  document.getElementById("hero-age").textContent =
    player.currentAge
      ? `AGE ${player.currentAge}`
      : "—";

  document.getElementById("hero-bats").textContent =
    player.batSide?.code &&
    player.pitchHand?.code
      ? `B/T: ${player.batSide.code}/${player.pitchHand.code}`
      : "—";

  const photo =
    document.getElementById("hero-photo");

  if (photo) {
    photo.src =
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`;

    photo.alt = player.fullName;
  }
}

/* ============================================================
   QUICK STATS
   ============================================================ */
function renderQuickStats(player, statcast) {
  const stats =
    player?.stats?.[0]?.splits?.[0]?.stat || {};

  document.getElementById("stat-avg").textContent =
    stats.avg
      ? Number(stats.avg).toFixed(3)
      : ".000";

  document.getElementById("stat-hr").textContent =
    stats.homeRuns ?? "0";

  document.getElementById("stat-rbi").textContent =
    stats.rbi ?? "0";

  document.getElementById("stat-ops").textContent =
    stats.ops
      ? Number(stats.ops).toFixed(3)
      : ".000";
}

/* ============================================================
   SEASON STATS TABLE
   ============================================================ */
function renderSeasonStats(player) {
  const stats =
    player?.stats?.[0]?.splits?.[0]?.stat || {};

  const tbody =
    document.getElementById("season-stats-body");

  if (!tbody) return;

  const rows = [
    ["Games", stats.gamesPlayed ?? "—"],
    ["At Bats", stats.atBats ?? "—"],
    ["Hits", stats.hits ?? "—"],
    ["Doubles", stats.doubles ?? "—"],
    ["Home Runs", stats.homeRuns ?? "—"],
    ["RBI", stats.rbi ?? "—"],
    [
      "AVG",
      stats.avg
        ? Number(stats.avg).toFixed(3)
        : "—"
    ],
    [
      "OBP",
      stats.obp
        ? Number(stats.obp).toFixed(3)
        : "—"
    ],
    [
      "SLG",
      stats.slg
        ? Number(stats.slg).toFixed(3)
        : "—"
    ],
    [
      "OPS",
      stats.ops
        ? Number(stats.ops).toFixed(3)
        : "—"
    ],
    ["Stolen Bases", stats.stolenBases ?? "—"],
    ["Strikeouts", stats.strikeOuts ?? "—"],
    ["Walks", stats.baseOnBalls ?? "—"]
  ];

  tbody.innerHTML = rows.map(([label, value]) => `
    <tr>
      <td>${label}</td>
      <td>${value}</td>
      <td>—</td>
    </tr>
  `).join("");
}

/* ============================================================
   FLAGS / INSIGHTS
   ============================================================ */
function renderFlags(player, expected, statcast) {
  const container =
    document.getElementById("flags-container");

  if (!container) return;

  const stats =
    player?.stats?.[0]?.splits?.[0]?.stat || {};

  const flags = [];

  if (
    expected?.est_woba &&
    expected.est_woba > 0.400
  ) {
    flags.push({
      icon: "🔥",
      title: "Elite xwOBA",
      desc:
        `${Number(expected.est_woba).toFixed(3)} ` +
        `xwOBA ranks in the top tier league-wide.`
    });
  }

  if (
    statcast?.avg_hit_speed &&
    statcast.avg_hit_speed > 92
  ) {
    flags.push({
      icon: "💥",
      title: "Hard Contact Machine",
      desc:
        `${statcast.avg_hit_speed} mph average exit velocity.`
    });
  }

  if (
    statcast?.brl_percent &&
    statcast.brl_percent > 10
  ) {
    flags.push({
      icon: "🎯",
      title: "Elite Barrel Rate",
      desc:
        `${statcast.brl_percent}% barrel rate is elite.`
    });
  }

  if ((stats.homeRuns ?? 0) >= 20) {
    flags.push({
      icon: "💣",
      title: "Power Threat",
      desc:
        `${stats.homeRuns} home runs this season.`
    });
  }

  if ((stats.stolenBases ?? 0) >= 15) {
    flags.push({
      icon: "🏃",
      title: "Speed Weapon",
      desc:
        `${stats.stolenBases} stolen bases this season.`
    });
  }

  if (
    expected?.est_ba_minus_ba_diff &&
    expected.est_ba_minus_ba_diff > 0.020
  ) {
    flags.push({
      icon: "📈",
      title: "Due For Regression Up",
      desc:
        `xBA is ` +
        `${Number(expected.est_ba_minus_ba_diff).toFixed(3)} ` +
        `above actual BA — expect improvement.`
    });
  }

  if (!flags.length) {
    flags.push({
      icon: "📋",
      title: "Player Loaded",
      desc:
        `${player?.fullName} data loaded successfully.`
    });
  }

  container.innerHTML = flags.map(f => `
    <div class="flag-card">
      <div class="flag-icon">${f.icon}</div>

      <div>
        <div class="flag-title">${f.title}</div>

        <div class="flag-desc">
          ${f.desc}
        </div>
      </div>
    </div>
  `).join("");
}

/* ============================================================
   BATTING TABLE
   ============================================================ */
function renderBattingTable(player) {
  const tbody =
    document.getElementById("batting-stats-body");

  if (!tbody) return;

  const splits =
    player?.stats?.[0]?.splits || [];

  if (!splits.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11"
          style="
            text-align:center;
            color:var(--text-dim);
          ">
          No batting data available
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = splits.map(split => {
    const s = split.stat;

    return `
      <tr>
        <td>${split.season || "—"}</td>
        <td>${s.gamesPlayed ?? "—"}</td>
        <td>${s.atBats ?? "—"}</td>
        <td>${s.hits ?? "—"}</td>
        <td>${s.doubles ?? "—"}</td>
        <td>${s.homeRuns ?? "—"}</td>
        <td>${s.rbi ?? "—"}</td>
        <td>${s.avg ? Number(s.avg).toFixed(3) : "—"}</td>
        <td>${s.obp ? Number(s.obp).toFixed(3) : "—"}</td>
        <td>${s.slg ? Number(s.slg).toFixed(3) : "—"}</td>
        <td>${s.ops ? Number(s.ops).toFixed(3) : "—"}</td>
      </tr>
    `;
  }).join("");
}

/* ============================================================
   ADVANCED METRICS
   ============================================================ */
function renderAdvanced(expected, statcast) {
  const container =
    document.getElementById("advanced-stats-container");

  if (!container) return;

  if (!expected && !statcast) {
    container.innerHTML = `
      <p style="color:var(--text-dim); text-align:center; padding:20px;">
        No Statcast data available.
      </p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="grid-4">

      <div class="stat-cell">
        <div class="stat-label">xBA</div>
        <div class="stat-value">
          ${expected?.est_ba ? Number(expected.est_ba).toFixed(3) : "—"}
        </div>
        <div class="stat-sub">Expected BA</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">xSLG</div>
        <div class="stat-value">
          ${expected?.est_slg ? Number(expected.est_slg).toFixed(3) : "—"}
        </div>
        <div class="stat-sub">Expected SLG</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">xwOBA</div>
        <div class="stat-value">
          ${expected?.est_woba ? Number(expected.est_woba).toFixed(3) : "—"}
        </div>
        <div class="stat-sub">Expected wOBA</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">Exit Velo</div>
        <div class="stat-value">
          ${statcast?.avg_hit_speed ? Number(statcast.avg_hit_speed).toFixed(1) : "—"}
        </div>
        <div class="stat-sub">Avg Exit Velocity</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">Barrel%</div>
        <div class="stat-value">
          ${statcast?.brl_percent != null ? statcast.brl_percent + "%" : "—"}
        </div>
        <div class="stat-sub">Barrel Rate</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">Hard Hit%</div>
        <div class="stat-value">
          ${statcast?.hard_hit_percent != null ? statcast.hard_hit_percent + "%" : "—"}
        </div>
        <div class="stat-sub">Hard Hit Rate</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">K%</div>
        <div class="stat-value">
          ${statcast?.k_percent != null ? statcast.k_percent + "%" : "—"}
        </div>
        <div class="stat-sub">Strikeout Rate</div>
      </div>

      <div class="stat-cell">
        <div class="stat-label">BB%</div>
        <div class="stat-value">
          ${statcast?.bb_percent != null ? statcast.bb_percent + "%" : "—"}
        </div>
        <div class="stat-sub">Walk Rate</div>
      </div>

    </div>
  `;
}

/* ============================================================
   TEAM STATS PAGE
   ============================================================ */
async function renderTeam(player) {
  if (!player) return;

  const teamId = player.currentTeam?.id;
  if (!teamId) return;

  try {
    // Fetch standings + roster + team stats in parallel
    const [standingsRes, rosterRes, teamStatsRes] = await Promise.all([
      fetch(`/api/mlb?path=/standings&leagueId=103,104&season=2026`),
      fetch(`/api/mlb?path=/teams/${teamId}/roster?rosterType=active&season=2026`),
      fetch(`/api/mlb?path=/teams/${teamId}&hydrate=stats(type=season,group=hitting,season=2026),stats(type=season,group=pitching,season=2026)`)
    ]);

    const [standingsData, rosterData, teamStatsData] = await Promise.all([
      standingsRes.json(),
      rosterRes.json(),
      teamStatsRes.json()
    ]);

    renderStandings(standingsData, teamId);
    renderTeamOffense(teamStatsData);
    renderRoster(rosterData);
    renderTeamPitching(teamStatsData);

  } catch (err) {
    console.error("Team stats error:", err);
    const bodies = ["standings-body", "team-offense-body", "roster-body", "team-pitching-body"];
    bodies.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);">Error loading team data</td></tr>`;
    });
  }
}

function renderStandings(data, currentTeamId) {
  const tbody = document.getElementById("standings-body");
  if (!tbody) return;

  // Find the division that contains the current team
  const division = data.records?.find(div =>
    div.teamRecords?.some(t => t.team?.id == currentTeamId)
  );

  if (!division?.teamRecords?.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);">No standings data</td></tr>`;
    return;
  }

  tbody.innerHTML = division.teamRecords.map(record => {
    const isCurrentTeam = record.team?.id == currentTeamId;
    const gb = record.gamesBack;
    return `
      <tr${isCurrentTeam ? ' class="player-team"' : ''}>
        <td>${record.team?.name || "—"}</td>
        <td>${record.wins ?? "—"}</td>
        <td>${record.losses ?? "—"}</td>
        <td>${record.winningPercentage ? Number(record.winningPercentage).toFixed(3) : "—"}</td>
        <td>${!gb || gb === "0" || gb === 0 ? "—" : gb}</td>
      </tr>
    `;
  }).join("");
}

function renderTeamOffense(teamData) {
  const tbody = document.getElementById("team-offense-body");
  if (!tbody) return;

  const team = teamData.teams?.[0];
  const hittingStats = team?.stats?.find(s => s.group?.displayName === "hitting")?.splits?.[0]?.stat
    || team?.stats?.find(s => s.group?.name === "hitting")?.splits?.[0]?.stat
    || {};

  const rows = [
    ["AVG",  hittingStats.avg       ? Number(hittingStats.avg).toFixed(3)  : "—"],
    ["OBP",  hittingStats.obp       ? Number(hittingStats.obp).toFixed(3)  : "—"],
    ["SLG",  hittingStats.slg       ? Number(hittingStats.slg).toFixed(3)  : "—"],
    ["OPS",  hittingStats.ops       ? Number(hittingStats.ops).toFixed(3)  : "—"],
    ["HR",   hittingStats.homeRuns  ?? "—"],
    ["RBI",  hittingStats.rbi       ?? "—"],
    ["R",    hittingStats.runs      ?? "—"],
    ["SB",   hittingStats.stolenBases ?? "—"],
  ];

  tbody.innerHTML = rows.map(([label, value]) => `
    <tr><td>${label}</td><td>${value}</td></tr>
  `).join("");
}

function renderRoster(rosterData) {
  const tbody = document.getElementById("roster-body");
  if (!tbody) return;

  const roster = rosterData.roster || [];

  if (!roster.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">No roster data</td></tr>`;
    return;
  }

  tbody.innerHTML = roster.map(p => {
    const num  = p.jerseyNumber ?? "—";
    const name = p.person?.fullName || "—";
    const pos  = p.person?.primaryPosition?.abbreviation || "—";
    const status = p.status?.description || "Active";
    return `
      <tr class="roster-row" onclick="selectPlayerByName('${name.replace(/'/g, "\\'")}')">
        <td>${num}</td>
        <td>${name}</td>
        <td>${pos}</td>
        <td style="color:var(--text-dim); font-size:10px;">${status}</td>
      </tr>
    `;
  }).join("");
}

function renderTeamPitching(teamData) {
  const tbody = document.getElementById("team-pitching-body");
  if (!tbody) return;

  const team = teamData.teams?.[0];
  const pitchingStats = team?.stats?.find(s => s.group?.displayName === "pitching")?.splits?.[0]?.stat
    || team?.stats?.find(s => s.group?.name === "pitching")?.splits?.[0]?.stat
    || {};

  const rows = [
    ["ERA",   pitchingStats.era                  ? Number(pitchingStats.era).toFixed(2)                  : "—"],
    ["WHIP",  pitchingStats.whip                 ? Number(pitchingStats.whip).toFixed(3)                 : "—"],
    ["K/9",   pitchingStats.strikeoutsPer9Inn    ? Number(pitchingStats.strikeoutsPer9Inn).toFixed(2)    : "—"],
    ["BB/9",  pitchingStats.walksPer9Inn         ? Number(pitchingStats.walksPer9Inn).toFixed(2)         : "—"],
    ["W",     pitchingStats.wins    ?? "—"],
    ["SV",    pitchingStats.saves   ?? "—"],
    ["K",     pitchingStats.strikeOuts ?? "—"],
  ];

  tbody.innerHTML = rows.map(([label, value]) => `
    <tr><td>${label}</td><td>${value}</td></tr>
  `).join("");
}

function selectPlayerByName(fullName) {
  const input  = document.querySelector(".cmd-bar input");
  const select = document.getElementById("player-select");
  if (input)  input.value  = fullName;
  if (select) select.value = "";
  loadPlayer();
}