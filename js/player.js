/* ============================================================
   MLB INTELLIGENCE TERMINAL - PLAYER LOGIC
   Fetches real data from MLB API and Baseball Savant
   via our Vercel serverless proxy functions
   ============================================================ */

// --- SEARCH MLB API FOR PLAYER ID ---
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

// --- FETCH FULL PLAYER DATA FROM MLB API ---
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

// --- FETCH STATCAST DATA FROM SAVANT ---
async function fetchStatcastData(year = 2026) {
  try {
    const res = await fetch(
      `/api/savant?endpoint=expected_statistics&year=${year}`
    );
    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error("Statcast fetch failed:", err);
    return [];
  }
}

// --- FIND PLAYER IN STATCAST DATA ---
function findStatcastPlayer(statcastData, mlbId) {
  return statcastData.find(
    (p) => String(p.player_id) === String(mlbId)
  ) || null;
}

// --- MAIN LOAD PLAYER FUNCTION ---
async function loadPlayer() {
  const select = document.getElementById("player-select");
  const searchInput = document.querySelector(".cmd-bar input");

  // Check if a player is selected from dropdown or typed in search
  const query = select.value || searchInput.value.trim();
  if (!query) {
    alert("Please select or search for a player first.");
    return;
  }

  // Show loading state
  document.getElementById("hero-name").textContent = "LOADING...";
  document.getElementById("hero-team").textContent = "FETCHING DATA";

  try {
    // 1. Search for the player to get their MLB ID
    const results = await searchPlayer(query);
    if (!results.length) {
      document.getElementById("hero-name").textContent = "PLAYER NOT FOUND";
      return;
    }

    const player = results[0];
    const mlbId = player.id;

    // 2. Fetch full player data and statcast data in parallel
    const [playerData, statcastData] = await Promise.all([
      fetchPlayerData(mlbId),
      fetchStatcastData()
    ]);

    // 3. Find this player in statcast data
    const statcast = findStatcastPlayer(statcastData, mlbId);

    // 4. Render everything
    renderHero(playerData, statcast);
    renderQuickStats(playerData, statcast);
    renderSeasonStats(playerData);
    renderFlags(playerData, statcast);
    renderBattingTable(playerData);
    renderAdvanced(statcast);

  } catch (err) {
    console.error("Load player error:", err);
    document.getElementById("hero-name").textContent = "ERROR LOADING";
  }
}

