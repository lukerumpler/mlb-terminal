import { afterEach, describe, expect, it, vi } from "vitest";
import playerAdvancedHandler from "./player-advanced.js";

function createResponse() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn(),
  };
}

describe("player advanced proxy CORS", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reflects an approved production browser origin before returning a preflight response", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGIN", "https://frontend.example");
    const res = createResponse();

    await playerAdvancedHandler(
      { method: "OPTIONS", headers: { origin: "https://frontend.example" }, query: {} },
      res
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://frontend.example");
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledOnce();
  });
});
