/* ============================================================
   MLB ANALYTICS DASHBOARD — JARVIS v5
   CORE PLAYER LOGIC (JARVIS API INTEGRATED)
   ============================================================ */

const JARVIS_API_BASE = "https://api.jarvis-mlb.internal/v1";
const SEASON = 2026;

/* ── CACHING HELPERS ────────────────────────────────────────── */
function getCachedData(key) {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  const { data, timestamp, ttl } = JSON.parse(stored);
  if (Date.now() - timestamp > ttl) {
    localStorage.removeItem(key);
    return null;
  }
  return data;
}

function setCachedData(key, data, ttlMinutes) {
  localStorage.setItem(key, JSON.stringify({
    data,
    timestamp: Date.now(),
    ttl: ttlMinutes * 60 * 1000
  }));
}

/* ── UTILS ─────────────────────────────────────────────────── */
function fmt(val, decimals = 3) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  let s = Number(val).toFixed(decimals);
  return s.startsWith("0.") ? s.substring(1) : s;
}

/* ── MAIN PLAYER LOADING ────────────────────────────────────── */
async function loadPlayer() {
  const query = document.getElementById("psearch")?.value?.trim();
  if (!query) return;

  setHeroLoading();

  try {
    // 1. Search for player to get ID
    const searchRes = await fetch(`${JARVIS_API_BASE}/players/search?q=${encodeURIComponent(query)}`);
    const searchData = await searchRes.json();
    const playerRef = searchData.results?.[0];
    if (!playerRef) { setHeroError("PLAYER NOT FOUND", ""); return; }
    
    const mlbId = playerRef.mlbId || playerRef.id;

    // 2. Load full player data (Profile, Stats, Grades, Arsenal)
    await loadPlayerData(mlbId);

  } catch (err) {
    console.error("Load player error:", err);
    setHeroError("ERROR", "CHECK API CONNECTION");
  }
}

async function loadPlayerData(mlbId) {
  // Check Cache First
  const cacheKey = `jarvis:player:${mlbId}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    renderAll(cached.player, cached.stats, cached.grades, cached.arsenal, cached.contract);
    // Refresh in background
  }

  try {
    const [pRes, sRes, gRes, aRes, cRes] = await Promise.all([
      fetch(`${JARVIS_API_BASE}/players/${mlbId}`),
      fetch(`${JARVIS_API_BASE}/players/${mlbId}/stats/batting?season=${SEASON}`),
      fetch(`${JARVIS_API_BASE}/players/${mlbId}/scouting-grades?season=${SEASON}`),
      fetch(`${JARVIS_API_BASE}/players/${mlbId}/pitch-arsenal?season=${SEASON}`),
      fetch(`${JARVIS_API_BASE}/players/${mlbId}/contract`)
    ]);

    const player = await pRes.json();
    const stats = await sRes.json();
    const grades = await gRes.json();
    const arsenal = await aRes.json();
    const contract = await cRes.json();

    // Cache the result
    setCachedData(cacheKey, { player, stats, grades, arsenal, contract }, 30);

    renderAll(player, stats, grades, arsenal, contract);

  } catch (err) {
    console.warn("Background fetch failed:", err);
    if (!cached) setHeroError("API ERROR", "404 NOT FOUND");
  }
}

/* ── RENDERING ──────────────────────────────────────────────── */
function renderAll(player, stats, grades, arsenal, contract) {
  renderHero(player);
  renderQuickStats(stats);
  renderSeasonStats(stats);
  renderAdvanced(stats, grades);
  renderScoutingGrades(grades);
  renderContractProjection(contract, stats);
  renderFlags(stats, grades);
}

function renderHero(player) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("hero-name", player.name?.toUpperCase() || "UNKNOWN");
  set("hero-team", player.team?.toUpperCase() || "—");
  set("hero-pos",  player.position || "—");
  set("hero-age",  `AGE ${player.currentAge || "—"}`);
  set("hero-bats", `B/T: ${player.bats || "—"}/${player.throws || "—"}`);
  
  const photo = document.getElementById("hero-photo");
  if (photo) photo.src = player.photoUrl || `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`;
}

function renderQuickStats(stats) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("stat-avg", fmt(stats.avg));
  set("stat-hr",  stats.homeRuns || "0");
  set("stat-rbi", stats.rbis || "0");
  set("stat-ops", fmt(stats.ops));
}

function renderSeasonStats(stats) {
  const tbody = document.getElementById("season-stats-body");
  if (!tbody) return;
  const rows = [
    ["Games",        stats.games || "—"],
    ["Plate App.",   stats.plateAppearances || "—"],
    ["Hits",         stats.hits || "—"],
    ["Home Runs",    stats.homeRuns || "—"],
    ["RBI",          stats.rbis || "—"],
    ["AVG",          fmt(stats.avg)],
    ["OBP",          fmt(stats.obp)],
    ["SLG",          fmt(stats.slg)],
    ["OPS",          fmt(stats.ops)]
  ];
  tbody.innerHTML = rows.map(([label, value]) =>
    `<tr><td>${label}</td><td style="font-family:'Bebas Neue',sans-serif;font-size:18px">${value}</td><td style="color:var(--text-dim)">—</td></tr>`
  ).join("");
}

function renderAdvanced(stats, grades) {
  const container = document.getElementById("advanced-stats-container");
  if (!container) return;
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="stat-label">xwOBA</div><div class="stat-val">${fmt(stats.xwoba)}</div><div class="stat-rank">Elite</div></div>
      <div class="stat-cell"><div class="stat-label">Exit Velo</div><div class="stat-val">${stats.statcast?.exitVelo || "—"}</div><div class="stat-rank">${stats.statcast?.exitVeloPercentile || "—"}%</div></div>
      <div class="stat-cell"><div class="stat-label">Barrel%</div><div class="stat-val">${stats.statcast?.barrelRate || "—"}%</div><div class="stat-rank">${stats.statcast?.barrelPercentile || "—"}%</div></div>
      <div class="stat-cell"><div class="stat-label">Hard Hit%</div><div class="stat-val">${stats.statcast?.hardHitRate || "—"}%</div><div class="stat-rank">${stats.statcast?.hardHitPercentile || "—"}%</div></div>
    </div>`;
  
  // Update Season Projections too
  const projContainer = document.getElementById("season-projections-container");
  if (projContainer) {
    projContainer.innerHTML = `
      <div class="stat-grid">
        <div class="stat-cell"><div class="stat-label">PROJ WAR</div><div class="stat-val">${stats.warProj || "—"}</div><div class="stat-rank">Season</div></div>
        <div class="stat-cell"><div class="stat-label">FANTASY PTS</div><div class="stat-val">${calculateFantasyPoints(stats)}</div><div class="stat-rank">Live</div></div>
      </div>`;
  }
}

