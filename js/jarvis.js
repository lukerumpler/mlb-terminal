/* JARVIS v5 — Ticker, Logo, Favicon */


async function loadScoreTicker() {
  try {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const res  = await fetch(`/api/mlb?path=/schedule&sportId=1&date=${today}&hydrate=team,linescore`);
    const data = await res.json();
    const games = data.dates?.[0]?.games || [];
    const track = document.getElementById("score-track");
    if (!track) return;
    if (!games.length) { track.innerHTML = `<span class="score-item">NO GAMES TODAY</span>`; return; }
    const items = games.map(g => {
      const away  = g.teams?.away?.team?.abbreviation || "—";
      const home  = g.teams?.home?.team?.abbreviation || "—";
      const awayR = g.teams?.away?.score ?? "";
      const homeR = g.teams?.home?.score ?? "";
      const score = (awayR !== "" && homeR !== "") ? `<strong>${awayR}–${homeR}</strong>` : "vs";
      const state = g.status?.detailedState === "Final"
        ? `<span style="color:var(--text-dim)">F</span>`
        : g.linescore?.currentInningOrdinal
          ? `<span style="color:var(--green)">${g.linescore.currentInningOrdinal}</span>` : "";
      return `<span class="score-item">${away} ${score} ${home} ${state}</span>`;
    }).join('<span class="score-item" style="opacity:.3">·</span>');
    track.innerHTML = items + items;
  } catch(e) { console.warn("Ticker:", e); }
}

function renderTeamLogo(teamId) {
  const wrap = document.getElementById("team-logo-wrap");
  if (!wrap || !teamId) return;
  wrap.innerHTML = `<img src="https://www.mlbstatic.com/team-logos/${teamId}.svg"
    style="width:72px;height:72px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(232,114,42,.4))"
    onerror="this.style.display='none'">`;
}

function refreshData() {
  const sel = document.getElementById("team-select");
  if (sel?.value && typeof loadTeam === "function") loadTeam(sel.value);
  loadScoreTicker();
}

/* Favicon — kills the 404 */
(function() {
  const l = document.createElement("link");
  l.rel = "icon";
  l.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚾</text></svg>";
  document.head.appendChild(l);
})();

document.addEventListener("DOMContentLoaded", () => {
  loadScoreTicker();
  setInterval(loadScoreTicker, 60000);
  console.log("✅ JARVIS ticker initialized");
});
