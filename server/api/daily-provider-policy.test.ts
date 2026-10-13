import { describe, expect, it } from "vitest";
import {
  canAttemptProvider,
  providerRetryPolicy,
  recordProviderAttempt,
  secondsUntilNextProviderAttempt,
  settleProviderAttempt,
} from "./daily-provider-policy.js";

const policy = { maxAttemptsPerDay: 3, minGapMs: 30 * 60_000 };
const t0 = Date.parse("2026-10-12T10:00:00Z");
const failedAt = (now: number, attempts = 1) =>
  settleProviderAttempt(
    { day: "2026-10-12", attempts, lastAttemptAt: now, outcome: "pending" },
    "failed"
  );

describe("canAttemptProvider", () => {
  it("always allows the first attempt of a day", () => {
    expect(canAttemptProvider(undefined, t0, policy)).toBe(true);
    expect(canAttemptProvider(failedAt(t0 - 86_400_000), t0, policy)).toBe(
      true
    );
  });

  it("never starts a second attempt while one is in flight", () => {
    expect(
      canAttemptProvider(
        recordProviderAttempt(undefined, t0),
        t0 + 3_600_000,
        policy
      )
    ).toBe(false);
  });

  it("treats a success or a provider block as final for the day", () => {
    const base = recordProviderAttempt(undefined, t0);
    expect(
      canAttemptProvider(
        settleProviderAttempt(base, "success"),
        t0 + 6 * 3_600_000,
        policy
      )
    ).toBe(false);
    expect(
      canAttemptProvider(
        settleProviderAttempt(base, "blocked"),
        t0 + 6 * 3_600_000,
        policy
      )
    ).toBe(false);
  });

  it("retries a failure only after the minimum gap", () => {
    const state = failedAt(t0);
    expect(canAttemptProvider(state, t0 + 29 * 60_000, policy)).toBe(false);
    expect(canAttemptProvider(state, t0 + 30 * 60_000, policy)).toBe(true);
  });

  it("stops once the daily budget is spent", () => {
    expect(canAttemptProvider(failedAt(t0, 2), t0 + 3_600_000, policy)).toBe(
      true
    );
    expect(canAttemptProvider(failedAt(t0, 3), t0 + 3_600_000, policy)).toBe(
      false
    );
  });
});

describe("recordProviderAttempt / secondsUntilNextProviderAttempt", () => {
  it("counts attempts within a UTC day and resets on the next", () => {
    const first = recordProviderAttempt(undefined, t0);
    const second = recordProviderAttempt(
      settleProviderAttempt(first, "failed"),
      t0 + 3_600_000
    );
    expect(second.attempts).toBe(2);
    expect(
      recordProviderAttempt(second, Date.parse("2026-10-13T00:01:00Z")).attempts
    ).toBe(1);
  });

  it("reports the wait, and null when no retry is possible today", () => {
    expect(
      secondsUntilNextProviderAttempt(failedAt(t0), t0 + 10 * 60_000, policy)
    ).toBe(20 * 60);
    expect(
      secondsUntilNextProviderAttempt(failedAt(t0, 3), t0 + 10 * 60_000, policy)
    ).toBeNull();
    expect(
      secondsUntilNextProviderAttempt(
        settleProviderAttempt(recordProviderAttempt(undefined, t0), "success"),
        t0,
        policy
      )
    ).toBeNull();
    expect(secondsUntilNextProviderAttempt(undefined, t0, policy)).toBe(0);
  });
});

describe("providerRetryPolicy", () => {
  it("defaults to 3 attempts, 30 minutes apart", () => {
    expect(providerRetryPolicy({})).toEqual({
      maxAttemptsPerDay: 3,
      minGapMs: 1_800_000,
    });
  });

  it("reads overrides and ignores invalid values", () => {
    expect(
      providerRetryPolicy({
        PROVIDER_RETRY_MAX_PER_DAY: "1",
        PROVIDER_RETRY_MIN_GAP_SECONDS: "60",
      })
    ).toEqual({ maxAttemptsPerDay: 1, minGapMs: 60_000 });
    for (const bad of ["0", "-2", "abc", "2.5", ""]) {
      expect(
        providerRetryPolicy({
          PROVIDER_RETRY_MAX_PER_DAY: bad,
          PROVIDER_RETRY_MIN_GAP_SECONDS: bad,
        })
      ).toEqual({ maxAttemptsPerDay: 3, minGapMs: 1_800_000 });
    }
  });
});
