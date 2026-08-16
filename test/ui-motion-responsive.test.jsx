import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appSource = fs.readFileSync(
  path.join(projectRoot, "client/src/App.jsx"),
  "utf8"
);
const tickerSource = fs.readFileSync(
  path.join(projectRoot, "client/src/components/LiveScoreTicker.jsx"),
  "utf8"
);
const documentSource = fs.readFileSync(
  path.join(projectRoot, "client/index.html"),
  "utf8"
);
const playersSource = fs.readFileSync(
  path.join(projectRoot, "client/src/pages/PlayersPage.jsx"),
  "utf8"
);
const prospectsSource = fs.readFileSync(
  path.join(projectRoot, "client/src/pages/ProspectsPage.jsx"),
  "utf8"
);
const overviewSource = fs.readFileSync(
  path.join(projectRoot, "client/src/pages/OverviewPage.jsx"),
  "utf8"
);
const indexSource = fs.readFileSync(
  path.join(projectRoot, "client/src/index.css"),
  "utf8"
);
const teamLogoSource = fs.readFileSync(
  path.join(projectRoot, "client/src/components/TeamLogo.jsx"),
  "utf8"
);

describe("SKIP motion and responsive UI hooks", () => {
  it("keeps grouped workspace navigation and accessible labels in the shell", () => {
    expect(appSource).toContain('aria-label="SKIP workspace navigation"');
    expect(appSource).toContain('className="skip-nav-section"');
    expect(appSource).toContain("section:'Evaluation'");
    expect(appSource).toContain("title={t.label}");
    expect(appSource).toContain("width:196");
    expect(appSource).toContain("height:46");
    expect(appSource).toContain("padding:'16px 18px 24px'");
    expect(appSource).toContain('className="skip-low-data-indicator"');
    expect(appSource).toContain("Low Data Mode is active");
    expect(appSource).toContain("onClick={() => setTab('settings')}");
    expect(appSource).toContain(
      "aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}"
    );
    expect(appSource).toContain("skip-mobile-nav-backdrop");
    expect(appSource).toContain("skip-mobile-nav-open");
    expect(appSource).toContain("setMobileNavOpen(false)");
  });

  it("keeps reduced-motion support and mobile rail rules in the document styles", () => {
    expect(appSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(appSource).toContain(".skip-panel:hover");
    expect(documentSource).toContain(".skip-nav-section");
    expect(documentSource).toContain(".skip-mobile-nav-toggle");
    expect(indexSource).toContain(".skip-mobile-nav-backdrop");
    expect(indexSource).toContain(".skip-sidebar.skip-mobile-nav-open");
    expect(documentSource).toContain(
      ".skip-stat-strip > div { min-height:78px; }"
    );
    expect(appSource).toContain(
      ".skip-content table th, .skip-content table td"
    );
    expect(appSource).toContain(
      "padding-top:5px !important; padding-bottom:5px !important;"
    );
    expect(appSource).toContain(
      "padding-top:6px !important; padding-bottom:6px !important;"
    );
  });

  it("adds dedicated mobile hooks to dense player and prospect views", () => {
    expect(playersSource).toContain("skip-player-hero");
    expect(playersSource).toContain("skip-player-main-grid");
    expect(prospectsSource).toContain("skip-prospect-summary-grid");
    expect(prospectsSource).toContain("skip-prospect-workspace-grid");
    expect(documentSource).toContain(
      ".skip-player-main-grid { grid-template-columns:1fr !important;"
    );
    expect(documentSource).toContain(
      ".skip-prospect-workspace-grid { grid-template-columns:1fr !important;"
    );
    expect(playersSource).toContain('className="skip-long-table"');
    expect(prospectsSource).toContain('className="skip-long-table"');
    expect(prospectsSource).toContain("skip-table-group-row");
    expect(appSource).toContain(
      ".skip-long-table table thead th { position:sticky;"
    );
    expect(appSource).toContain(
      ".skip-panel:hover, .skip-stat-strip:hover { transform:none !important;"
    );
    expect(playersSource).toContain("getRepeaterTierSeverity");
    expect(playersSource).toContain(
      'aria-label="CBT repeater-tier severity legend"'
    );
    expect(prospectsSource).toContain("ProspectMobileCards");
    expect(prospectsSource).toContain("skip-prospect-mobile-cards");
    expect(indexSource).toContain(
      ".skip-prospect-mobile-cards { display:none; }"
    );
    expect(indexSource).toContain(
      ".skip-prospect-workspace-grid .skip-long-table { display:none !important; }"
    );
    expect(indexSource).not.toContain(
      "  .skip-long-table { display:none !important; }"
    );
    expect(overviewSource).toContain(
      "import TeamLogo from '../components/TeamLogo.jsx';"
    );
    expect(overviewSource).toContain("skip-overview-page");
    expect(overviewSource).toContain("overview-command-header");
    expect(overviewSource).toContain("overview-team-context");
    expect(indexSource).toContain(
      ".skip-overview-page { gap:12px !important; }"
    );
    expect(indexSource).toContain(
      ".skip-player-page .skip-profile-tab-grid { gap:10px; padding:10px; }"
    );
    expect(overviewSource).not.toContain("ProvenanceButton");
    expect(playersSource).not.toContain("ProvenanceButton");
    expect(indexSource).toContain(".skip-profile-source-strip");
    expect(indexSource).toContain(
      ".skip-provenance-drawer{width:100%;border-left:0}"
    );
    expect(overviewSource).toContain(
      "linear-gradient(to right, ${C.rust} 0%, ${C.amber} 50%, ${C.teal} 100%)"
    );
    expect(playersSource).toContain("import MetricInfo from");
    expect(indexSource).toContain(".skip-metric-info-popover");
    expect(appSource).toContain("skip-utility-section");
    expect(tickerSource).toContain('className="skip-ticker-message"');
    expect(tickerSource).toContain('className="skip-ticker-shell"');
    expect(indexSource).toContain("-webkit-overflow-scrolling:touch");
    expect(indexSource).toContain("touch-action:pan-y");
    expect(appSource).toContain('aria-controls="skip-mobile-nav"');
    expect(appSource).toContain("mobileNavFirstItemRef");
    expect(indexSource).toContain(
      ".skip-ticker-message { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }"
    );
    expect(overviewSource).toContain(
      'className="skip-affiliate-overview-grid"'
    );
    expect(overviewSource).toContain('className="skip-affiliate-savant-grid"');
    expect(indexSource).toContain(
      ".overview-team-context > label { flex:1 1 100% !important;"
    );
    expect(indexSource).toContain(".skip-overview-empty-state");
    expect(indexSource).toContain("--status-verified");
    expect(playersSource).toContain(
      "import TeamLogo from '../components/TeamLogo.jsx';"
    );
    expect(teamLogoSource).toContain("team-logos/${team.id}.svg");
  });
});
