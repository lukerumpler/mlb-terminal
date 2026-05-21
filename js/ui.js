/* ============================================================
   MLB INTELLIGENCE TERMINAL - UI LOGIC
   Tab switching, search, and interface interactions
   ============================================================ */

// --- TAB SWITCHING ---
function switchTab(tabName) {
  // Hide all tab content
  const allTabs = document.querySelectorAll(".tab-content");
  allTabs.forEach(tab => tab.style.display = "none");

  // Remove active from all buttons
  const allBtns = document.querySelectorAll(".tab-btn");
  allBtns.forEach(btn => btn.classList.remove("active"));

  // Show selected tab
  const selectedTab = document.getElementById(`tab-${tabName}`);
  if (selectedTab) selectedTab.style.display = "block";

  // Set active button
  const selectedBtn = Array.from(allBtns).find(
    btn => btn.textContent.toLowerCase().includes(tabName)
  );
  if (selectedBtn) selectedBtn.classList.add("active");
}

// --- SEARCH INPUT HANDLER ---
function initSearch() {
  const input = document.querySelector(".cmd-bar input");
  if (!input) return;

  // Search on Enter key
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadPlayer();
  });

  // Clear dropdown when typing
  input.addEventListener("input", () => {
    const select = document.getElementById("player-select");
    if (input.value.trim()) select.value = "";
  });
}

// --- DROPDOWN HANDLER ---
function initDropdown() {
  const select = document.getElementById("player-select");
  if (!select) return;

  select.addEventListener("change", () => {
    const input = document.querySelector(".cmd-bar input");
    if (select.value && input) input.value = "";
  });
}

// --- KEYBOARD SHORTCUTS ---
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Press / to focus search
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      document.querySelector(".cmd-bar input")?.focus();
    }

    // Press Escape to blur search
    if (e.key === "Escape") {
      document.querySelector(".cmd-bar input")?.blur();
    }

    // Number keys 1-5 to switch tabs
    const tabMap = {
      "1": "overview",
      "2": "batting",
      "3": "advanced",
      "4": "scouting",
      "5": "gamelog"
    };
    if (tabMap[e.key] && document.activeElement.tagName !== "INPUT") {
      switchTab(tabMap[e.key]);
    }
  });
}

// --- INIT ON PAGE LOAD ---
document.addEventListener("DOMContentLoaded", () => {
  initSearch();
  initDropdown();
  initKeyboardShortcuts();

  // Show overview tab by default
  switchTab("overview");

  console.log("MLB Intelligence Terminal initialized.");
});