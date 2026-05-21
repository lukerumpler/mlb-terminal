/* ============================================================
   MLB INTELLIGENCE TERMINAL - UI LOGIC
   Full player + team autocomplete search
   ============================================================ */

// --- TAB SWITCHING ---
function switchTab(tabName) {
  const allTabs = document.querySelectorAll(".tab-content");
  allTabs.forEach(tab => tab.style.display = "none");

  const allBtns = document.querySelectorAll(".tab-btn");
  allBtns.forEach(btn => btn.classList.remove("active"));

  const selectedTab = document.getElementById(`tab-${tabName}`);
  if (selectedTab) selectedTab.style.display = "block";

  const selectedBtn = Array.from(allBtns).find(
    btn => btn.textContent.toLowerCase().includes(tabName)
  );
  if (selectedBtn) selectedBtn.classList.add("active");
}

/* ============================================================
   AUTOCOMPLETE SEARCH
   ============================================================ */
let searchTimeout = null;
let currentDropdown = null;
let dropdownIndex = -1;
let lastResults = [];

function initSearch() {
  const input = document.querySelector(".cmd-bar input");
  if (!input) return;

  // Build autocomplete dropdown
  const wrap = input.closest(".cmd-search-wrap") || input.parentElement;
  const dropdown = document.createElement("div");
  dropdown.id = "autocomplete-dropdown";
  dropdown.style.cssText = `
    position:absolute; top:100%; left:0; right:0; z-index:9999;
    background:rgba(6,14,42,0.98); border:1px solid rgba(232,114,42,0.4);
    border-top:none; border-radius:0 0 10px 10px;
    max-height:320px; overflow-y:auto; display:none;
    box-shadow:0 12px 40px rgba(0,0,0,0.6);
    backdrop-filter:blur(16px);
  `;
  wrap.style.position = "relative";
  wrap.appendChild(dropdown);
  currentDropdown = dropdown;

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(searchTimeout);
    if (q.length < 2) { hideDropdown(); return; }
    showDropdownLoading();
    searchTimeout = setTimeout(() => doAutocomplete(q), 280);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const active = currentDropdown?.querySelector(".ac-item.active");
      if (active) { active.click(); }
      else { hideDropdown(); loadPlayer(); }
      return;
    }
    if (e.key === "Escape") { hideDropdown(); input.blur(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); moveCursor(-1); return; }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) hideDropdown();
  });
}

function moveCursor(dir) {
  const items = currentDropdown?.querySelectorAll(".ac-item");
  if (!items?.length) return;
  items.forEach(i => i.classList.remove("active"));
  dropdownIndex = Math.max(0, Math.min(items.length - 1, dropdownIndex + dir));
  items[dropdownIndex]?.classList.add("active");
  items[dropdownIndex]?.scrollIntoView({ block: "nearest" });
}

function showDropdownLoading() {
  if (!currentDropdown) return;
  currentDropdown.innerHTML = `
    <div style="padding:14px 16px; color:rgba(160,180,204,0.7);
      font-family:'Barlow Condensed',sans-serif; font-size:12px;
      letter-spacing:1px; text-transform:uppercase;">
      Searching...
    </div>`;
  currentDropdown.style.display = "block";
}

function hideDropdown() {
  if (currentDropdown) currentDropdown.style.display = "none";
  dropdownIndex = -1;
}

async function doAutocomplete(query) {
  try {
    const res = await fetch(`/api/mlb?path=/people/search&names=${encodeURIComponent(query)}&limit=10`);
    if (!res.ok) { hideDropdown(); return; }
    const data = await res.json();
    const people = data.people || [];
    lastResults = people;
    renderDropdown(people, query);
  } catch {
    hideDropdown();
  }
}

