import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("production environment contract", () => {
  it("exposes string-valued configuration fields without leaking secret contents", () => {
    expect(typeof ENV.appId).toBe("string");
    expect(typeof ENV.cookieSecret).toBe("string");
    expect(typeof ENV.databaseUrl).toBe("string");
    expect(typeof ENV.oAuthServerUrl).toBe("string");
    expect(typeof ENV.ownerOpenId).toBe("string");
    expect(typeof ENV.forgeApiUrl).toBe("string");
    expect(typeof ENV.forgeApiKey).toBe("string");
  });
});