function calculateFantasyPoints(stats) {
  const hits = stats.hits || 0;
  const dbls = stats.doubles || 0;
  const trpl = stats.triples || 0;
  const hr   = stats.homeRuns || 0;
  const tb   = (hits - dbls - trpl - hr) + (dbls * 2) + (trpl * 3) + (hr * 4);
  const fpts = (tb) + (stats.runs || 0) + (stats.rbis || 0) + (stats.walks || 0) + (stats.stolenBases || 0) - ((stats.strikeouts || 0) * 0.5);
  return fpts.toFixed(0);
}

function renderScoutingGrades(grades) {
  const container = document.getElementById("scouting-grades-container");
  if (!container || !grades.hitting) return;
  const h = grades.hitting;
  const color = g => g >= 70 ? "var(--green)" : g >= 50 ? "#fff" : "var(--red)";
  container.innerHTML = `
    <div class="stat-cell"><div class="stat-label">Hit</div><div class="stat-val" style="color:${color(h.hitTool?.grade)}">${h.hitTool?.grade || "—"}</div></div>
    <div class="stat-cell"><div class="stat-label">Power</div><div class="stat-val" style="color:${color(h.powerTool?.grade)}">${h.powerTool?.grade || "—"}</div></div>
    <div class="stat-cell"><div class="stat-label">Speed</div><div class="stat-val" style="color:${color(h.speedTool?.grade)}">${h.speedTool?.grade || "—"}</div></div>
    <div class="stat-cell"><div class="stat-label">Defense</div><div class="stat-val" style="color:${color(h.fieldingTool?.grade)}">${h.fieldingTool?.grade || "—"}</div></div>`;
}

function renderContractProjection(contract, stats) {
  const container = document.getElementById("contract-projection-container");
  if (!container || !contract.terms) return;
  container.innerHTML = `
    <div class="stat-cell"><div class="stat-label">AAV Actual</div><div class="stat-val">$${(contract.terms.aavActual/1e6).toFixed(1)}M</div></div>
    <div class="stat-cell"><div class="stat-label">Years</div><div class="stat-val">${contract.terms.years}</div></div>
    <div class="stat-cell"><div class="stat-label">Surplus</div><div class="stat-val" style="color:var(--green)">+$${(contract.analysis?.surplusValue/1e6).toFixed(1)}M</div></div>`;
}

function renderFlags(stats, grades) {
  const container = document.getElementById("flags-container");
  if (!container) return;
  const flags = [];
  if (stats.xwoba > 0.400) flags.push({ icon: "🔥", title: "Elite xwOBA", desc: "Top 1% of league." });
  if (stats.statcast?.barrelPercentile > 95) flags.push({ icon: "💥", title: "Barrel Master", desc: "Elite contact quality." });
  if (grades.jarvisEvaluation?.grade === "A+") flags.push({ icon: "💎", title: "Priority Asset", desc: "High-value acquisition target." });
  
  container.innerHTML = flags.map(f => `
    <div class="flag-card">
      <div class="flag-icon">${f.icon}</div>
      <div><div class="flag-title">${f.title}</div><div class="flag-desc">${f.desc}</div></div>
    </div>`).join("");
}

/* ── HELPERS ────────────────────────────────────────────────── */
function setHeroLoading() {
  const n = document.getElementById("hero-name");
  if (n) n.textContent = "JARVIS IS THINKING...";
}
function setHeroError(msg, sub) {
  const n = document.getElementById("hero-name");
  const t = document.getElementById("hero-team");
  if (n) n.textContent = msg;
  if (t) t.textContent = sub;
}

function selectPlayerByName(fullName) {
  const input = document.getElementById("psearch");
  if (input) input.value = fullName;
  if (typeof switchTab === "function") switchTab("profile");
  loadPlayer();
}
