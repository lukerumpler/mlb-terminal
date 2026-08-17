import { describe, expect, it } from "vitest";
import { humanizePlayerLoadError } from "../client/src/pages/PlayersPage.jsx";

describe("player load error messages", () => {
  it("does not leak raw timeout details", () => {
    const message = humanizePlayerLoadError({ name: "TimeoutError", message: "The operation was aborted due to timeout" }, "Shohei Ohtani");
    expect(message).toContain("did not respond in time");
    expect(message).not.toContain("aborted");
  });

  it("explains provider throttling without exposing transport text", () => {
    const message = humanizePlayerLoadError({ status: 429, message: "Too Many Requests" }, "Mookie Betts");
    expect(message).toContain("limiting requests");
    expect(message).not.toContain("Too Many Requests");
  });
});