function renderDropdown(people, query) {
  if (!currentDropdown) return;
  dropdownIndex = -1;

  if (!people.length) {
    currentDropdown.innerHTML = `
      <div style="padding:14px 16px; color:rgba(160,180,204,0.6);
        font-family:'Barlow Condensed',sans-serif; font-size:12px;
        letter-spacing:1px; text-transform:uppercase;">
        No players found for "${query}"
      </div>`;
    currentDropdown.style.display = "block";
    return;
  }

  currentDropdown.innerHTML = people.map((p, i) => {
    const pos  = p.primaryPosition?.abbreviation || p.primaryPosition?.name || "—";
    const team = p.currentTeam?.name || p.lastTeam?.name || "";
    const active = p.active ? "" : ` <span style="color:var(--red);font-size:9px;letter-spacing:1px">INACTIVE</span>`;
    const photoUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_40,q_auto:best/v1/people/${p.id}/headshot/67/current`;

    return `
      <div class="ac-item" data-id="${p.id}" data-name="${escAttr(p.fullName)}" 
           style="padding:10px 14px; cursor:pointer;
             border-bottom:1px solid rgba(255,255,255,0.05);
             font-family:'Barlow Condensed',sans-serif;
             display:flex; align-items:center; gap:10px;
             transition:background 0.1s;">
        <img src="${photoUrl}" 
             style="width:34px;height:34px;border-radius:8px;object-fit:cover;
               background:rgba(13,28,58,0.8);border:1px solid rgba(255,255,255,0.1);"
             onerror="this.style.display='none'">
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:#fff;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escHtml(p.fullName)}${active}
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:1px;">
            <span style="background:rgba(232,114,42,0.2);color:var(--orange);
              padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;
              letter-spacing:1px;margin-right:6px;">${escHtml(pos)}</span>
            ${escHtml(team)}
          </div>
        </div>
      </div>`;
  }).join("") + `
    <div style="padding:8px 14px; color:rgba(160,180,204,0.4);
      font-family:'Barlow Condensed',sans-serif; font-size:10px;
      letter-spacing:1px; text-align:right; border-top:1px solid rgba(255,255,255,0.05);">
      ${people.length} result${people.length !== 1 ? "s" : ""} — press Enter to load first
    </div>`;

  currentDropdown.style.display = "block";

  // Wire up click handlers
  currentDropdown.querySelectorAll(".ac-item").forEach(item => {
    item.addEventListener("mouseenter", () => {
      currentDropdown.querySelectorAll(".ac-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      dropdownIndex = Array.from(currentDropdown.querySelectorAll(".ac-item")).indexOf(item);
    });
    item.addEventListener("click", () => {
      const name = item.dataset.name;
      const input = document.querySelector(".cmd-bar input");
      if (input) input.value = name;
      hideDropdown();
      loadPlayer();
    });
  });

  // Hover style injection (once)
  if (!document.getElementById("ac-style")) {
    const s = document.createElement("style");
    s.id = "ac-style";
    s.textContent = `.ac-item:hover, .ac-item.active { background: rgba(232,114,42,0.12) !important; }`;
    document.head.appendChild(s);
  }
}

function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escAttr(s) {
  return String(s || "").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      document.querySelector(".cmd-bar input")?.focus();
    }
    if (e.key === "Escape") {
      document.querySelector(".cmd-bar input")?.blur();
      hideDropdown();
    }
    const tabMap = { "1":"overview","2":"batting","3":"advanced","4":"scouting","5":"gamelog","6":"team" };
    if (tabMap[e.key] && document.activeElement.tagName !== "INPUT") {
      switchTab(tabMap[e.key]);
    }
  });
}

/* ============================================================
   LEGACY DROPDOWN (kept for compatibility — now hidden via CSS)
   ============================================================ */
function initDropdown() {
  const select = document.getElementById("player-select");
  if (!select) return;
  select.addEventListener("change", () => {
    const input = document.querySelector(".cmd-bar input");
    if (select.value && input) input.value = "";
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initSearch();
  initDropdown();
  initKeyboardShortcuts();
  switchTab("overview");
  console.log("MLB Intelligence Terminal initialized.");
});