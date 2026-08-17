const FAILURE_HEADER = "x-staging-provider-failure-token";

function configuredToken() {
  return String(process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN || "").trim();
}

function headerValue(headers = {}) {
  return String(
    headers[FAILURE_HEADER] ||
      headers[FAILURE_HEADER.toLowerCase()] ||
      headers["X-Staging-Provider-Failure-Token"] ||
      ""
  ).trim();
}

export function authorizeProviderFailureHook(headers = {}) {
  if (process.env.NODE_ENV === "production") {
    return { allowed: false, reason: "production-disabled" };
  }
  if (process.env.NODE_ENV !== "staging") {
    return { allowed: false, reason: "staging-only" };
  }
  if (String(process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED || "").toLowerCase() !== "true") {
    return { allowed: false, reason: "not-enabled" };
  }
  const token = configuredToken();
  if (!token) return { allowed: false, reason: "not-configured" };
  const supplied = headerValue(headers);
  if (!supplied) return { allowed: false, reason: "missing-token" };
  if (supplied !== token) return { allowed: false, reason: "invalid-token" };
  return { allowed: true };
}

export function isFailureInjectionRequested(req = {}) {
  return String(req.headers?.["x-staging-provider-failure"] || "").toLowerCase() === "true";
}

export function failureInjectionResponse(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Provider-Failure-Hook", "enabled");
  return res.status(503).json({
    error: "Synthetic Savant provider failure",
    code: "STAGING_PROVIDER_FAILURE",
  });
}
