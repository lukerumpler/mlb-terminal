/* ============================================================
   MLB ANALYTICS DASHBOARD — JARVIS v5
   UI LOGIC: tabs, player search, keyboard shortcuts
   ============================================================ */

/* ── TAB SWITCHING ──────────────────────────────────────────── */
function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
  document.querySelectorAll(".pg").forEach(p => p.classList.remove("on"));
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) tab.classList.add("on");
  const pg = document.getElementById(`pg-${tabName}`);
  if (pg) pg.classList.add("on");
}

/* ── PLAYER SEARCH AUTOCOMPLETE ─────────────────────────────── */
let _searchTimer   = null;
let _dropdownIndex = -1;

function handlePlayerSearch(val) {
  clearTimeout(_searchTimer);
  const box = document.getElementById("psearch-results");
  if (!box) return;

  if (!val || val.length < 2) {
    box.style.display = "none";
    return;
  }

  box.innerHTML = _loadingHTML();
  box.style.display = "block";
  _searchTimer = setTimeout(() => _doSearch(val), 280);
}

function _loadingHTML() {
  return `<div style="padding:10px 14px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase">Searching…</div>`;
}

async function _doSearch(query) {
  const box = document.getElementById("psearch-results");
  if (!box) return;

  try {
    const res    = await fetch(`/api/mlb?path=/people/search&names=${encodeURIComponent(query)}&limit=10`);
    const data   = await res.json();
    const people = data.people || [];

    _dropdownIndex = -1;

    if (!people.length) {
      box.innerHTML = `<div style="padding:10px 14px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:1px">No results for "${_escHtml(query)}"</div>`;
      return;
    }

    box.innerHTML = people.map((p, i) => {
      const pos   = p.primaryPosition?.abbreviation || "—";
      const team  = p.currentTeam?.name || p.lastTeam?.name || "";
      const photo = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/${p.id}/headshot/67/current`;
      const inactive = p.active === false
        ? `<span style="color:var(--red);font-size:9px;letter-spacing:1px;margin-left:6px">INACTIVE</span>`
        : "";

      return `<div class="sr-item" data-idx="${i}" data-name="${_escAttr(p.fullName)}"
           onclick="_pickPlayer(${JSON.stringify(p.fullName)})">
        <img src="${photo}"
             style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 36 36%22><rect fill=%22%230d1c3a%22 width=%2236%22 height=%2236%22 rx=%226%22/></svg>'">
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;font-weight:700">
            ${_escHtml(p.fullName)}${inactive}
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:1px;font-family:'Barlow',sans-serif;font-weight:400">${_escHtml(team)}</div>
        </div>
        <span class="sr-pos">${_escHtml(pos)}</span>
      </div>`;
    }).join("") +
    `<div style="padding:7px 14px;color:rgba(160,180,204,.4);font-family:'Barlow Condensed',sans-serif;font-size:10px;letter-spacing:1px;border-top:1px solid rgba(255,255,255,.05);text-align:right">
      ${people.length} result${people.length !== 1 ? "s" : ""} · ↑↓ navigate · Enter to load
    </div>`;

  } catch (err) {
    console.error("Search error:", err);
    box.style.display = "none";
  }
}

function _pickPlayer(name) {
  const input = document.getElementById("psearch");
  if (input) input.value = name;
  _hideDropdown();
  // Switch to player profile tab
  if (typeof switchTab === "function") switchTab("profile");
  if (typeof loadPlayer === "function") loadPlayer();
}

function _hideDropdown() {
  const box = document.getElementById("psearch-results");
  if (box) box.style.display = "none";
  _dropdownIndex = -1;
}

function _moveCursor(dir) {
  const box   = document.getElementById("psearch-results");
  const items = box?.querySelectorAll(".sr-item");
  if (!items?.length) return;
  items.forEach(i => i.style.background = "");
  _dropdownIndex = Math.max(0, Math.min(items.length - 1, _dropdownIndex + dir));
  const active = items[_dropdownIndex];
  if (active) {
    active.style.background = "rgba(232,114,42,.15)";
    active.scrollIntoView({ block: "nearest" });
  }
}

function _escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function _escAttr(s) {
  return String(s || "").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/* ── KEYBOARD SHORTCUTS ─────────────────────────────────────── */
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const inInput = ["INPUT","TEXTAREA"].includes(document.activeElement.tagName);
    const box     = document.getElementById("psearch-results");
    const isOpen  = box?.style.display !== "none";

    // / — focus search
    if (e.key === "/" && !inInput) {
      e.preventDefault();
      document.getElementById("psearch")?.focus();
      return;
    }

    // Ctrl+K — focus command bar
    if (e.key === "k" && e.ctrlKey) {
      e.preventDefault();
      document.querySelector(".cmd-input")?.focus();
      return;
    }

    // Escape
    if (e.key === "Escape") {
      _hideDropdown();
      document.getElementById("psearch")?.blur();
      return;
    }

    // Arrow nav
    if (isOpen && e.key === "ArrowDown") { e.preventDefault(); _moveCursor(1);  return; }
    if (isOpen && e.key === "ArrowUp")   { e.preventDefault(); _moveCursor(-1); return; }

    // Enter
    if (e.key === "Enter" && inInput) {
      const items  = box?.querySelectorAll(".sr-item");
      const active = items?.[_dropdownIndex];
      if (active) {
        const name  = active.dataset.name;
        const input = document.getElementById("psearch");
        if (input) input.value = name;
        _hideDropdown();
        switchTab("profile");
        if (typeof loadPlayer === "function") loadPlayer();
      } else {
        _hideDropdown();
        if (document.activeElement.id === "psearch") {
          switchTab("profile");
          if (typeof loadPlayer === "function") loadPlayer();
        }
      }
      return;
    }

    // Number keys 1–7 to switch tabs (when not typing)
    if (!inInput) {
      const tabMap = {
        "1": "dash",
        "2": "personnel",
        "3": "analysis",
        "4": "profile",
        "5": "prospects",
        "6": "notes",
        "7": "about"
      };
      if (tabMap[e.key]) switchTab(tabMap[e.key]);
    }
  });
}

/* ── COMMAND TERMINAL ───────────────────────────────────────── */
function handleCommand(event) {
  if (event.key !== "Enter") return;
  const input = event.target.value.toLowerCase().trim();

  const commands = {
    "help":        () => alert("Commands: help, team stats, personnel, leaders, player, prospects, notes, search <name>, clear"),
    "team stats":  () => switchTab("dash"),
    "dash":        () => switchTab("dash"),
    "personnel":   () => switchTab("personnel"),
    "leaders":     () => switchTab("analysis"),
    "analysis":    () => switchTab("analysis"),
    "player":      () => switchTab("profile"),
    "profile":     () => switchTab("profile"),
    "prospects":   () => switchTab("prospects"),
    "notes":       () => switchTab("notes"),
    "about":       () => switchTab("about"),
    "clear":       () => { event.target.value = ""; return; }
  };

  if (commands[input]) {
    commands[input]();
  } else if (input.startsWith("search ")) {
    const name  = event.target.value.trim().replace(/^search /i, "");
    const psearch = document.getElementById("psearch");
    if (psearch) psearch.value = name;
    switchTab("profile");
    if (typeof loadPlayer === "function") loadPlayer();
  }

  event.target.value = "";
}

/* ── CLOSE DROPDOWN ON OUTSIDE CLICK ───────────────────────── */
function initDropdownDismiss() {
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".psearch-wrap");
    if (wrap && !wrap.contains(e.target)) _hideDropdown();
  });
}

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  // Wire .tab clicks (in addition to inline onclick)
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  initKeyboardShortcuts();
  initDropdownDismiss();

  console.log("✅ UI v5 initialized — press / to search, 1-7 to switch tabs");
});
