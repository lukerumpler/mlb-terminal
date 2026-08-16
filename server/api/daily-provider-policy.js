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
