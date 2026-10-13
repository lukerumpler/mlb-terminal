export function utcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcMidnightMs(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}

export function hasAttemptedProviderToday(lastAttemptDay, now = Date.now()) {
  return lastAttemptDay === utcDayKey(now);
}

// --- Bounded retry for an upstream refresh that produced nothing -----------------
//
// The original rule was "one attempt per provider per UTC day". That protects
// providers, but it also meant one transient failure (a timeout, a 5xx, a network
// blip at deploy time) left the data dark for every client until UTC midnight.
//
// New rule, still conservative:
//   * a refresh that returned data is final for the day (never refetched);
//   * a failed refresh may be retried, at most `maxAttemptsPerDay` times in total
//     (default 3), and never sooner than `minGapMs` after the previous attempt
//     (default 30 minutes);
//   * a refresh the provider actively blocked (e.g. a Cloudflare challenge) is final
//     for the day, because retrying a block only prolongs it.
// PROVIDER_RETRY_MAX_PER_DAY=1 restores the old strictly-once behaviour.

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function providerRetryPolicy(env = process.env) {
  return {
    maxAttemptsPerDay: positiveInteger(env.PROVIDER_RETRY_MAX_PER_DAY, 3),
    minGapMs:
      positiveInteger(env.PROVIDER_RETRY_MIN_GAP_SECONDS, 30 * 60) * 1000,
  };
}

/** State shape: { day, attempts, lastAttemptAt, outcome: "pending"|"success"|"failed"|"blocked" } */
export function canAttemptProvider(
  state,
  now = Date.now(),
  policy = providerRetryPolicy()
) {
  if (!state || state.day !== utcDayKey(now)) return true;
  if (state.outcome === "success" || state.outcome === "blocked") return false;
  if (state.outcome === "pending") return false;
  if (state.attempts >= policy.maxAttemptsPerDay) return false;
  return now - state.lastAttemptAt >= policy.minGapMs;
}

/** Seconds until the next attempt is allowed, or null when none is allowed today. */
export function secondsUntilNextProviderAttempt(
  state,
  now = Date.now(),
  policy = providerRetryPolicy()
) {
  if (!state || state.day !== utcDayKey(now)) return 0;
  if (state.outcome !== "failed" || state.attempts >= policy.maxAttemptsPerDay)
    return null;
  return Math.max(
    0,
    Math.ceil((state.lastAttemptAt + policy.minGapMs - now) / 1000)
  );
}

export function recordProviderAttempt(state, now = Date.now()) {
  const day = utcDayKey(now);
  return {
    day,
    attempts: state?.day === day ? state.attempts + 1 : 1,
    lastAttemptAt: now,
    outcome: "pending",
  };
}

export function settleProviderAttempt(state, outcome) {
  return state ? { ...state, outcome } : state;
}
