import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

describe("UI audit P0 contracts", () => {
  it("keeps every compact Overview headline metric visible instead of hiding the final metric rows", () => {
    expect(css).toContain(".skip-overview-page .overview-team-metrics{display:grid");
    expect(css).not.toContain(
      ".skip-overview-page .overview-team-metrics > div:nth-child(n+6){display:none;}"
    );
  });

  it("uses the corrected accessible secondary-text tokens in light and dark themes", () => {
    expect(html).toContain("--text3:#826755; --text4:#766351;");
    expect(html).toContain("--text3:#7C87A8; --text4:#8A93AD;");
    expect(html).not.toContain("--text3:#876B58; --text4:#9C8570;");
    expect(html).not.toContain("--text3:#7C87A8; --text4:#626D8C;");
  });

  it("keeps the performance-summary status label above the previous 7px readability floor", () => {
    expect(css).toMatch(
      /\.skip-performance-summary-card-status[^}]*font-size:8\.5px/
    );
  });
});
