import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./team-efficiency.js";
import { __resetFanGraphsProviderStateForTests } from "./fangraphs-models.js";
import { __resetTeamEfficiencyStateForTests } from "./team-efficiency.js";
import { __resetTeamFinancialsStateForTests } from "./team-financials.js";

const fgTable = (rows: Array<[string, string]>) =>
  `<table><thead><tr><th>#</th><th>Team</th><th>WAR</th></tr></thead><tbody>${rows
    .map(
      ([team, war], i) =>
        `<tr><td>${i + 1}</td><td>${team}</td><td>${war}</td></tr>`
    )
    .join("")}</tbody></table>`;
const brTable = `<table><thead><tr><th>Rk</th><th>Tm</th><th>WAR</th></tr></thead><tbody>
  <tr><th>1</th><td><a href="/teams/SDP/2026.shtml">San Diego Padres</a></td><td>36.0</td></tr>
  <tr><th>2</th><td><a href="/teams/NYY/2026.shtml">New York Yankees</a></td><td>44.0</td></tr></tbody></table>`;
const payrollHtml = `<table><thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Avg Age Team</th><th>Total Payroll Allocations</th><th>Active 26-Man</th><th>Injured</th><th>Retained</th><th>Buried</th></tr></thead><tbody>
  <tr><td>1</td><td>SD SD</td><td>90-72</td><td>29</td><td>$200,000,000</td><td>$150,000,000</td><td>$10,000,000</td><td>$1,000,000</td><td>$0</td></tr>
  <tr><td>2</td><td>NYY NYY</td><td>94-68</td><td>30</td><td>$300,000,000</td><td>$250,000,000</td><td>$10,000,000</td><td>$1,000,000</td><td>$0</td></tr></tbody></table>`;
const taxHtml = `<table><thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Roster</th><th>Status</th><th>Tax Payroll</th><th>Space</th><th>Tax Bill Estimated</th><th>Total Tax Payroll + Est. Bill</th><th>Active</th><th>Injured</th><th>Retained</th><th>Minor</th></tr></thead><tbody>
  <tr><td>1</td><td>SD SD</td><td>90-72</td><td>40</td><td>-</td><td>$210,000,000</td><td>$34,000,000</td><td>$0</td><td>$210,000,000</td><td>$150,000,000</td><td>$10,000,000</td><td>-</td><td>$1,000,000</td></tr>
  <tr><td>2</td><td>NYY NYY</td><td>94-68</td><td>40</td><td>-</td><td>$310,000,000</td><td>$-66,000,000</td><td>$20,000,000</td><td>$330,000,000</td><td>$250,000,000</td><td>$10,000,000</td><td>-</td><td>$1,000,000</td></tr></tbody></table>`;

type Mode = "ok" | "http500" | "cloudflare";
const modes = { fg: "ok" as Mode, br: "ok" as Mode, spotrac: "ok" as Mode };
const calls = { fg: 0, br: 0, spotrac: 0 };
let ipCounter = 0;

function respond(mode: Mode, body: string) {
  if (mode === "http500") return new Response("boom", { status: 500 });
  if (mode === "cloudflare")
    return new Response(
      "<title>Just a moment...</title> cloudflare challenge",
      { status: 403 }
    );
  return new Response(body, { status: 200 });
}

async function call(query: string) {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: null,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()];
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    end() {
      return res;
    },
  };
  const req: any = {
    method: "GET",
    url: `/api/team-efficiency?${query}`,
    headers: { "x-forwarded-for": `10.0.0.${++ipCounter}` },
    socket: { remoteAddress: "127.0.0.1" },
  };
  await (handler as any)(req, res);
  return { status: res.statusCode as number, body: res.body as any, headers };
}