// --- RENDER HERO SECTION ---
function renderHero(player, statcast) {
  if (!player) return;

  document.getElementById("hero-name").textContent =
    player.fullName?.toUpperCase() || "UNKNOWN";
  document.getElementById("hero-team").textContent =
    player.currentTeam?.name?.toUpperCase() || "—";
  document.getElementById("hero-pos").textContent =
    player.primaryPosition?.abbreviation || "—";
  document.getElementById("hero-age").textContent =
    player.currentAge ? `AGE ${player.currentAge}` : "—";
  document.getElementById("hero-bats").textContent =
    player.batSide?.code && player.pitchHand?.code
      ? `B/T: ${player.batSide.code}/${player.pitchHand.code}`
      : "—";

  // Player headshot from MLB
  const photo = document.getElementById("hero-photo");
  if (photo) {
    photo.src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`;
    photo.alt = player.fullName;
  }
}

// --- RENDER QUICK STATS ROW ---
function renderQuickStats(player, statcast) {
  const stats = player?.stats?.[0]?.splits?.[0]?.stat || {};

  document.getElementById("stat-avg").textContent =
    stats.avg ? Number(stats.avg).toFixed(3) : ".000";
  document.getElementById("stat-hr").textContent =
    stats.homeRuns ?? "0";
  document.getElementById("stat-rbi").textContent =
    stats.rbi ?? "0";
  document.getElementById("stat-ops").textContent =
    stats.ops ? Number(stats.ops).toFixed(3) : ".000";
}

// --- RENDER SEASON STATS TABLE ---
function renderSeasonStats(player) {
  const stats = player?.stats?.[0]?.splits?.[0]?.stat || {};
  const tbody = document.getElementById("season-stats-body");
  if (!tbody) return;

  const rows = [
    ["Games",        stats.gamesPlayed ?? "—",   ""],
    ["At Bats",      stats.atBats ?? "—",         ""],
    ["Hits",         stats.hits ?? "—",            ""],
    ["Doubles",      stats.doubles ?? "—",         ""],
    ["Home Runs",    stats.homeRuns ?? "—",        ""],
    ["RBI",          stats.rbi ?? "—",             ""],
    ["AVG",          stats.avg ? Number(stats.avg).toFixed(3) : "—", ""],
    ["OBP",          stats.obp ? Number(stats.obp).toFixed(3) : "—", ""],
    ["SLG",          stats.slg ? Number(stats.slg).toFixed(3) : "—", ""],
    ["OPS",          stats.ops ? Number(stats.ops).toFixed(3) : "—", ""],
    ["Stolen Bases", stats.stolenBases ?? "—",    ""],
    ["Strikeouts",   stats.strikeOuts ?? "—",     ""],
    ["Walks",        stats.baseOnBalls ?? "—",    ""]
  ];

  tbody.innerHTML = rows.map(([label, value]) => `
    <tr>
      <td>${label}</td>
      <td>${value}</td>
      <td>—</td>
    </tr>
  `).join("");
}

// --- RENDER INTELLIGENCE FLAGS ---
function renderFlags(player, statcast) {
  const container = document.getElementById("flags-container");
  if (!container) return;

  const flags = [];
  const stats = player?.stats?.[0]?.splits?.[0]?.stat || {};

  // Generate smart flags based on actual data
  if (statcast?.xwoba && statcast.xwoba > 0.400) {
    flags.push({ icon: "🔥", title: "Elite xwOBA", desc: `${statcast.xwoba} xwOBA ranks in the top tier league-wide.` });
  }
  if (stats.homeRuns >= 30) {
    flags.push({ icon: "💣", title: "Power Threat", desc: `${stats.homeRuns} home runs this season.` });
  }
  if (stats.stolenBases >= 20) {
    flags.push({ icon: "🏃", title: "Speed Weapon", desc: `${stats.stolenBases} stolen bases this season.` });
  }
  if (statcast?.barrel_batted_rate && statcast.barrel_batted_rate > 10) {
    flags.push({ icon: "📊", title: "Elite Barrel Rate", desc: `${statcast.barrel_batted_rate}% barrel rate is elite.` });
  }
  if (!flags.length) {
    flags.push({ icon: "📋", title: "Player Loaded", desc: `${player?.fullName} data loaded successfully.` });
  }

  container.innerHTML = flags.map(f => `
    <div class="flag-card">
      <div class="flag-icon">${f.icon}</div>
      <div>
        <div class="flag-title">${f.title}</div>
        <div class="flag-desc">${f.desc}</div>
      </div>
    </div>
  `).join("");
}

// --- RENDER BATTING TABLE ---
function renderBattingTable(player) {
  const tbody = document.getElementById("batting-stats-body");
  if (!tbody) return;

  const splits = player?.stats?.[0]?.splits || [];
  if (!splits.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-dim);">No batting data available</td></tr>`;
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

// --- RENDER ADVANCED METRICS ---
function renderAdvanced(statcast) {
  const container = document.getElementById("advanced-stats-container");
  if (!container) return;

  if (!statcast) {
    container.innerHTML = `<p style="color:var(--text-dim);">No Statcast data available for this player.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="grid-4">
      <div class="stat-cell">
        <div class="stat-label">xBA</div>
        <div class="stat-value">${statcast.xba ? Number(statcast.xba).toFixed(3) : "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">xSLG</div>
        <div class="stat-value">${statcast.xslg ? Number(statcast.xslg).toFixed(3) : "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">xwOBA</div>
        <div class="stat-value">${statcast.xwoba ? Number(statcast.xwoba).toFixed(3) : "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Barrel %</div>
        <div class="stat-value">${statcast.barrel_batted_rate ?? "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Hard Hit %</div>
        <div class="stat-value">${statcast.hard_hit_percent ?? "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Exit Velo</div>
        <div class="stat-value">${statcast.avg_hit_speed ?? "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Launch Angle</div>
        <div class="stat-value">${statcast.avg_hit_angle ?? "—"}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Sweet Spot %</div>
        <div class="stat-value">${statcast.anglesweetspotpercent ?? "—"}</div>
      </div>
    </div>
  `;
}