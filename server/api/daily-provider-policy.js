/*
Our goal is to decide when we are allowed to ask an upstream data provider (FanGraphs, Baseball-Reference and so on) for data
again. The original rule was "one attempt per provider per UTC day". That protects the providers, but it also meant that one
transient failure (a timeout, a 5xx, a network blip) left the data dark for every client until UTC midnight.

Our new rule is still conservative:
  * A refresh that returned data is final for the day, we never ask again
  * A failed refresh may be retried, at most "maxAttemptsPerDay" times in total (default 3), and never sooner than "minGapMs"
    after the previous attempt (default 30 minutes)
  * A "partial" refresh (one provider answered, the other did not) may ask again for the missing one, inside the same budget
  * A refresh that the provider actively blocked (for example a Cloudflare challenge) is final for the day, because retrying
    a block only makes it last longer
  * PROVIDER_RETRY_MAX_PER_DAY=1 puts back the old strictly-once rule

To do this we are going to:
  1. Keep small helpers for the UTC day (Section A)
  2. Read our retry limits from the environment (Section B)
  3. Decide if we may try now, and how long until we may (Section C)
  4. Record and settle each attempt (Section D)
*/

// Section A: Working with the UTC day

export function utcDayKey(now = Date.now()) {
  /*
  Our "utcDayKey" is a function that names the UTC day. When we give it:
                  a time in milliseconds (the current time if we leave it out)
  it returns to us:
                  the day as text, for example "2026-10-16"
  */
  return new Date(now).toISOString().slice(0, 10);                            // The date part of the ISO text is the UTC day
}

export function nextUtcMidnightMs(now = Date.now()) {
  /*
  Our "nextUtcMidnightMs" is a function that finds when the next UTC day starts. When we give it:
                  a time in milliseconds (the current time if we leave it out)
  it returns to us:
                  the next UTC midnight in milliseconds
  */
  const next = new Date(now);                                                 // Start from the time we were given
  next.setUTCHours(24, 0, 0, 0);                                              // Hour 24 rolls over to 00:00:00.000 of the next day
  return next.getTime();
}

export function hasAttemptedProviderToday(lastAttemptDay, now = Date.now()) {
  return lastAttemptDay === utcDayKey(now);                                   // True when the last attempt happened on today's UTC day
}

// Section B: Our retry limits

function positiveInteger(value, fallback) {
  const parsed = Number(value);                                               // Turn the text from the environment into a number
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;                                                            // A whole number above zero is the only thing we accept
  }
  return fallback;                                                            // Anything else (missing, zero, negative, text) uses the default
}

export function providerRetryPolicy(env = process.env) {
  const maxAttemptsPerDay = positiveInteger(env.PROVIDER_RETRY_MAX_PER_DAY, 3);   // Total attempts allowed in one UTC day
  const minGapSeconds = positiveInteger(env.PROVIDER_RETRY_MIN_GAP_SECONDS, 30 * 60);   // Least time between two attempts, 30 minutes
  return {
    maxAttemptsPerDay: maxAttemptsPerDay,
    minGapMs: minGapSeconds * 1000,                                           // We compare in milliseconds, so convert from seconds
  };
}

// Section C: Deciding if we may try

/**
 * State shape: { day, attempts, lastAttemptAt, outcome: "pending"|"success"|"failed"|"partial"|"blocked" }
 * "partial" means one provider answered and the other did not, so the missing one may be asked again (within the same budget).
 */
export function canAttemptProvider(
  state,
  now = Date.now(),
  policy = providerRetryPolicy()
) {
  if (!state || state.day !== utcDayKey(now)) {
    return true;                                                              // No attempt yet today, so we may try
  }
  if (state.outcome === "success" || state.outcome === "blocked") {
    return false;                                                             // Final for the day, either we have the data or we were blocked
  }
  if (state.outcome === "pending") {
    return false;                                                             // An attempt is running right now, we do not start a second one
  }
  if (state.attempts >= policy.maxAttemptsPerDay) {
    return false;                                                             // We already used the whole daily budget
  }
  return now - state.lastAttemptAt >= policy.minGapMs;                        // Only when the minimum gap since the last attempt has passed
}

/** Seconds until the next attempt is allowed, or null when none is allowed today. */
export function secondsUntilNextProviderAttempt(
  state,
  now = Date.now(),
  policy = providerRetryPolicy()
) {
  if (!state || state.day !== utcDayKey(now)) {
    return 0;                                                                 // No attempt yet today, so we may try right now
  }
  const canRetry = state.outcome === "failed" || state.outcome === "partial";   // Only these two outcomes are ever worth another try
  if (!canRetry || state.attempts >= policy.maxAttemptsPerDay) {
    return null;                                                              // Nothing more is allowed today
  }
  const msLeft = state.lastAttemptAt + policy.minGapMs - now;                 // Time left until the minimum gap has passed
  return Math.max(0, Math.ceil(msLeft / 1000));                               // Round up to whole seconds, never below zero
}

// Section D: Recording each attempt

export function recordProviderAttempt(state, now = Date.now()) {
  const day = utcDayKey(now);                                                 // Which UTC day this attempt belongs to
  let attempts = 1;                                                           // A new day starts counting again from one
  if (state?.day === day) {
    attempts = state.attempts + 1;                                            // Same day, so this is one more attempt
  }
  return {
    day: day,
    attempts: attempts,
    lastAttemptAt: now,                                                       // When it started, we measure the minimum gap from here
    outcome: "pending",                                                       // It stays pending until we settle it
  };
}

export function settleProviderAttempt(state, outcome) {
  if (!state) {
    return state;                                                             // Nothing was recorded, so there is nothing to settle
  }
  return { ...state, outcome: outcome };                                      // Same attempt, now with its final outcome
}