beforeEach(() => {
  __resetFanGraphsProviderStateForTests();
  __resetTeamEfficiencyStateForTests();
  __resetTeamFinancialsStateForTests();
  Object.assign(modes, { fg: "ok", br: "ok", spotrac: "ok" });
  Object.assign(calls, { fg: 0, br: 0, spotrac: 0 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(input?.url || input);
      if (url.includes("fangraphs.com")) {
        calls.fg += 1;
        return respond(
          modes.fg,
          url.includes("stats=bat")
            ? fgTable([
                ["SD", "24.0"],
                ["NYY", "28.0"],
              ])
            : fgTable([
                ["SD", "12.0"],
                ["NYY", "16.0"],
              ])
        );
      }
      if (url.includes("baseball-reference.com")) {
        calls.br += 1;
        return respond(modes.br, brTable);
      }
      if (url.includes("spotrac.com")) {
        calls.spotrac += 1;
        return respond(
          modes.spotrac,
          url.includes("/tax/") ? taxHtml : payrollHtml
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const SD = (body: any) => body.rows[0];
const HALF_HOUR = 30 * 60_000;

describe("/api/team-efficiency end to end", () => {
  it("all providers up: both WAR sources, payroll and efficiency, with the minimum upstream requests", async () => {
    const { status, body } = await call("teams=SD,NYY&season=2026");
    expect(status).toBe(200);
    expect(body.status).toBe("live");
    expect(body.rows.map((r: any) => r.found)).toEqual([true, true]);
    const sd = SD(body);
    expect(sd.war).toMatchObject({
      fWAR: 36,
      bWAR: 36,
      total: 36,
      provider: "FanGraphs + Baseball-Reference",
      offensive: 24,
      pitching: 12,
    });
    expect(sd.war.consensus).toMatchObject({
      agreement: "high",
      providerCount: 2,
    });
    // Efficiency is internally consistent with payroll and WAR.
    expect(sd.efficiency.dollarsPerWar).toBe(
      Math.round(sd.payroll.amountUsd / sd.war.total)
    );
    // FanGraphs batting + pitching, one Baseball-Reference page, Spotrac payroll + tax shared by both teams.
    expect(calls).toEqual({ fg: 2, br: 1, spotrac: 2 });
  });

  it("serves a repeat request from cache without touching any provider", async () => {
    await call("teams=SD,NYY&season=2026");
    const before = { ...calls };
    const again = await call("teams=SD,NYY&season=2026");
    expect(again.status).toBe(200);
    expect(calls).toEqual(before);
    expect(again.headers["x-provider-cache"]).toBe("HIT");
  });

  it("FanGraphs blocked: Baseball-Reference carries the total and the row says so", async () => {
    modes.fg = "cloudflare";
    const { body } = await call("teams=SD&season=2026");
    const sd = SD(body);
    expect(sd.found).toBe(true);
    expect(sd.war).toMatchObject({
      fWAR: null,
      bWAR: 36,
      total: 36,
      provider: "Baseball-Reference",
      fallback: true,
    });
    expect(sd.war.consensus.agreement).toBe("single-source");
    expect(sd.efficiency.range).toBeNull();
  });

  it("Baseball-Reference down: FanGraphs alone still gives a labelled total", async () => {
    modes.br = "http500";
    const sd = SD((await call("teams=SD&season=2026")).body);
    expect(sd.found).toBe(true);
    expect(sd.war).toMatchObject({
      fWAR: 36,
      bWAR: null,
      total: 36,
      provider: "FanGraphs",
    });
    expect(sd.war.consensus.agreement).toBe("single-source");
  });

  it("Spotrac down: WAR is still returned, with no invented efficiency", async () => {
    modes.spotrac = "http500";
    const sd = SD((await call("teams=SD&season=2026")).body);
    expect(sd.found).toBe(false);
    expect(sd.war).toMatchObject({ total: 36, fWAR: 36, bWAR: 36 });
    expect(sd.payroll.amountUsd).toBeNull();
    expect(sd.efficiency).toMatchObject({
      dollarsPerWar: null,
      warPer100m: null,
    });
  });

  it("both WAR providers down: a clean gap, and no self-contradicting warnings", async () => {
    modes.fg = "http500";
    modes.br = "http500";
    const { status, body } = await call("teams=SD&season=2026");
    expect(status).toBe(200);
    expect(body.status).toBe("source-gap");
    const sd = SD(body);
    expect(sd.war.total).toBeNull();
    expect(sd.war.consensus.agreement).toBe("unavailable");
    const text = sd.warnings.join(" | ");
    // Neither provider exists, so neither "uses X only" claim can be true.
    expect(text).not.toMatch(/uses (FanGraphs|Baseball-Reference) only/);
    expect(text).toMatch(/Team WAR unavailable/);
  });
});

describe("WAR provider retry policy (bounded, never hammering)", () => {
  beforeEach(() =>
    vi
      .useFakeTimers({ toFake: ["Date"] })
      .setSystemTime(new Date("2026-10-12T10:00:00Z"))
  );
  afterEach(() => vi.useRealTimers());
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
  const flush = () => __resetTeamEfficiencyStateForTests(); // per-team 5 min cache is not what these tests probe

  it("recovers after a transient failure of both providers instead of staying dark until UTC midnight", async () => {
    modes.fg = "http500";
    modes.br = "http500";
    expect(SD((await call("team=SD&season=2026")).body).war.total).toBeNull();
    modes.fg = "ok";
    modes.br = "ok";
    advance(HALF_HOUR + 1000);
    flush();
    const sd = SD((await call("team=SD&season=2026")).body);
    expect(sd.found).toBe(true);
    expect(sd.war.total).toBe(36);
  });

  it("does not retry inside the minimum gap", async () => {
    modes.fg = "http500";
    modes.br = "http500";
    await call("team=SD&season=2026");
    const before = calls.fg + calls.br;
    advance(10 * 60_000);
    flush();
    await call("team=SD&season=2026");
    expect(calls.fg + calls.br).toBe(before);
  });

  it("stops after the daily attempt budget and resets on the next UTC day", async () => {
    modes.fg = "http500";
    modes.br = "http500";
    for (let i = 0; i < 6; i += 1) {
      await call("team=SD&season=2026");
      advance(HALF_HOUR + 1000);
      flush();
    }
    // 3 attempts x (2 FanGraphs pages + 1 Baseball-Reference page), then locked out.
    expect(calls.fg).toBe(6);
    expect(calls.br).toBe(3);
    vi.setSystemTime(new Date("2026-10-13T00:05:00Z"));
    flush();
    await call("team=SD&season=2026");
    expect(calls.fg).toBe(8);
  });

  it("PROVIDER_RETRY_MAX_PER_DAY=1 restores the old strictly-once-per-day behaviour", async () => {
    vi.stubEnv("PROVIDER_RETRY_MAX_PER_DAY", "1");
    try {
      modes.fg = "http500";
      modes.br = "http500";
      await call("team=SD&season=2026");
      const before = calls.fg + calls.br;
      advance(HALF_HOUR + 1000);
      flush();
      expect(SD((await call("team=SD&season=2026")).body).war.total).toBeNull();
      expect(calls.fg + calls.br).toBe(before);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a successful fetch is final for the day: no refetch even long after", async () => {
    await call("team=SD&season=2026");
    const before = { ...calls };
    advance(6 * 60 * 60_000);
    flush();
    __resetTeamFinancialsStateForTests();
    await call("team=SD&season=2026");
    expect(calls.fg).toBe(before.fg);
    expect(calls.br).toBe(before.br);
  });

  it("a Cloudflare-blocked FanGraphs plus failing Baseball-Reference is not retried that day", async () => {
    modes.fg = "cloudflare";
    modes.br = "http500";
    await call("team=SD&season=2026");
    const before = calls.fg;
    advance(HALF_HOUR + 1000);
    flush();
    await call("team=SD&season=2026");
    expect(calls.fg).toBe(before);
  });
});
