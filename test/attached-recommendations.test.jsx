import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBattedBallProfile,
  buildPitchArsenalRows,
  OverviewEmptyState,
  OVERVIEW_ACCENTS,
} from "../client/src/pages/OverviewPage.jsx";
import { render, screen } from "@testing-library/react";

const root = path.resolve(import.meta.dirname, "..");
const overviewSource = fs.readFileSync(
  path.join(root, "client/src/pages/OverviewPage.jsx"),
  "utf8"
);
const indexSource = fs.readFileSync(
  path.join(root, "client/src/index.css"),
  "utf8"
);

describe("attached SKIP UI recommendation contracts", () => {
  it("does not turn missing barrel or batted-ball classifications into false zeros", () => {
    const profile = buildBattedBallProfile([
      {
        launch_speed: 98,
        launch_angle: 12,
        bb_type: null,
        launch_speed_angle: null,
      },
      {
        launch_speed: 91,
        launch_angle: 4,
        bb_type: "",
        launch_speed_angle: null,
      },
    ]);
    expect(profile).toMatchObject({
      barrelPct: null,
      gbPct: null,
      fbPct: null,
      ldPct: null,
      sampleSize: 2,
    });
    expect(profile.hardHitPct).toBe(50);
  });

  it("keeps pitch usage values as percentages while leaving grade ranks separate", () => {
    const rows = buildPitchArsenalRows([
      { pitch_type: "FF", release_speed: 95 },
      { pitch_type: "FF", release_speed: 96 },
      { pitch_type: "SL", release_speed: 87 },
    ]);
    expect(rows[0]).toMatchObject({ type: "FF", pct: 66.7, count: 2 });
    expect(overviewSource).toContain(
      "usage ${p.pct == null ? 'unavailable' : `${p.pct.toFixed(1)} percent`}"
    );
    expect(overviewSource).toContain(
      "p.pct == null ? '—' : `${p.pct.toFixed(1)}%`"
    );
  });

  it("renders spaced unavailable copy and uses explicit accent categories", () => {
    render(
      <OverviewEmptyState
        status="Coverage Gap"
        message="Opponent contact quality"
        detail="Baseball Savant did not return verified opponent batted-ball rows for this season."
      />
    );
    expect(screen.getByText("Coverage Gap")).toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
    expect(screen.getByText("Opponent contact quality")).toBeInTheDocument();
    expect(screen.getByText("More detail")).toBeInTheDocument();
    expect(OVERVIEW_ACCENTS).toMatchObject({
      offense: expect.any(String),
      pitching: expect.any(String),
      defense: expect.any(String),
      context: expect.any(String),
    });
    expect(overviewSource).toContain("accent={OVERVIEW_ACCENTS.offense}");
    expect(overviewSource).toContain("accent={OVERVIEW_ACCENTS.pitching}");
    expect(overviewSource).toContain("accent={OVERVIEW_ACCENTS.defense}");
    expect(overviewSource).toContain("accent={OVERVIEW_ACCENTS.context}");
  });

  it("uses shared status badges and non-clipping desktop navigation rules", () => {
    expect(overviewSource).toContain(
      "import StatusBadge from '../components/StatusBadge.jsx';"
    );
    expect(overviewSource).toContain("coverage-gap");
    expect(overviewSource).toContain('aria-label="Batted Ball Profile data source"');
    expect(overviewSource).toContain('aria-label="Pitch Arsenal data source"');
    expect(overviewSource).toContain('aria-label="Contact Quality Allowed data source"');
    expect(indexSource).toContain(".skip-overview-empty-note summary");
    expect(indexSource).toContain(
      "white-space:nowrap;overflow:visible;text-overflow:clip;"
    );
    expect(indexSource).toContain(
      ".skip-overview-empty-copy { min-width:0; display:flex; flex-direction:column; gap:3px; }"
    );
  });
});
