import { describe, expect, it, vi } from "vitest";
import lahmanHandler from "./lahman.js";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
}

describe("lahman career-gap route", () => {
  it("finds a real current player from the checked-in dataset by MLBAM id", async () => {
    const res = createResponse();
    await lahmanHandler({ method: "GET", query: { mlbam: "545361" }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.found).toBe(true);
    expect(Array.isArray(body.batting)).toBe(true);
    expect(body.batting.length).toBeGreaterThan(0);
    expect(body.batting.every(row => row.isHistorical === true && row.source === "Lahman")).toBe(true);
  });

  it("reports found:false rather than erroring for an id with no dataset entry", async () => {
    const res = createResponse();
    await lahmanHandler({ method: "GET", query: { mlbam: "1" }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ found: false, mlbam: "1" });
  });

  it("rejects a missing or non-numeric mlbam parameter", async () => {
    const res = createResponse();
    await lahmanHandler({ method: "GET", query: {}, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const res2 = createResponse();
    await lahmanHandler({ method: "GET", query: { mlbam: "not-a-number" }, headers: {} }, res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  it("rejects non-GET methods", async () => {
    const res = createResponse();
    await lahmanHandler({ method: "POST", query: { mlbam: "545361" }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
