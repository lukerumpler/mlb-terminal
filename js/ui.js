/* ============================================================
   MLB ANALYTICS DASHBOARD — JARVIS v5
   UI LOGIC: tabs, player search, developer mode
   ============================================================ */

/* ── DEVELOPER MODE ────────────────────────────────────────── */
let DEVELOPER_MODE = true; // Enabled by default

function toggleDevMode() {
  DEVELOPER_MODE = !DEVELOPER_MODE;
  console.log(`🛠️ Developer Mode: ${DEVELOPER_MODE ? "ON" : "OFF"}`);
  document.body.classList.toggle("dev-mode", DEVELOPER_MODE);
}

/* ── TAB SWITCHING ──────────────────────────────────────────── */
function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
  document.querySelectorAll(".pg").forEach(p => p.classList.remove("on"));
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) tab.classList.add("on");
  const pg = document.getElementById(`pg-${tabName}`);
  if (pg) pg.classList.add("on");
}

/* ── PLAYER SEARCH ──────────────────────────────────────────── */
let _searchTimer   = null;
let _dropdownIndex = -1;

function handlePlayerSearch(val) {
  clearTimeout(_searchTimer);
  const box = document.getElementById("psearch-results");
  if (!box) return;
  if (!val || val.length < 2) { box.style.display = "none"; return; }
  box.innerHTML = `<div style="padding:10px;color:var(--text-dim)">Searching…</div>`;
  box.style.display = "block";
  _searchTimer = setTimeout(() => _doSearch(val), 280);
}

async function _doSearch(query) {
  const box = document.getElementById("psearch-results");
  if (!box) return;
  try {
    const res    = await fetch(`/api/mlb?path=/people/search&names=${encodeURIComponent(query)}&limit=10`);
    const data   = await res.json();
    const people = data.people || [];
    if (!people.length) {
      box.innerHTML = `<div style="padding:10px;color:var(--text-dim)">No results</div>`;
      return;
    }
    box.innerHTML = people.map((p, i) => `
      <div class="sr-item" onclick="_pickPlayer('${p.fullName.replace(/'/g,"\\'")}')">
        <img src="https://img.mlbstatic.com/mlb-photos/image/upload/w_60/v1/people/${p.id}/headshot/67/current" style="width:30px;height:30px;border-radius:4px">
        <div style="flex:1"><strong>${p.fullName}</strong><br><small>${p.currentTeam?.name || ""}</small></div>
      </div>`).join("");
  } catch (err) { box.style.display = "none"; }
}

function _pickPlayer(name) {
  const input = document.getElementById("psearch");
  if (input) input.value = name;
  document.getElementById("psearch-results").style.display = "none";
  switchTab("profile");
  if (typeof loadPlayer === "function") loadPlayer();
}

/* ── KEYBOARD SHORTCUTS ─────────────────────────────────────── */
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const inInput = ["INPUT","TEXTAREA"].includes(document.activeElement.tagName);
    if (e.key === "/" && !inInput) { e.preventDefault(); document.getElementById("psearch")?.focus(); }
    if (e.key === "d" && e.ctrlKey) { e.preventDefault(); toggleDevMode(); }
    if (!inInput && e.key >= "1" && e.key <= "7") {
      const tabs = ["dash", "personnel", "analysis", "profile", "prospects", "notes", "about"];
      switchTab(tabs[parseInt(e.key) - 1]);
    }
  });
}

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initKeyboardShortcuts();
  if (DEVELOPER_MODE) document.body.classList.add("dev-mode");
  console.log("✅ UI v5 initialized — Ctrl+D for Dev Mode");
});
