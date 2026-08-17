var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/env.ts
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
    };
  }
});

// server/_core/llm.ts
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
var ensureArray, normalizeContentPart, normalizeMessage, normalizeToolChoice, resolveApiUrl, assertApiKey, normalizeResponseFormat, RETRY_MAX_RETRIES, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, sleep, parseRetryAfter, computeBackoffDelay, fetchWithBackoff;
var init_llm = __esm({
  "server/_core/llm.ts"() {
    "use strict";
    init_env();
    ensureArray = (value) => Array.isArray(value) ? value : [value];
    normalizeContentPart = (part) => {
      if (typeof part === "string") {
        return { type: "text", text: part };
      }
      if (part.type === "text") {
        return part;
      }
      if (part.type === "image_url") {
        return part;
      }
      if (part.type === "file_url") {
        return part;
      }
      throw new Error("Unsupported message content part");
    };
    normalizeMessage = (message) => {
      const { role, name, tool_call_id } = message;
      if (role === "tool" || role === "function") {
        const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
        return {
          role,
          name,
          tool_call_id,
          content
        };
      }
      const contentParts = ensureArray(message.content).map(normalizeContentPart);
      if (contentParts.length === 1 && contentParts[0].type === "text") {
        return {
          role,
          name,
          content: contentParts[0].text
        };
      }
      return {
        role,
        name,
        content: contentParts
      };
    };
    normalizeToolChoice = (toolChoice, tools) => {
      if (!toolChoice) return void 0;
      if (toolChoice === "none" || toolChoice === "auto") {
        return toolChoice;
      }
      if (toolChoice === "required") {
        if (!tools || tools.length === 0) {
          throw new Error(
            "tool_choice 'required' was provided but no tools were configured"
          );
        }
        if (tools.length > 1) {
          throw new Error(
            "tool_choice 'required' needs a single tool or specify the tool name explicitly"
          );
        }
        return {
          type: "function",
          function: { name: tools[0].function.name }
        };
      }
      if ("name" in toolChoice) {
        return {
          type: "function",
          function: { name: toolChoice.name }
        };
      }
      return toolChoice;
    };
    resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
    assertApiKey = () => {
      if (!ENV.forgeApiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
    };
    normalizeResponseFormat = ({
      responseFormat,
      response_format,
      outputSchema,
      output_schema
    }) => {
      const explicitFormat = responseFormat || response_format;
      if (explicitFormat) {
        if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
          throw new Error(
            "responseFormat json_schema requires a defined schema object"
          );
        }
        return explicitFormat;
      }
      const schema = outputSchema || output_schema;
      if (!schema) return void 0;
      if (!schema.name || !schema.schema) {
        throw new Error("outputSchema requires both name and schema");
      }
      return {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
        }
      };
    };
    RETRY_MAX_RETRIES = 4;
    RETRY_BASE_DELAY_MS = 500;
    RETRY_MAX_DELAY_MS = 3e4;
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    parseRetryAfter = (value) => {
      if (!value) return void 0;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
      const at = Date.parse(value);
      return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
    };
    computeBackoffDelay = (attempt, retryAfterMs2) => {
      const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      const jittered = cap / 2 + Math.random() * (cap / 2);
      return Math.min(Math.max(jittered, retryAfterMs2 ?? 0), RETRY_MAX_DELAY_MS);
    };
    fetchWithBackoff = async (url, init) => {
      let lastError;
      for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(url, init);
          if (response.ok || response.status === 412 || attempt === RETRY_MAX_RETRIES) {
            return response;
          }
          const retryAfterMs2 = parseRetryAfter(response.headers.get("retry-after"));
          try {
            await response.body?.cancel();
          } catch {
          }
          console.warn(
            `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
          );
          await sleep(computeBackoffDelay(attempt, retryAfterMs2));
        } catch (error) {
          lastError = error;
          if (attempt === RETRY_MAX_RETRIES) throw error;
          console.warn(
            `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
          );
          await sleep(computeBackoffDelay(attempt));
        }
      }
      throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
    };
  }
});

// server/api/_shared.js
function configuredCorsOrigins() {
  return (process.env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}
function applyCors(req, res) {
  const allowedOrigins = configuredCorsOrigins();
  const isProduction = process.env.NODE_ENV === "production";
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (allowedOrigins.length === 0 && !isProduction) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin && allowedOrigins.length > 0) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
  } else if (origin) {
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}
function isRateLimited(req, bucket = "shared") {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t2) => now - t2 < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5e3) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}
function rateLimitResponse(res) {
  res.setHeader("Retry-After", "10");
  return res.status(429).json({
    error: "Too many requests \u2014 please slow down and try again shortly."
  });
}
var hits, WINDOW_MS, MAX_PER_WINDOW;
var init_shared = __esm({
  "server/api/_shared.js"() {
    "use strict";
    hits = /* @__PURE__ */ new Map();
    WINDOW_MS = 1e4;
    MAX_PER_WINDOW = 30;
  }
});

// server/api/mlb.js
var mlb_exports = {};
__export(mlb_exports, {
  __resetMlbProxyStateForTests: () => __resetMlbProxyStateForTests,
  default: () => handler,
  getUpstreamTimeoutMs: () => getUpstreamTimeoutMs
});
function getUpstreamTimeoutMs(path2) {
  for (const [prefix, timeoutMs] of Object.entries(UPSTREAM_TIMEOUT_MS)) {
    if (prefix !== "default" && path2.startsWith(prefix)) return timeoutMs;
  }
  return UPSTREAM_TIMEOUT_MS.default;
}
function __resetMlbProxyStateForTests() {
  responseCache.clear();
  inFlightRequests.clear();
  upstreamFailureUntil.clear();
}
function responseCacheKey(path2, forwardedQs) {
  return `${path2}?${forwardedQs}`;
}
function setProxyHeaders(res, rule, source2, cacheStatus, freshness = "live") {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`
  );
  res.setHeader("X-Proxy-Source", source2);
  res.setHeader("X-Proxy-Cache", cacheStatus);
  res.setHeader("X-Proxy-Freshness", freshness);
}
function getStaleEntry(entry) {
  return entry && entry.staleExpiresAt > Date.now() ? entry : null;
}
function serveStale(res, rule, entry, reason) {
  setProxyHeaders(res, rule, entry.source, "STALE", "stale-cached");
  res.setHeader("X-Proxy-Stale-Reason", reason);
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  return res.status(200).json(entry.data);
}
function getCacheRule(path2) {
  for (const [prefix, rule] of Object.entries(CACHE_RULES)) {
    if (prefix !== "default" && path2.startsWith(prefix)) return rule;
  }
  return CACHE_RULES.default;
}
async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const urlObj = new URL(req.url, "https://placeholder.invalid");
  const path2 = urlObj.searchParams.get("path");
  if (!path2) {
    return res.status(400).json({
      error: "Missing required query param: path",
      example: "/api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting,season=2026)"
    });
  }
  if (!path2.startsWith("/") || path2.includes("://")) {
    return res.status(400).json({ error: "Invalid path parameter" });
  }
  const rawQuery = req.url.includes("?") ? req.url.split("?")[1] : "";
  const forwardedQs = rawQuery.split("&").filter((part) => !part.startsWith("path=")).join("&");
  const rule = getCacheRule(path2);
  const cacheKey2 = responseCacheKey(path2, forwardedQs);
  const cached = responseCache.get(cacheKey2);
  if (cached && cached.expiresAt > Date.now()) {
    setProxyHeaders(res, rule, cached.source, "HIT", "fresh");
    return res.status(200).json(cached.data);
  }
  if (cached && !getStaleEntry(cached)) responseCache.delete(cacheKey2);
  const existingRequest = inFlightRequests.get(cacheKey2);
  if (existingRequest) {
    try {
      const result = await existingRequest;
      setProxyHeaders(res, rule, result.source, "COALESCED");
      return res.status(200).json(result.data);
    } catch (error) {
      if (getStaleEntry(cached))
        return serveStale(
          res,
          rule,
          cached,
          error?.status === 429 ? "upstream-rate-limit" : "upstream-unavailable"
        );
      if (error?.retryAfter) res.setHeader("Retry-After", error.retryAfter);
      return res.status(error?.status || 502).json(error?.payload || { error: "MLB upstream request failed" });
    }
  }
  const failureUntil = upstreamFailureUntil.get(cacheKey2) || 0;
  if (failureUntil > Date.now()) {
    if (getStaleEntry(cached))
      return serveStale(res, rule, cached, "recent-upstream-failure");
    const retryAfter = Math.ceil((failureUntil - Date.now()) / 1e3);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(503).json({
      error: "MLB resource temporary upstream cooldown active",
      retryAfter,
      path: path2
    });
  }
  if (failureUntil) upstreamFailureUntil.delete(cacheKey2);
  if (isRateLimited(req, "mlb")) return rateLimitResponse(res);
  const mlbUrl = `${MLB_BASE}${path2}${forwardedQs ? "?" + forwardedQs : ""}`;
  const upstreamRequest = (async () => {
    let mlbRes;
    try {
      mlbRes = await fetch(mlbUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MLBDashboard/1.0)",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(getUpstreamTimeoutMs(path2))
      });
    } catch (err) {
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      console.error("[mlb-proxy] fetch error:", err.message);
      throw {
        status: isTimeout ? 504 : 502,
        payload: {
          error: isTimeout ? "MLB API timed out" : "Failed to reach MLB API",
          detail: err.message,
          url: mlbUrl
        }
      };
    }
    if (!mlbRes.ok) {
      const body = await mlbRes.text().catch(() => "");
      const retryAfter = mlbRes.headers?.get?.("Retry-After");
      console.error(
        "[mlb-proxy] MLB returned",
        mlbRes.status,
        "| url:",
        mlbUrl
      );
      throw {
        status: mlbRes.status,
        retryAfter,
        payload: {
          error: `MLB API responded with ${mlbRes.status}`,
          url: mlbUrl,
          body: body.slice(0, 500)
        }
      };
    }
    let data;
    try {
      const body = await mlbRes.text();
      if (!body.trim())
        throw Object.assign(new Error("empty response"), { emptyBody: true });
      data = JSON.parse(body);
    } catch (err) {
      console.error(
        "[mlb-proxy] JSON parse error | url:",
        mlbUrl,
        "| detail:",
        err.message
      );
      throw {
        status: 502,
        payload: {
          error: err.emptyBody ? "MLB API returned an empty response" : "MLB API returned non-JSON response",
          url: mlbUrl
        }
      };
    }
    return { data, source: mlbUrl };
  })();
  inFlightRequests.set(cacheKey2, upstreamRequest);
  try {
    const result = await upstreamRequest;
    upstreamFailureUntil.delete(cacheKey2);
    const expiresAt = Date.now() + rule.s * 1e3;
    responseCache.set(cacheKey2, {
      data: result.data,
      source: result.source,
      expiresAt,
      staleExpiresAt: expiresAt + Math.max(rule.swr * 1e3, 6e4)
    });
    if (responseCache.size > 500) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey) responseCache.delete(oldestKey);
    }
    setProxyHeaders(res, rule, result.source, "MISS", "fresh");
    return res.status(200).json(result.data);
  } catch (error) {
    if (error?.status >= 500)
      upstreamFailureUntil.set(cacheKey2, Date.now() + MLB_FAILURE_COOLDOWN_MS);
    if (getStaleEntry(cached))
      return serveStale(
        res,
        rule,
        cached,
        error?.status === 429 ? "upstream-rate-limit" : "upstream-unavailable"
      );
    if (error?.retryAfter) res.setHeader("Retry-After", error.retryAfter);
    return res.status(error?.status || 502).json(error?.payload || { error: "MLB upstream request failed" });
  } finally {
    if (inFlightRequests.get(cacheKey2) === upstreamRequest)
      inFlightRequests.delete(cacheKey2);
  }
}
var MLB_BASE, CACHE_RULES, responseCache, MLB_FAILURE_COOLDOWN_MS, UPSTREAM_TIMEOUT_MS, upstreamFailureUntil, inFlightRequests;
var init_mlb = __esm({
  "server/api/mlb.js"() {
    "use strict";
    init_shared();
    MLB_BASE = "https://statsapi.mlb.com/api/v1";
    CACHE_RULES = {
      "/standings": { s: 120, swr: 60 },
      "/schedule": { s: 90, swr: 60 },
      "/teams": { s: 300, swr: 120 },
      "/stats/leaders": { s: 300, swr: 120 },
      "/people": { s: 600, swr: 300 },
      default: { s: 180, swr: 90 }
    };
    responseCache = /* @__PURE__ */ new Map();
    MLB_FAILURE_COOLDOWN_MS = 15e3;
    UPSTREAM_TIMEOUT_MS = {
      "/schedule": 2e4,
      "/teams": 15e3,
      default: 12e3
    };
    upstreamFailureUntil = /* @__PURE__ */ new Map();
    inFlightRequests = /* @__PURE__ */ new Map();
  }
});

// server/api/ncaa.js
var ncaa_exports = {};
__export(ncaa_exports, {
  default: () => handler2
});
function getCacheRule2(path2) {
  for (const [prefix, rule] of Object.entries(CACHE_RULES2)) {
    if (prefix !== "default" && path2.startsWith(prefix)) return rule;
  }
  return CACHE_RULES2.default;
}
async function handler2(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const urlObj = new URL(req.url, "https://placeholder.invalid");
  const path2 = urlObj.searchParams.get("path");
  if (!path2) {
    return res.status(400).json({
      error: "Missing required query param: path",
      example: "/api/ncaa?path=/scoreboard/baseball/d1/2026/05/all-conf"
    });
  }
  if (!path2.startsWith("/") || path2.includes("://")) {
    return res.status(400).json({ error: "Invalid path parameter" });
  }
  const rawQuery = req.url.includes("?") ? req.url.split("?")[1] : "";
  const forwardedQs = rawQuery.split("&").filter((p) => !p.startsWith("path=")).join("&");
  const ncaaUrl = `${NCAA_BASE}${path2}${forwardedQs ? "?" + forwardedQs : ""}`;
  const rule = getCacheRule2(path2);
  const cacheKey2 = `${path2}?${forwardedQs}`;
  const cached = responseCache2.get(cacheKey2);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`
    );
    res.setHeader("X-Proxy-Source", ncaaUrl);
    res.setHeader("X-Proxy-Cache", "HIT");
    return res.status(200).json(cached.data);
  }
  if (cached) responseCache2.delete(cacheKey2);
  const existingRequest = inFlightRequests2.get(cacheKey2);
  if (existingRequest) {
    try {
      const data = await existingRequest;
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`
      );
      res.setHeader("X-Proxy-Source", ncaaUrl);
      res.setHeader("X-Proxy-Cache", "COALESCED");
      return res.status(200).json(data);
    } catch (error) {
      return res.status(error?.status || 502).json(error?.payload || { error: "NCAA upstream request failed" });
    }
  }
  if (isRateLimited(req, "ncaa")) return rateLimitResponse(res);
  const upstreamRequest = (async () => {
    let ncaaRes;
    try {
      ncaaRes = await fetch(ncaaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SKIPBaseball/1.0)",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(12e3)
      });
    } catch (err) {
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      console.error("[ncaa-proxy] fetch error:", err.message);
      throw {
        status: isTimeout ? 504 : 502,
        payload: {
          error: isTimeout ? "NCAA API timed out" : "Failed to reach NCAA API",
          detail: err.message,
          url: ncaaUrl
        }
      };
    }
    if (!ncaaRes.ok) {
      const body = await ncaaRes.text().catch(() => "");
      throw {
        status: ncaaRes.status,
        payload: {
          error: `NCAA API responded with ${ncaaRes.status}`,
          url: ncaaUrl,
          body: body.slice(0, 500)
        }
      };
    }
    let data;
    try {
      data = await ncaaRes.json();
    } catch (err) {
      throw {
        status: 502,
        payload: { error: "NCAA API returned non-JSON response", url: ncaaUrl }
      };
    }
    return data;
  })();
  inFlightRequests2.set(cacheKey2, upstreamRequest);
  try {
    const data = await upstreamRequest;
    responseCache2.set(cacheKey2, {
      data,
      expiresAt: Date.now() + rule.s * 1e3
    });
    if (responseCache2.size > 300)
      responseCache2.delete(responseCache2.keys().next().value);
    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`
    );
    res.setHeader("X-Proxy-Source", ncaaUrl);
    res.setHeader("X-Proxy-Cache", "MISS");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error?.status || 502).json(error?.payload || { error: "NCAA upstream request failed" });
  } finally {
    if (inFlightRequests2.get(cacheKey2) === upstreamRequest)
      inFlightRequests2.delete(cacheKey2);
  }
}
var NCAA_BASE, responseCache2, inFlightRequests2, CACHE_RULES2;
var init_ncaa = __esm({
  "server/api/ncaa.js"() {
    "use strict";
    init_shared();
    NCAA_BASE = "https://ncaa-api.henrygd.me";
    responseCache2 = /* @__PURE__ */ new Map();
    inFlightRequests2 = /* @__PURE__ */ new Map();
    CACHE_RULES2 = {
      "/scoreboard": { s: 30, swr: 15 },
      // live scores — short TTL
      "/game": { s: 60, swr: 30 },
      // box scores / PBP
      "/stats": { s: 300, swr: 120 },
      // stat leaders
      "/standings": { s: 300, swr: 120 },
      "/rankings": { s: 600, swr: 300 },
      "/schedule": { s: 600, swr: 300 },
      "/news": { s: 300, swr: 120 },
      "/brackets": { s: 60, swr: 30 },
      default: { s: 180, swr: 90 }
    };
  }
});

// server/api/provider-failure-hook.js
function configuredToken() {
  return String(process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN || "").trim();
}
function headerValue(headers = {}) {
  return String(
    headers[FAILURE_HEADER] || headers[FAILURE_HEADER.toLowerCase()] || headers["X-Staging-Provider-Failure-Token"] || ""
  ).trim();
}
function authorizeProviderFailureHook(headers = {}) {
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
function isFailureInjectionRequested(req = {}) {
  return String(req.headers?.["x-staging-provider-failure"] || "").toLowerCase() === "true";
}
function failureInjectionResponse(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Provider-Failure-Hook", "enabled");
  return res.status(503).json({
    error: "Synthetic Savant provider failure",
    code: "STAGING_PROVIDER_FAILURE"
  });
}
var FAILURE_HEADER;
var init_provider_failure_hook = __esm({
  "server/api/provider-failure-hook.js"() {
    "use strict";
    FAILURE_HEADER = "x-staging-provider-failure-token";
  }
});

// server/api/savant.js
var savant_exports = {};
__export(savant_exports, {
  __resetSavantStateForTests: () => __resetSavantStateForTests,
  default: () => handler3,
  warmSavantCache: () => warmSavantCache
});
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
function csvToJson(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(
    (h) => h.replace(/^"|"$/g, "").replace(/^\uFEFF/, "")
  );
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      const raw = (vals[i] ?? "").replace(/^"|"$/g, "");
      if (raw === "") {
        obj[h] = null;
        return;
      }
      const num = Number(raw);
      obj[h] = !Number.isNaN(num) ? num : raw;
    });
    return obj;
  });
}
async function fetchWithRedirects(url, maxRedirects = 3) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SKIPBaseball/1.0)",
        Accept: "text/csv,*/*",
        Referer: "https://baseballsavant.mlb.com/"
      },
      redirect: "manual"
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc)
        throw new Error(`Redirect with no Location header from ${current}`);
      current = loc.startsWith("http") ? loc : new URL(loc, current).href;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
function nextUtcMidnightMs(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}
function __resetSavantStateForTests() {
  savantCache.clear();
  savantInFlight.clear();
  savantCooldownUntil = 0;
  savantFailureCooldownUntil = 0;
}
function savantCacheKey(url) {
  return url;
}
function parseSavantRetryAfterMs(response) {
  const value = response?.headers?.get?.("Retry-After");
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return Math.max(1e3, Math.min(12e4, seconds * 1e3));
  return SAVANT_COOLDOWN_MS;
}
function staleSavant(entry) {
  return entry && entry.staleExpiresAt > Date.now() ? entry : null;
}
function serveStaleSavant(res, stale) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  res.setHeader("X-Provider-Cache", "STALE");
  res.setHeader("X-Provider-Freshness", "stale-cached");
  return res.status(200).json(stale.data);
}
async function warmSavantCache(year = "2026") {
  const endpoints = ["expected_statistics", "statcast_leaderboard"];
  for (const endpoint of endpoints) {
    const response = {
      headers: {},
      status() {
        return response;
      },
      setHeader(name, value) {
        response.headers[name] = value;
        return response;
      },
      json(value) {
        response.body = value;
        return response;
      }
    };
    await handler3({ method: "GET", query: { endpoint, year }, headers: {}, socket: { remoteAddress: "nightly-refresh" } }, response);
  }
}
async function handler3(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const { endpoint, year, playerId, team } = req.query ?? {};
  const y = String(year || "2026");
  if (!endpoint || !ENDPOINTS[endpoint]) {
    return res.status(400).json({
      error: "Invalid endpoint",
      valid: Object.keys(ENDPOINTS),
      example: "/api/savant?endpoint=expected_statistics&year=2025"
    });
  }
  if ((endpoint === "contact_points" || endpoint === "pitcher_pitches") && !/^\d+$/.test(String(playerId || ""))) {
    return res.status(400).json({ error: `${endpoint} requires a numeric playerId query param` });
  }
  if (endpoint === "team_exit_velocity" && !/^[A-Za-z0-9]{2,5}$/.test(String(team || ""))) {
    return res.status(400).json({ error: "team_exit_velocity requires an MLB team abbreviation" });
  }
  if (["team_batted_balls", "team_batted_balls_against"].includes(endpoint) && !/^[A-Za-z]{2,3}$/.test(String(team || ""))) {
    return res.status(400).json({ error: `${endpoint} requires an MLB team abbreviation` });
  }
  if (isFailureInjectionRequested(req)) {
    const authorization = authorizeProviderFailureHook(req.headers);
    if (!authorization.allowed) {
      return res.status(403).json({ error: "Staging failure hook is not authorized" });
    }
    return failureInjectionResponse(res);
  }
  const url = ENDPOINTS[endpoint](y, { playerId, team });
  const key = savantCacheKey(url);
  const cached = savantCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader("X-Provider-Cache", "HIT");
    res.setHeader("X-Provider-Freshness", "cached");
    return res.status(200).json(cached.data);
  }
  const stale = staleSavant(cached);
  const existing = savantInFlight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=86400, stale-while-revalidate=604800"
      );
      res.setHeader("X-Provider-Cache", "COALESCED");
      res.setHeader("X-Provider-Freshness", "live");
      return res.status(200).json(data);
    } catch (error) {
      if (stale) return serveStaleSavant(res, stale);
      if (error?.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(error?.status || 502).json(error?.payload || { error: "Savant request failed" });
    }
  }
  if (savantCooldownUntil > Date.now()) {
    if (stale) return serveStaleSavant(res, stale);
    const retryAfter = Math.ceil((savantCooldownUntil - Date.now()) / 1e3);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Baseball Savant rate limit cooldown active",
      retryAfter,
      url
    });
  }
  if (savantFailureCooldownUntil > Date.now()) {
    if (stale) return serveStaleSavant(res, stale);
    const retryAfter = Math.ceil(
      (savantFailureCooldownUntil - Date.now()) / 1e3
    );
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(503).json({
      error: "Baseball Savant temporary upstream cooldown active",
      retryAfter,
      url
    });
  }
  if (isRateLimited(req, "savant")) return rateLimitResponse(res);
  const upstreamRequest = (async () => {
    const upstream = await fetchWithRedirects(url);
    if (!upstream.ok) {
      const retryAfter = parseSavantRetryAfterMs(upstream);
      if (upstream.status === 429)
        savantCooldownUntil = Math.max(
          savantCooldownUntil,
          Date.now() + retryAfter
        );
      throw {
        status: upstream.status,
        retryAfter: Math.ceil(retryAfter / 1e3),
        payload: { error: `Savant returned ${upstream.status}`, url }
      };
    }
    const body = await upstream.text();
    const trimmed = body.trim();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      throw {
        status: 502,
        payload: {
          error: "Savant returned HTML \u2014 endpoint may be unavailable for this year",
          year: y,
          url
        }
      };
    }
    let data = csvToJson(trimmed);
    if (endpoint === "contact_points") {
      data = data.filter(
        (r) => r.intercept_ball_minus_batter_pos_x_inches != null && r.intercept_ball_minus_batter_pos_y_inches != null
      );
    }
    if (endpoint === "team_exit_velocity") {
      data = data.filter(
        (r) => r.launch_speed != null && Number.isFinite(Number(r.launch_speed))
      ).map((r) => ({
        launch_speed: Number(r.launch_speed),
        launch_angle: r.launch_angle == null ? null : Number(r.launch_angle),
        launch_speed_angle: r.launch_speed_angle == null ? null : Number(r.launch_speed_angle),
        bb_type: r.bb_type || null,
        events: r.events || null,
        game_date: r.game_date || null
      })).slice(0, 5e4);
    }
    if (endpoint === "team_batted_balls" || endpoint === "team_batted_balls_against") {
      data = data.filter((r) => r.hc_x != null && r.hc_y != null).map((r) => ({
        hc_x: Number(r.hc_x),
        hc_y: Number(r.hc_y),
        bb_type: r.bb_type || null,
        launch_speed: r.launch_speed == null ? null : Number(r.launch_speed),
        launch_angle: r.launch_angle == null ? null : Number(r.launch_angle),
        launch_speed_angle: r.launch_speed_angle == null ? null : Number(r.launch_speed_angle),
        xwoba: r.estimated_woba_using_speedangle == null ? null : Number(r.estimated_woba_using_speedangle),
        events: r.events || null
      })).filter((r) => Number.isFinite(r.hc_x) && Number.isFinite(r.hc_y)).slice(0, 5e4);
    }
    if (endpoint === "pitcher_pitches") {
      data = data.filter((r) => r.pitch_type != null).map((r) => ({
        pitch_type: r.pitch_type,
        release_speed: r.release_speed,
        stand: r.stand
      }));
    }
    return data;
  })();
  savantInFlight.set(key, upstreamRequest);
  try {
    const data = await upstreamRequest;
    savantFailureCooldownUntil = 0;
    savantCache.set(key, {
      data,
      expiresAt: nextUtcMidnightMs(),
      staleExpiresAt: nextUtcMidnightMs() + SAVANT_STALE_TTL_MS
    });
    if (savantCache.size > 300)
      savantCache.delete(savantCache.keys().next().value);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader("X-Provider-Cache", "MISS");
    res.setHeader("X-Provider-Freshness", "live");
    return res.status(200).json(data);
  } catch (error) {
    const status = error?.status || 502;
    if (status >= 500)
      savantFailureCooldownUntil = Math.max(
        savantFailureCooldownUntil,
        Date.now() + SAVANT_FAILURE_COOLDOWN_MS
      );
    if (stale) return serveStaleSavant(res, stale);
    if (error?.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    console.error(
      "[savant-proxy] error:",
      error?.payload?.error || error?.message || error
    );
    return res.status(error?.status || 502).json(error?.payload || { error: "Savant request failed", url });
  } finally {
    if (savantInFlight.get(key) === upstreamRequest) savantInFlight.delete(key);
  }
}
var ENDPOINTS, SAVANT_CACHE_TTL_MS, SAVANT_STALE_TTL_MS, SAVANT_COOLDOWN_MS, SAVANT_FAILURE_COOLDOWN_MS, savantCache, savantInFlight, savantCooldownUntil, savantFailureCooldownUntil;
var init_savant = __esm({
  "server/api/savant.js"() {
    "use strict";
    init_shared();
    init_provider_failure_hook();
    ENDPOINTS = {
      expected_statistics: (y) => `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${y}&position=&team=&min=1&csv=true`,
      statcast_leaderboard: (y) => `https://baseballsavant.mlb.com/statcast_leaderboard?year=${y}&abs=0&player_type=batter&min_pa=1&csv=true`,
      "bat-tracking": (y) => `https://baseballsavant.mlb.com/leaderboard/bat-tracking?attackZone=&batSide=&contactType=&count=&csv=true&handedness=&minSwings=1&minGroupSwings=1&pitchType=&seasonStart=${y}&seasonEnd=${y}&team=&type=batter`,
      sprint_speed: (y) => `https://baseballsavant.mlb.com/sprint_speed_leaderboard?year=${y}&position=&team=&min=0&csv=true`,
      oaa: (y) => `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Batter&year=${y}&team=&range=year&min=1&pos=&roles=&viz=Show&csv=true`,
      pitch_arsenal: (y) => `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&pitchType=&year=${y}&team=&min=1&csv=true`,
      // No `year=${y}` here — see the comment block above this object for why.
      // `y` is still accepted (mlb.js's season/season-1 retry calls this with
      // both) so that retry logic doesn't need special-casing for one endpoint;
      // it's just unused inside the URL itself.
      batting_stance: (_y) => `https://baseballsavant.mlb.com/visuals/batting-stance?csv=true`,
      // Full calendar-year bound rather than trying to track the real season
      // window server-side — Savant just returns whatever games actually fall
      // in range, so an end date past "today" or before the season starts is
      // harmless, not an error. See the comment block above this object for
      // how this differs from — and resolves the blocker noted by —
      // `batting_stance` above.
      contact_points: (y, { playerId } = {}) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=&hfSit=&player_type=batter&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&batters_lookup%5B%5D=${playerId}&team=&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
      // pitcher_pitches — the pitcher-side mirror of contact_points above.
      // Confirmed 2026-08-08 the same way contact_points was: checked
      // pybaseball's actual `statcast_pitcher()` source (jldbc/pybaseball,
      // statcast_pitcher.py) rather than guessing. It's a byte-for-byte match
      // to the batter URL above except `player_type=batter`→`player_type=
      // pitcher` and `batters_lookup%5B%5D=`→`pitchers_lookup%5B%5D=` — same
      // confidence level as contact_points had (URL confirmed against a real,
      // currently-live wrapper library's source, not inferred from a nav label
      // or a search snippet). Column names are the same raw per-pitch Statcast
      // Search schema contact_points already reads from (this app doesn't need
      // new column-name guesses for this one — `release_speed`, `stand`, and
      // `pitch_type` are all standard, long-stable Statcast field names, unlike
      // the newer bat-tracking/intercept-point fields elsewhere in this file
      // that needed independent verification).
      pitcher_pitches: (y, { playerId } = {}) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=&hfSit=&player_type=pitcher&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&pitchers_lookup%5B%5D=${playerId}&team=&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
      // Raw team-season batted-ball rows for a real exit-velocity distribution.
      // The client bins launch_speed locally; no proxy or seeded values are used.
      team_exit_velocity: (y, { team } = {}) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=${y}%7C&hfSit=&player_type=batter&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&batters_lookup%5B%5D=&team=${encodeURIComponent(team || "")}&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
      team_batted_balls: (y, { team } = {}) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=${y}%7C&hfSit=&player_type=batter&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&team=${encodeURIComponent(team || "")}&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
      team_batted_balls_against: (y, { team } = {}) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=${y}%7C&hfSit=&player_type=pitcher&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&team=${encodeURIComponent(team || "")}&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=h_launch_speed&sort_order=desc&min_abs=0&type=details&`
    };
    SAVANT_CACHE_TTL_MS = 24 * 60 * 6e4;
    SAVANT_STALE_TTL_MS = 7 * 24 * 60 * 6e4;
    SAVANT_COOLDOWN_MS = 3e4;
    SAVANT_FAILURE_COOLDOWN_MS = 15e3;
    savantCache = /* @__PURE__ */ new Map();
    savantInFlight = /* @__PURE__ */ new Map();
    savantCooldownUntil = 0;
    savantFailureCooldownUntil = 0;
  }
});

// server/api/feed.js
var feed_exports = {};
__export(feed_exports, {
  default: () => handler4
});
function stripHtml(html = "") {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s{3,}/g, "  ").trim();
}
function parseRss(xml, handle) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const re = new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`
      );
      const m = re.exec(block);
      return m ? (m[1] ?? m[2] ?? "").trim() : "";
    };
    const title = stripHtml(get("title"));
    const link = get("link") || get("guid");
    const pubDate = get("pubDate");
    const desc = stripHtml(get("description"));
    const text2 = desc.length > title.length ? desc : title;
    if (!text2 || !link) continue;
    const isoDate = pubDate ? new Date(pubDate).toISOString() : null;
    const id = link.split("/").filter(Boolean).pop() || `${Date.now()}_${items.length}`;
    items.push({ id, handle, text: text2, url: link, isoDate });
  }
  return items;
}
async function tryFetch(handle, host) {
  const res = await fetch(`${host}/${handle}/rss`, {
    headers: {
      "User-Agent": "SKIP-Baseball/1.0 (RSS aggregator; contact via project repo)"
    },
    signal: AbortSignal.timeout(FETCH_MS)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
  const xml = await res.text();
  if (!xml.includes("<channel>"))
    throw new Error(`Non-RSS response from ${host}`);
  return xml;
}
async function handler4(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "feed")) return rateLimitResponse(res);
  const { handle, n = "10" } = req.query ?? {};
  if (!handle || !/^[A-Za-z0-9_]{1,50}$/.test(handle)) {
    return res.status(400).json({ error: "Missing or invalid handle", items: [] });
  }
  const limit = Math.min(25, Math.max(1, parseInt(n, 10) || 10));
  let xml = null;
  let lastErr = null;
  for (const host of NITTER_HOSTS) {
    try {
      xml = await tryFetch(handle, host);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!xml) {
    return res.status(200).json({
      handle,
      items: [],
      fetchedAt,
      error: "Feed unavailable",
      detail: lastErr?.message
    });
  }
  const items = parseRss(xml, handle).slice(0, limit);
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${CACHE_TTL_S}, stale-while-revalidate=${CACHE_SWR_S}`
  );
  return res.status(200).json({ handle, items, fetchedAt });
}
var NITTER_HOSTS, CACHE_TTL_S, CACHE_SWR_S, FETCH_MS;
var init_feed = __esm({
  "server/api/feed.js"() {
    "use strict";
    init_shared();
    NITTER_HOSTS = [
      "https://nitter.privacydev.net",
      "https://nitter.poast.org",
      "https://nitter.net",
      "https://nitter.1d4.us"
    ];
    CACHE_TTL_S = 5 * 60;
    CACHE_SWR_S = 2 * 60;
    FETCH_MS = 7e3;
  }
});

// server/api/news.js
var news_exports = {};
__export(news_exports, {
  __newsSourcesForTests: () => __newsSourcesForTests,
  __resetNewsStateForTests: () => __resetNewsStateForTests,
  default: () => handler5
});
function source(tier, key, label, url, kind) {
  return { tier, key, label, url, kind };
}
function teamSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9-]{2,32}$/.test(slug) ? slug : null;
}
function sourcesFor(kind, team, handle = null) {
  if (handle) {
    return [
      ...NITTER_HOSTS2.map(
        (host, index) => source(
          1,
          `nitter-${index + 1}`,
          `Nitter mirror ${index + 1}`,
          `${host}/${handle}/rss`,
          "social"
        )
      ),
      source(2, "espn-mlb", "ESPN MLB RSS", ESPN_MLB_RSS, "mlb"),
      source(3, "mlb-official", "MLB.com league feed", MLB_OFFICIAL_RSS, "mlb")
    ];
  }
  if (team) {
    return [
      source(
        1,
        "mlb-team-official",
        `MLB.com ${team} club feed`,
        `https://www.mlb.com/${team}/feeds/news/rss.xml`,
        "team"
      ),
      source(2, "mlb-official", "MLB.com league feed", MLB_OFFICIAL_RSS, "mlb"),
      source(3, "espn-mlb", "ESPN MLB RSS", ESPN_MLB_RSS, "mlb")
    ];
  }
  if (kind === "college") {
    return [
      source(
        1,
        "ncaa-d1-official",
        "NCAA Division I Baseball RSS",
        NCAA_D1_RSS,
        "college"
      ),
      source(
        2,
        "espn-college",
        "ESPN college sports RSS",
        ESPN_COLLEGE_RSS,
        "college"
      ),
      source(3, "fox-mlb", "FOX Sports MLB RSS", FOX_MLB_RSS, "college")
    ];
  }
  return [
    source(1, "mlb-official", "MLB.com league feed", MLB_OFFICIAL_RSS, "mlb"),
    source(2, "espn-mlb", "ESPN MLB RSS", ESPN_MLB_RSS, "mlb"),
    source(3, "fox-mlb", "FOX Sports MLB RSS", FOX_MLB_RSS, "mlb")
  ];
}
function stripHtml2(value = "") {
  return String(value).replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&nbsp;/gi, " ").replace(/\s{3,}/g, "  ").trim();
}
function tagValue(block, tags) {
  for (const tag of tags) {
    const pattern = new RegExp(
      `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`,
      "i"
    );
    const match = pattern.exec(block);
    const value = match?.[1] ?? match?.[2];
    if (value) return value.trim();
  }
  return "";
}
function parseDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function parseFeed(xml, feedSource, limit) {
  const blocks = [
    ...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi)
  ].map((match) => match[0]);
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  for (const block of blocks) {
    const title = stripHtml2(tagValue(block, ["title"]));
    const rawLink = tagValue(block, ["link", "guid", "id"]);
    const linkMatch = rawLink.match(/https?:\/\/[^\s<]+/i);
    const url = linkMatch?.[0] || rawLink;
    const summary = stripHtml2(
      tagValue(block, ["description", "summary", "content:encoded", "content"])
    );
    const text2 = summary && summary.length > title.length ? summary : title;
    if (!text2 || !url) continue;
    const id = `${feedSource.key}:${url}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      handle: feedSource.key,
      sourceKey: feedSource.key,
      sourceLabel: feedSource.label,
      sourceTier: feedSource.tier,
      text: text2,
      title: title || text2,
      url,
      isoDate: parseDate(
        tagValue(block, ["pubDate", "dc:date", "published", "updated"])
      )
    });
    if (items.length >= limit) break;
  }
  return items;
}
function cacheKey(kind, team, limit) {
  return `${kind}:${team || "league"}:${limit}`;
}
function ageSeconds(retrievedAt) {
  return Math.max(0, Math.round((Date.now() - retrievedAt) / 1e3));
}
function cachePayload(entry, status, reason = null) {
  return {
    handle: entry.handle || entry.kind,
    items: entry.items,
    fetchedAt: new Date(entry.retrievedAt).toISOString(),
    retrievedAt: entry.retrievedAt,
    ageSeconds: ageSeconds(entry.retrievedAt),
    status,
    freshness: status === "cached-fallback" ? "stale-cached" : "cached",
    tier: entry.tier,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    sources: entry.sources,
    sourceStatuses: entry.sourceStatuses,
    reason
  };
}
function setCache(key, entry) {
  cache.set(key, entry);
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}
function retryAfterMs(response) {
  const value = response?.headers?.get?.("Retry-After");
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(6e4, seconds * 1e3)) : 0;
}
async function readSource(feedSource, limit) {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(feedSource.url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
        "User-Agent": "SKIP-Baseball/1.0 (news aggregator; source-linked)"
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
  } catch (error) {
    return {
      ok: false,
      source: feedSource,
      reason: error?.name === "TimeoutError" ? "timeout" : "network-error",
      durationMs: Date.now() - startedAt
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      source: feedSource,
      statusCode: response.status,
      retryAfterMs: retryAfterMs(response),
      reason: response.status === 429 ? "rate-limited" : `http-${response.status}`,
      durationMs: Date.now() - startedAt
    };
  }
  let xml;
  try {
    xml = await response.text();
  } catch {
    return {
      ok: false,
      source: feedSource,
      reason: "body-read-failed",
      durationMs: Date.now() - startedAt
    };
  }
  const items = parseFeed(xml, feedSource, limit);
  if (!items.length) {
    return {
      ok: false,
      source: feedSource,
      reason: "empty-or-unparseable",
      durationMs: Date.now() - startedAt
    };
  }
  return {
    ok: true,
    source: feedSource,
    items,
    durationMs: Date.now() - startedAt
  };
}
function attemptMeta(result) {
  return {
    tier: result.source.tier,
    key: result.source.key,
    label: result.source.label,
    url: result.source.url,
    ok: result.ok,
    statusCode: result.statusCode ?? 200,
    reason: result.reason ?? null,
    durationMs: result.durationMs
  };
}
function completeSourceStatuses(configuredSources, attempts) {
  return configuredSources.map(
    (feedSource) => attempts.find((attempt) => attempt.key === feedSource.key) || {
      tier: feedSource.tier,
      key: feedSource.key,
      label: feedSource.label,
      url: feedSource.url,
      ok: null,
      statusCode: null,
      reason: "standby",
      durationMs: 0
    }
  );
}
function __resetNewsStateForTests() {
  cache.clear();
  inFlight.clear();
}
function __newsSourcesForTests(kind = "mlb", team = null) {
  return sourcesFor(kind, team);
}
async function handler5(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "news")) return rateLimitResponse(res);
  const url = new URL(req.url, "https://skipbaseball.invalid");
  const kind = url.searchParams.get("kind") === "college" ? "college" : "mlb";
  const rawTeam = url.searchParams.get("team");
  const team = teamSlug(rawTeam);
  const rawHandle = url.searchParams.get("handle");
  if (rawTeam && !team)
    return res.status(400).json({ error: "Invalid team slug", items: [] });
  if (rawHandle && !/^[A-Za-z0-9_]{1,50}$/.test(rawHandle))
    return res.status(400).json({ error: "Invalid handle", items: [] });
  const handle = rawHandle || null;
  const limit = Math.min(
    MAX_ITEMS,
    Math.max(1, Number.parseInt(url.searchParams.get("n") || "12", 10) || 12)
  );
  const key = cacheKey(
    handle ? `handle:${handle}` : team ? "team" : kind,
    team || handle,
    limit
  );
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.freshUntil > now) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=3600"
    );
    res.setHeader("X-News-Cache", "HIT");
    return res.status(200).json(cachePayload(hit, "cached"));
  }
  const pending = inFlight.get(key);
  if (pending) return pending.then((payload) => res.status(200).json(payload));
  const request = (async () => {
    const attempts = [];
    let successful = null;
    const configuredSources = sourcesFor(kind, team, handle);
    for (const feedSource of configuredSources) {
      const result = await readSource(feedSource, limit);
      attempts.push(attemptMeta(result));
      if (result.ok) {
        successful = result;
        break;
      }
    }
    const sourceStatuses = completeSourceStatuses(configuredSources, attempts);
    if (successful) {
      const retrievedAt = Date.now();
      const entry = {
        kind: handle ? `handle:${handle}` : team ? "team" : kind,
        team,
        handle,
        items: successful.items,
        retrievedAt,
        freshUntil: retrievedAt + FRESH_TTL_MS,
        staleUntil: retrievedAt + STALE_TTL_MS,
        tier: successful.source.tier,
        source: successful.source.label,
        sourceUrl: successful.source.url,
        sources: configuredSources,
        sourceStatuses
      };
      setCache(key, entry);
      return {
        handle: entry.handle || entry.kind,
        items: entry.items,
        fetchedAt: new Date(retrievedAt).toISOString(),
        retrievedAt,
        ageSeconds: 0,
        status: entry.tier === 1 ? "tier-1" : entry.tier === 2 ? "tier-2" : "tier-3",
        freshness: "live",
        tier: entry.tier,
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        sourceStatuses,
        sources: configuredSources,
        attempts
      };
    }
    if (hit && hit.staleUntil > now) {
      return {
        ...cachePayload(
          hit,
          "cached-fallback",
          attempts.at(-1)?.reason || "all-sources-unavailable"
        ),
        sourceStatuses,
        sources: configuredSources,
        attempts
      };
    }
    return {
      handle: handle || team || kind,
      items: [],
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      retrievedAt: null,
      ageSeconds: null,
      status: "unavailable",
      freshness: "unavailable",
      tier: null,
      source: null,
      sourceUrl: null,
      sourceStatuses,
      sources: configuredSources,
      attempts,
      error: "All configured news sources are unavailable"
    };
  })();
  inFlight.set(key, request);
  try {
    const payload = await request;
    res.setHeader(
      "Cache-Control",
      payload.status === "unavailable" ? "no-store" : "public, s-maxage=900, stale-while-revalidate=3600"
    );
    res.setHeader(
      "X-News-Cache",
      payload.status === "cached-fallback" ? "STALE" : payload.status === "unavailable" ? "MISS" : "MISS"
    );
    return res.status(200).json(payload);
  } finally {
    inFlight.delete(key);
  }
}
var FRESH_TTL_MS, STALE_TTL_MS, FETCH_TIMEOUT_MS, MAX_ITEMS, MAX_CACHE_ENTRIES, MLB_OFFICIAL_RSS, ESPN_MLB_RSS, FOX_MLB_RSS, NCAA_D1_RSS, ESPN_COLLEGE_RSS, NITTER_HOSTS2, cache, inFlight;
var init_news = __esm({
  "server/api/news.js"() {
    "use strict";
    init_shared();
    FRESH_TTL_MS = 15 * 6e4;
    STALE_TTL_MS = 24 * 60 * 6e4;
    FETCH_TIMEOUT_MS = 8e3;
    MAX_ITEMS = 25;
    MAX_CACHE_ENTRIES = 100;
    MLB_OFFICIAL_RSS = "https://www.mlb.com/feeds/news/rss.xml";
    ESPN_MLB_RSS = "https://www.espn.com/espn/rss/mlb/news";
    FOX_MLB_RSS = "https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/mlb";
    NCAA_D1_RSS = "https://www.ncaa.com/news/baseball/d1/rss.xml";
    ESPN_COLLEGE_RSS = "https://www.espn.com/espn/rss/ncb/news";
    NITTER_HOSTS2 = [
      "https://nitter.privacydev.net",
      "https://nitter.poast.org",
      "https://nitter.net",
      "https://nitter.1d4.us"
    ];
    cache = /* @__PURE__ */ new Map();
    inFlight = /* @__PURE__ */ new Map();
  }
});

// server/api/daily-provider-policy.js
function utcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
function nextUtcMidnightMs2(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}
function hasAttemptedProviderToday(lastAttemptDay, now = Date.now()) {
  return lastAttemptDay === utcDayKey(now);
}
var init_daily_provider_policy = __esm({
  "server/api/daily-provider-policy.js"() {
    "use strict";
  }
});

// server/api/contract.js
var contract_exports = {};
__export(contract_exports, {
  __resetBRefContractStateForTests: () => __resetBRefContractStateForTests,
  default: () => handler6,
  hasVerifiedContractData: () => hasVerifiedContractData,
  isAcceptableMatch: () => isAcceptableMatch,
  normalizeName: () => normalizeName,
  parseBRefTable: () => parseBRefTable,
  parseSpotracTable: () => parseSpotracTable
});
function normalizeName(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['\u2018\u2019`.,-]/g, "").replace(/\s+/g, " ").trim();
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
function isAcceptableMatch(target, candidate, dist) {
  if (!target || !candidate) return false;
  const maxLen = Math.max(target.length, candidate.length);
  const cap = Math.min(3, Math.max(1, Math.floor(maxLen * 0.12)));
  return dist <= cap;
}
function parseDollar(s) {
  if (!s) return null;
  const clean2 = s.replace(/[$,\s]/g, "");
  if (/[Mm]$/.test(clean2)) return Math.round(parseFloat(clean2) * 1e6);
  if (/[Kk]$/.test(clean2)) return Math.round(parseFloat(clean2) * 1e3);
  const n = parseFloat(clean2);
  return isNaN(n) ? null : n;
}
function fmtExpiry(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\d{4}/);
  return m ? m[0] : null;
}
function parseServiceTime(raw) {
  if (!raw) return null;
  const [y = "0", d = "0"] = String(raw).split(".");
  const days = parseInt(y, 10) * 172 + parseInt(d, 10);
  const yrs = days / 172;
  if (yrs >= 6) return "Free Agent Eligible";
  if (yrs >= 3) return "Arbitration Eligible";
  return "Pre-Arbitration";
}
function deriveStatus(expiry, svcStatus) {
  if (!expiry) return svcStatus || "Unknown";
  const yr = parseInt(expiry, 10);
  const cur = (/* @__PURE__ */ new Date()).getFullYear();
  if (isNaN(yr)) return svcStatus || "Unknown";
  if (yr < cur) return "Expired";
  return "Under Contract";
}
function hasVerifiedContractData(scraped, mlbData) {
  const scrapedFields = scraped && [
    scraped.salary,
    scraped.aav,
    scraped.total,
    scraped.years,
    scraped.expiry
  ];
  const mlbFields = mlbData && [
    mlbData.mlbSalary,
    mlbData.mlbAav,
    mlbData.mlbYears,
    mlbData.mlbExpiry
  ];
  return Boolean(
    scrapedFields && scrapedFields.some((value) => value != null) || mlbFields && mlbFields.some((value) => value != null)
  );
}
function stripTags(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/gi, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
async function fetchHtml(url, timeoutMs = 1e4) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: new URL(url).origin + "/"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}
async function fetchBRefOnceDaily(playerName) {
  const key = normalizeName(playerName);
  const now = Date.now();
  const day = utcDayKey(now);
  const cached = brefDailyCache.get(key);
  if (cached?.day === day) return cached.data;
  const existing = brefDailyInFlight.get(key);
  if (existing) return existing;
  if (hasAttemptedProviderToday(brefDailyAttemptDay.get(key), now)) return null;
  brefDailyAttemptDay.set(key, day);
  const request = (async () => {
    let data = null;
    try {
      const brefHtml = await fetchHtml(BREF_CONTRACTS_URL, 12e3);
      data = parseBRefTable(brefHtml, playerName);
    } catch {
    }
    brefDailyCache.set(key, { day, data });
    return data;
  })();
  brefDailyInFlight.set(key, request);
  try {
    return await request;
  } finally {
    brefDailyInFlight.delete(key);
  }
}
function __resetBRefContractStateForTests() {
  brefDailyAttemptDay.clear();
  brefDailyCache.clear();
  brefDailyInFlight.clear();
}
function parseSpotracTable(html, playerName) {
  const normTarget = normalizeName(playerName);
  const tableMatch = html.match(
    /<table[^>]*id=["']table["'][^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return null;
  const tableHtml = tableMatch[1];
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return null;
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let best = null, bestDist = Infinity;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHtml = rowMatch[1];
    const thMatch = rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => stripTags(m[1])
    );
    if (thMatch) tds.unshift(stripTags(thMatch[1]));
    if (tds.length < 4) continue;
    const candidate = normalizeName(tds[1] || "");
    if (!candidate || candidate.length < 2) continue;
    const dist = levenshtein(normTarget, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = tds;
      bestCandidate = candidate;
    }
  }
  if (!best || !isAcceptableMatch(normTarget, bestCandidate, bestDist)) return null;
  const expiry = fmtExpiry(best[7]);
  return {
    found: true,
    source: "Spotrac",
    player: best[1] || playerName,
    team: best[2] || null,
    years: parseInt(best[4], 10) || null,
    total: parseDollar(best[5]),
    aav: parseDollar(best[6]),
    salary: null,
    // current-year salary not on this page; AAV used as proxy
    expiry
  };
}
function parseBRefTable(html, playerName) {
  const normTarget = normalizeName(playerName);
  const tableMatch = html.match(
    /<table[^>]*id=["']largest_contracts["'][^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return null;
  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return null;
  const getStat = (rowHtml2, stat) => {
    const m = rowHtml2.match(
      new RegExp(
        `<td[^>]*data-stat=["']${stat}["'][^>]*>([\\s\\S]*?)<\\/td>`,
        "i"
      )
    );
    return m ? stripTags(m[1]) : "";
  };
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let best = null, bestDist = Infinity;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHtml2 = rowMatch[1];
    const playerCell = getStat(rowHtml2, "player");
    if (!playerCell || playerCell.length < 2) continue;
    const dist = levenshtein(normTarget, normalizeName(playerCell));
    if (dist < bestDist) {
      bestDist = dist;
      best = { rowHtml: rowHtml2, name: playerCell, normalizedName: normalizeName(playerCell) };
    }
  }
  if (!best || !isAcceptableMatch(normTarget, best.normalizedName, bestDist)) return null;
  const { rowHtml, name } = best;
  const salary = parseDollar(
    getStat(rowHtml, "salary") || getStat(rowHtml, "annual_salary")
  );
  const total = parseDollar(
    getStat(rowHtml, "total_salary") || getStat(rowHtml, "contract_length_salary")
  );
  const aav = parseDollar(
    getStat(rowHtml, "avg_annual_value") || getStat(rowHtml, "aav") || getStat(rowHtml, "salary_per_year")
  );
  const yearsRaw = getStat(rowHtml, "years") || getStat(rowHtml, "contract_length");
  const years = parseInt(yearsRaw, 10) || null;
  const expiryRaw = getStat(rowHtml, "year_end") || getStat(rowHtml, "end_year");
  const expiry = fmtExpiry(expiryRaw);
  const team = getStat(rowHtml, "team_ID") || getStat(rowHtml, "team_name") || null;
  if (!name) return null;
  return {
    found: true,
    source: "Baseball-Reference",
    player: name,
    team,
    years,
    total: total || null,
    aav: aav || salary || null,
    salary: salary || null,
    expiry
  };
}
async function fetchMLBData(mlbId) {
  try {
    const res = await fetch(
      `${MLB_BASE2}/people/${mlbId}?hydrate=currentTeam,contracts`,
      {
        headers: {
          "User-Agent": "SKIPBaseball/1.0",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(6e3)
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const person = data.people?.[0];
    if (!person) return null;
    const contracts = Array.isArray(person.contracts) ? person.contracts : [];
    const active = contracts.find((c) => c.active) || contracts[0] || null;
    return {
      serviceTime: person.serviceTime || null,
      serviceStatus: parseServiceTime(person.serviceTime),
      debutDate: person.mlbDebutDate || null,
      mlbSalary: active?.salary || null,
      mlbAav: active?.annualAvgValue || null,
      mlbYears: active?.years || null,
      mlbExpiry: fmtExpiry(active?.endDate)
    };
  } catch {
    return null;
  }
}
async function handler6(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "contract")) return rateLimitResponse(res);
  const urlObj = new URL(req.url, "https://placeholder.invalid");
  const name = (urlObj.searchParams.get("name") || "").trim();
  const mlbId = (urlObj.searchParams.get("id") || "").trim();
  if (!name || name.length < 2) {
    return res.status(400).json({ error: "Missing required param: name" });
  }
  const [spotracResult, mlbData] = await Promise.all([
    (async () => {
      try {
        const html = await fetchHtml(SPOTRAC_CONTRACTS_URL);
        return parseSpotracTable(html, name);
      } catch {
        return null;
      }
    })(),
    mlbId ? fetchMLBData(mlbId) : Promise.resolve(null)
  ]);
  let scraped = spotracResult;
  if (!scraped) {
    scraped = await fetchBRefOnceDaily(name);
  }
  const svcStatus = mlbData?.serviceStatus || null;
  const expiry = scraped?.expiry || mlbData?.mlbExpiry || null;
  const contractAvailable = hasVerifiedContractData(scraped, mlbData);
  if (!scraped && !mlbData) {
    return res.status(200).json({ found: false });
  }
  const result = {
    found: true,
    contractAvailable,
    source: scraped?.source || "MLB Stats API",
    player: scraped?.player || name,
    team: scraped?.team || null,
    years: scraped?.years || mlbData?.mlbYears || null,
    total: scraped?.total || null,
    aav: scraped?.aav || mlbData?.mlbAav || null,
    salary: scraped?.salary || mlbData?.mlbSalary || null,
    expiry,
    status: deriveStatus(expiry, svcStatus),
    serviceTime: mlbData?.serviceTime || null,
    serviceStatus: svcStatus,
    debutDate: mlbData?.debutDate || null
  };
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=21600, stale-while-revalidate=3600"
  );
  return res.status(200).json(result);
}
var SPOTRAC_CONTRACTS_URL, BREF_CONTRACTS_URL, MLB_BASE2, brefDailyAttemptDay, brefDailyCache, brefDailyInFlight, UA;
var init_contract = __esm({
  "server/api/contract.js"() {
    "use strict";
    init_shared();
    init_daily_provider_policy();
    SPOTRAC_CONTRACTS_URL = "https://www.spotrac.com/mlb/contracts/";
    BREF_CONTRACTS_URL = "https://www.baseball-reference.com/leaders/leaders_contract.shtml";
    MLB_BASE2 = "https://statsapi.mlb.com/api/v1";
    brefDailyAttemptDay = /* @__PURE__ */ new Map();
    brefDailyCache = /* @__PURE__ */ new Map();
    brefDailyInFlight = /* @__PURE__ */ new Map();
    UA = process.env.USER_AGENT || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  }
});

// server/api/player-identity.js
var player_identity_exports = {};
__export(player_identity_exports, {
  __resetPlayerIdentityStateForTests: () => __resetPlayerIdentityStateForTests,
  buildBaseballReferencePlayerUrl: () => buildBaseballReferencePlayerUrl,
  default: () => handler7,
  extractBaseballReferenceId: () => extractBaseballReferenceId,
  getPlayerIdentityTelemetry: () => getPlayerIdentityTelemetry,
  isExactIdentityNameMatch: () => isExactIdentityNameMatch,
  normalizeIdentityName: () => normalizeIdentityName,
  parseBaseballReferencePlayerPageName: () => parseBaseballReferencePlayerPageName,
  parseBaseballReferenceSearchCandidates: () => parseBaseballReferenceSearchCandidates,
  resolvePlayerProviderIdentity: () => resolvePlayerProviderIdentity,
  selectExactBaseballReferenceCandidate: () => selectExactBaseballReferenceCandidate
});
function recordLatency(bucket, startedAtMs) {
  const entry = telemetryLatency[bucket];
  if (!entry) return;
  const durationMs = Math.max(0, Date.now() - Number(startedAtMs || Date.now()));
  entry.samples += 1;
  entry.totalMs += durationMs;
  entry.minMs = entry.minMs == null ? durationMs : Math.min(entry.minMs, durationMs);
  entry.maxMs = Math.max(entry.maxMs, durationMs);
}
function summarizeLatency(entry) {
  return {
    samples: entry.samples,
    totalMs: Math.round(entry.totalMs),
    averageMs: entry.samples ? Number((entry.totalMs / entry.samples).toFixed(1)) : null,
    minMs: entry.minMs == null ? null : Math.round(entry.minMs),
    maxMs: entry.samples ? Math.round(entry.maxMs) : null
  };
}
function recordTelemetry(key) {
  if (Object.prototype.hasOwnProperty.call(telemetryCounters, key)) telemetryCounters[key] += 1;
}
function percentage(numerator, denominator) {
  return denominator > 0 ? Number((100 * numerator / denominator).toFixed(1)) : null;
}
function getPlayerIdentityTelemetry() {
  const counters = { ...telemetryCounters };
  return {
    counters,
    directIdRequestRate: percentage(counters.directIdRequests, counters.resolverRequests),
    browserRegistryReuseRate: percentage(counters.browserRegistryReuses, counters.directIdRequests),
    serverRegistryHitRate: percentage(counters.serverRegistryHits, counters.resolverRequests),
    directCanonicalVerificationRate: percentage(counters.directCanonicalVerified, counters.directCanonicalRequests),
    nameSearchExactMatchRate: percentage(counters.nameSearchExactMatches, counters.nameSearchRequests),
    latencyMs: Object.fromEntries(Object.entries(telemetryLatency).map(([key, value]) => [key, summarizeLatency(value)]))
  };
}
function normalizeIdentityName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.'\u2018\u2019`,-]/g, "").replace(/\s+/g, " ").trim();
}
function isExactIdentityNameMatch(expectedName, candidateName) {
  const expected = normalizeIdentityName(expectedName);
  const candidate = normalizeIdentityName(candidateName);
  return Boolean(expected && candidate && expected === candidate);
}
function decodeHtml(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}
function stripTags2(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}
function extractBaseballReferenceId(value) {
  const pathname = String(value || "").split(/[?#]/, 1)[0];
  const match = pathname.match(/^\/players\/[a-z]\/([a-z][a-z0-9]{8})\.shtml$/i);
  return match ? match[1].toLowerCase() : null;
}
function buildBaseballReferencePlayerUrl(baseballReferenceId) {
  const id = String(baseballReferenceId || "").toLowerCase();
  if (!BREF_ID_PATTERN.test(id)) return null;
  return `${BREF_ORIGIN}/players/${id[0]}/${id}.shtml`;
}
function parseBaseballReferenceSearchCandidates(html) {
  const candidates = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(String(html || ""))) !== null) {
    const id = extractBaseballReferenceId(match[1]);
    const name = stripTags2(match[2]);
    if (!id || !name) continue;
    candidates.push({
      id,
      name,
      canonicalUrl: buildBaseballReferencePlayerUrl(id)
    });
  }
  return candidates;
}
function selectExactBaseballReferenceCandidate(candidates, expectedName) {
  return (Array.isArray(candidates) ? candidates : []).find(
    (candidate) => isExactIdentityNameMatch(expectedName, candidate?.name)
  ) || null;
}
function parseBaseballReferencePlayerPageName(html) {
  const source2 = String(html || "");
  const h1 = source2.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags2(h1[1]) || null;
  const title = source2.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) return null;
  return stripTags2(title[1]).replace(/\s+(?:Stats|Statistics|Career)\b.*$/i, "").trim() || null;
}
function buildIdentityRecord({ mlbId, expectedName, baseballReferenceId, matchedName, method }) {
  const canonicalUrl = buildBaseballReferencePlayerUrl(baseballReferenceId);
  if (!canonicalUrl) return null;
  const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    mlb: {
      id: String(mlbId),
      canonicalUrl: `https://www.mlb.com/player/${encodeURIComponent(String(mlbId))}`,
      confidence: "official-id",
      provenance: "MLB Stats API player identifier"
    },
    baseballReference: {
      id: baseballReferenceId,
      canonicalUrl,
      confidence: "exact-name",
      provenance: method === "direct-id" ? "Baseball-Reference canonical player page verified by exact normalized player name" : "Baseball-Reference search result verified by exact normalized player name",
      matchedName: matchedName || expectedName,
      verifiedAt
    }
  };
}
async function fetchHtml2(url, timeoutMs = 1e4) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA2,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Baseball-Reference responded ${response.status}`);
  return response.text();
}
function cachedIdentity(mlbId, expectedName) {
  const cached = identityRegistry.get(String(mlbId));
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) identityRegistry.delete(String(mlbId));
    return null;
  }
  if (!isExactIdentityNameMatch(expectedName, cached.expectedName)) return null;
  return cached.identity;
}
function storeIdentity(mlbId, expectedName, identity) {
  if (!identity?.baseballReference?.id) return;
  identityRegistry.set(String(mlbId), {
    expectedName,
    identity,
    expiresAt: Date.now() + RESOLVER_CACHE_TTL_MS
  });
}
async function resolveDirectBaseballReferenceIdentity({ mlbId, expectedName, baseballReferenceId }) {
  const startedAt = Date.now();
  const canonicalUrl = buildBaseballReferencePlayerUrl(baseballReferenceId);
  if (!canonicalUrl) return null;
  recordTelemetry("directCanonicalRequests");
  try {
    const html = await fetchHtml2(canonicalUrl, 1e4);
    const pageName = parseBaseballReferencePlayerPageName(html);
    if (!isExactIdentityNameMatch(expectedName, pageName)) {
      recordTelemetry("directCanonicalRejected");
      return null;
    }
    recordTelemetry("directCanonicalVerified");
    return buildIdentityRecord({
      mlbId,
      expectedName,
      baseballReferenceId,
      matchedName: pageName,
      method: "direct-id"
    });
  } catch (error) {
    recordTelemetry("directCanonicalErrors");
    throw error;
  } finally {
    recordLatency("directCanonical", startedAt);
  }
}
async function resolveSearchBaseballReferenceIdentity({ mlbId, expectedName }) {
  const startedAt = Date.now();
  recordTelemetry("nameSearchRequests");
  try {
    const url = `${BREF_SEARCH_URL}?search=${encodeURIComponent(expectedName)}`;
    const html = await fetchHtml2(url, 1e4);
    const candidate = selectExactBaseballReferenceCandidate(
      parseBaseballReferenceSearchCandidates(html),
      expectedName
    );
    if (!candidate) {
      recordTelemetry("nameSearchRejected");
      return null;
    }
    recordTelemetry("nameSearchExactMatches");
    return buildIdentityRecord({
      mlbId,
      expectedName,
      baseballReferenceId: candidate.id,
      matchedName: candidate.name,
      method: "exact-search"
    });
  } finally {
    recordLatency("nameSearch", startedAt);
  }
}
async function resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId } = {}) {
  const startedAt = Date.now();
  const normalizedMlbId = String(mlbId || "").trim();
  const expectedName = String(name || "").trim();
  if (!/^\d+$/.test(normalizedMlbId) || !expectedName || expectedName.length < 2) return null;
  recordTelemetry("resolverRequests");
  const normalizedBRefId = String(baseballReferenceId || "").toLowerCase();
  const hasDirectId = BREF_ID_PATTERN.test(normalizedBRefId);
  const cached = cachedIdentity(normalizedMlbId, expectedName);
  if (cached && (!hasDirectId || cached.baseballReference?.id === normalizedBRefId)) {
    recordTelemetry("serverRegistryHits");
    recordLatency("serverRegistryHit", startedAt);
    recordTelemetry("resolved");
    return cached;
  }
  const inFlightKey = `${normalizedMlbId}:${normalizeIdentityName(expectedName)}:${hasDirectId ? normalizedBRefId : "search"}`;
  const pending = identityInFlight.get(inFlightKey);
  if (pending) return pending;
  const request = (async () => {
    let identity = null;
    if (hasDirectId) {
      try {
        identity = await resolveDirectBaseballReferenceIdentity({
          mlbId: normalizedMlbId,
          expectedName,
          baseballReferenceId: normalizedBRefId
        });
      } catch {
      }
    }
    if (!identity && !hasDirectId) {
      try {
        identity = await resolveSearchBaseballReferenceIdentity({
          mlbId: normalizedMlbId,
          expectedName
        });
      } catch {
        identity = null;
      }
    }
    if (identity) {
      storeIdentity(normalizedMlbId, expectedName, identity);
      recordTelemetry("resolved");
    } else {
      recordTelemetry("unresolved");
    }
    return identity;
  })();
  identityInFlight.set(inFlightKey, request);
  try {
    return await request;
  } finally {
    identityInFlight.delete(inFlightKey);
  }
}
function __resetPlayerIdentityStateForTests() {
  identityRegistry.clear();
  identityInFlight.clear();
  Object.keys(telemetryCounters).forEach((key) => {
    telemetryCounters[key] = 0;
  });
  Object.values(telemetryLatency).forEach((entry) => {
    entry.samples = 0;
    entry.totalMs = 0;
    entry.minMs = null;
    entry.maxMs = 0;
  });
}
async function handler7(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const url = new URL(req.url, "https://placeholder.invalid");
  if (url.searchParams.get("mode") === "metrics") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ scope: "process", telemetry: getPlayerIdentityTelemetry() });
  }
  if (isRateLimited(req, "player-identity")) return rateLimitResponse(res);
  const mlbId = (url.searchParams.get("mlbId") || "").trim();
  const name = (url.searchParams.get("name") || "").trim();
  const baseballReferenceId = (url.searchParams.get("baseballReferenceId") || "").trim();
  if (!/^\d+$/.test(mlbId) || !name || name.length < 2) {
    return res.status(400).json({ error: "Valid mlbId and name parameters are required" });
  }
  const directRequest = BREF_ID_PATTERN.test(String(baseballReferenceId).toLowerCase());
  if (directRequest) {
    recordTelemetry("directIdRequests");
    if (url.searchParams.get("identitySource") === "registry") recordTelemetry("browserRegistryReuses");
  }
  const identity = await resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId });
  const result = {
    found: Boolean(identity),
    identity: identity || {
      mlb: {
        id: mlbId,
        canonicalUrl: `https://www.mlb.com/player/${encodeURIComponent(mlbId)}`,
        confidence: "official-id",
        provenance: "MLB Stats API player identifier"
      },
      baseballReference: null
    },
    invalidateBaseballReferenceId: directRequest && !identity
  };
  if (result.invalidateBaseballReferenceId) recordTelemetry("directIdInvalidations");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(result);
}
var BREF_ORIGIN, BREF_SEARCH_URL, BREF_ID_PATTERN, RESOLVER_CACHE_TTL_MS, identityRegistry, identityInFlight, telemetryCounters, telemetryLatency, UA2;
var init_player_identity = __esm({
  "server/api/player-identity.js"() {
    "use strict";
    init_shared();
    BREF_ORIGIN = "https://www.baseball-reference.com";
    BREF_SEARCH_URL = `${BREF_ORIGIN}/search/search.fcgi`;
    BREF_ID_PATTERN = /^[a-z][a-z0-9]{8}$/;
    RESOLVER_CACHE_TTL_MS = 7 * 24 * 60 * 6e4;
    identityRegistry = /* @__PURE__ */ new Map();
    identityInFlight = /* @__PURE__ */ new Map();
    telemetryCounters = {
      resolverRequests: 0,
      directIdRequests: 0,
      browserRegistryReuses: 0,
      serverRegistryHits: 0,
      directCanonicalRequests: 0,
      directCanonicalVerified: 0,
      directCanonicalRejected: 0,
      directCanonicalErrors: 0,
      nameSearchRequests: 0,
      nameSearchExactMatches: 0,
      nameSearchRejected: 0,
      resolved: 0,
      unresolved: 0,
      directIdInvalidations: 0
    };
    telemetryLatency = {
      directCanonical: { samples: 0, totalMs: 0, minMs: null, maxMs: 0 },
      nameSearch: { samples: 0, totalMs: 0, minMs: null, maxMs: 0 },
      serverRegistryHit: { samples: 0, totalMs: 0, minMs: null, maxMs: 0 }
    };
    UA2 = process.env.USER_AGENT || "Mozilla/5.0 (compatible; SKIPBaseball/1.0; +https://mlb-terminal.vercel.app)";
  }
});

// server/api/comparison-summary.js
var comparison_summary_exports = {};
__export(comparison_summary_exports, {
  default: () => comparisonSummary,
  fallbackSummary: () => fallbackSummary,
  hasValidComparisonPayload: () => hasValidComparisonPayload
});
function finitePercentile(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}
function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 180) : fallback;
}
function normalizePlayer(player) {
  if (!player || typeof player !== "object") return null;
  const name = cleanText(player.name).slice(0, MAX_NAME);
  const axes = Array.isArray(player.axes) ? player.axes.slice(0, MAX_AXES).map((axis) => ({
    axis: cleanText(axis?.axis, "Metric").slice(0, 40),
    pct: finitePercentile(axis?.pct),
    rawLabel: cleanText(axis?.rawLabel, "Unavailable").slice(0, 60)
  })).filter((axis) => axis.axis) : [];
  if (!name || !axes.length) return null;
  return {
    name,
    position: cleanText(player.position, "\u2014").slice(0, 30),
    playerType: player.playerType === "pitcher" ? "pitcher" : "hitter",
    axes
  };
}
function buildEdges(players) {
  const [first, second] = players;
  const firstByAxis = new Map(first.axes.map((axis) => [axis.axis, axis]));
  const secondByAxis = new Map(second.axes.map((axis) => [axis.axis, axis]));
  return Array.from(/* @__PURE__ */ new Set([...firstByAxis.keys(), ...secondByAxis.keys()])).map((axis) => {
    const a = firstByAxis.get(axis);
    const b = secondByAxis.get(axis);
    if (a?.pct == null || b?.pct == null)
      return { axis, leader: "Unavailable", margin: null };
    const margin = Math.round(Math.abs(a.pct - b.pct));
    return {
      axis,
      leader: margin === 0 ? "Even" : a.pct > b.pct ? first.name : second.name,
      margin
    };
  }).sort((a, b) => (b.margin ?? -1) - (a.margin ?? -1));
}
function fallbackSummary(players) {
  const edges = buildEdges(players);
  const [first, second] = players;
  const usable = edges.filter((edge) => edge.margin != null);
  const leader = usable[0]?.leader;
  const headline = leader && leader !== "Even" && leader !== "Unavailable" ? `${leader} owns the clearest percentile edge` : "The percentile profiles are closely matched";
  const summary = usable.length ? usable.slice(0, 3).map(
    (edge) => `${edge.axis}: ${edge.leader} by ${edge.margin} percentile points`
  ).join(" \xB7 ") : "The connected Savant profile does not contain enough shared percentile values for a directional comparison.";
  return {
    headline,
    summary: `${first.name} vs ${second.name}: ${summary}.`,
    recommendation: `${leader && leader !== "Even" && leader !== "Unavailable" ? leader : first.name} better suits teams prioritizing high-percentile contact quality and above-average bat speed, while the alternative fits low-whiff disciplined approaches.`,
    edges: usable.slice(0, 4),
    caveat: "This comparison uses only the connected 0\u2013100 Savant percentile axes; missing fields are not inferred.",
    generated: false
  };
}
function validRequest(body) {
  const players = Array.isArray(body?.players) ? body.players.slice(0, 2).map(normalizePlayer) : [];
  return players.length === 2 && players.every(Boolean) && players[0].playerType === players[1].playerType ? players : null;
}
function hasValidComparisonPayload(body) {
  return Boolean(validRequest(body));
}
async function comparisonSummary(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const players = validRequest(req.body);
  if (!players) {
    res.status(400).json({
      error: "Provide two same-type players with Savant percentile axes."
    });
    return;
  }
  const fallback = fallbackSummary(players);
  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content: "You are SKIP, a precise baseball intelligence analyst. Summarize only the supplied Savant percentile values. Never invent a statistic, season, scouting trait, injury, projection, or causal explanation. Treat 0\u2013100 as percentile rank, where higher is better. If a value is unavailable, say unavailable. Keep the response concise and decision-useful."
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: "Compare the two same-type players. Identify the largest percentile edges, state when the profiles are close, and include a short caveat about the data scope.",
            players
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "skip_player_comparison_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              headline: { type: "string" },
              summary: { type: "string" },
              recommendation: { type: "string" },
              edges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    axis: { type: "string" },
                    leader: { type: "string" },
                    margin: { type: ["number", "null"] },
                    note: { type: "string" }
                  },
                  required: ["axis", "leader", "margin", "note"],
                  additionalProperties: false
                }
              },
              caveat: { type: "string" }
            },
            required: [
              "headline",
              "summary",
              "recommendation",
              "edges",
              "caveat"
            ],
            additionalProperties: false
          }
        }
      }
    });
    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!parsed || typeof parsed.headline !== "string" || typeof parsed.summary !== "string")
      throw new Error("Invalid summary response");
    res.json({
      headline: parsed.headline.slice(0, 180),
      summary: parsed.summary.slice(0, 500),
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation.slice(0, 300) : fallback.recommendation,
      edges: Array.isArray(parsed.edges) ? parsed.edges.slice(0, 4) : fallback.edges,
      caveat: typeof parsed.caveat === "string" ? parsed.caveat.slice(0, 240) : fallback.caveat,
      generated: true
    });
  } catch (error) {
    console.warn(
      "[comparison-summary] AI summary unavailable; returning deterministic percentile summary",
      error?.message || error
    );
    res.json({
      ...fallback,
      generated: false,
      unavailableReason: "AI summary unavailable"
    });
  }
}
var MAX_AXES, MAX_NAME;
var init_comparison_summary = __esm({
  "server/api/comparison-summary.js"() {
    "use strict";
    init_llm();
    MAX_AXES = 8;
    MAX_NAME = 80;
  }
});

// server/api/natural-search.js
var natural_search_exports = {};
__export(natural_search_exports, {
  clearNaturalSearchCache: () => clearNaturalSearchCache,
  default: () => naturalSearch
});
function clean(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizeResult(value, fallbackQuery) {
  const intent = VALID_INTENTS.has(value?.intent) ? value.intent : "unknown";
  const tab = VALID_TABS.has(value?.tab) ? value.tab : null;
  const entity = clean(value?.entity, 100) || null;
  const metric = clean(value?.metric, 50) || null;
  const interpretation = clean(value?.interpretation, 220) || `No verified destination was identified for \u201C${fallbackQuery}\u201D.`;
  return {
    intent,
    tab,
    entity,
    metric,
    interpretation,
    generated: Boolean(value?.generated)
  };
}
function fallbackResult(query) {
  return normalizeResult(
    {
      intent: "unknown",
      tab: null,
      entity: null,
      metric: null,
      interpretation: "AI search is unavailable. Use a player name, team name, or a page name and try again.",
      generated: false
    },
    query
  );
}
function clearNaturalSearchCache() {
  searchCache.clear();
}
async function naturalSearch(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const query = clean(req.body?.query, MAX_QUERY_LENGTH);
  if (query.length < 2) {
    res.status(400).json({ error: "Provide a natural-language search query." });
    return;
  }
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("X-Search-Cache", "HIT");
    res.json({ ...cached.data, cached: true });
    return;
  }
  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      maxTokens: 260,
      messages: [
        {
          role: "system",
          content: "You are SKIP, a baseball intelligence search router. Interpret the user query only to identify a verified navigation destination. Never answer with a statistic, projection, ranking, injury, or scouting claim. Never invent an entity. Return intent player when the query names a player, team when it names an MLB team, page when it requests a known SKIP page, and unknown when the entity or destination is unclear. For player or team intent, entity must be the user-supplied canonical-looking name, not a guessed name. metric may contain a requested stat label such as OPS, WAR, ERA, or payroll, but it is only routing context. Allowed tabs: overview, players, prospects, draft, league, intelligence, amd, knowledge, notes, feed, follows, settings."
        },
        { role: "user", content: JSON.stringify({ query }) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "skip_natural_search_route",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: ["player", "team", "page", "unknown"]
              },
              tab: {
                type: ["string", "null"],
                enum: [
                  "overview",
                  "players",
                  "prospects",
                  "draft",
                  "league",
                  "intelligence",
                  "amd",
                  "knowledge",
                  "notes",
                  "feed",
                  "follows",
                  "settings",
                  null
                ]
              },
              entity: { type: ["string", "null"] },
              metric: { type: ["string", "null"] },
              interpretation: { type: "string" }
            },
            required: ["intent", "tab", "entity", "metric", "interpretation"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    const data = normalizeResult({ ...parsed, generated: true }, query);
    searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    if (searchCache.size > 100)
      searchCache.delete(searchCache.keys().next().value);
    res.setHeader("X-Search-Cache", "MISS");
    res.json(data);
  } catch (error) {
    console.warn(
      "[natural-search] AI router unavailable; returning safe fallback",
      error?.message || error
    );
    const data = fallbackResult(query);
    res.setHeader("X-Search-Status", "unavailable");
    res.json(data);
  }
}
var CACHE_TTL_MS, MAX_QUERY_LENGTH, searchCache, VALID_TABS, VALID_INTENTS;
var init_natural_search = __esm({
  "server/api/natural-search.js"() {
    "use strict";
    init_llm();
    CACHE_TTL_MS = 6e4;
    MAX_QUERY_LENGTH = 240;
    searchCache = /* @__PURE__ */ new Map();
    VALID_TABS = /* @__PURE__ */ new Set([
      "overview",
      "players",
      "prospects",
      "draft",
      "league",
      "intelligence",
      "amd",
      "knowledge",
      "notes",
      "feed",
      "follows",
      "settings"
    ]);
    VALID_INTENTS = /* @__PURE__ */ new Set(["player", "team", "page", "unknown"]);
  }
});

// shared/luxuryTax.js
function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function getRepeaterTier(consecutiveYears) {
  const years = numeric(consecutiveYears);
  if (years == null || years < 1)
    return { key: "unknown", label: "History unavailable", baseRate: null };
  if (years === 1)
    return { key: "first-year", label: "First-year CBT payer", baseRate: 0.2 };
  if (years === 2)
    return {
      key: "second-year",
      label: "Second consecutive year",
      baseRate: 0.3
    };
  return {
    key: "third-plus-year",
    label: "Third consecutive year or more",
    baseRate: 0.5
  };
}
var CBT_THRESHOLDS, CBT_SOURCE_URL;
var init_luxuryTax = __esm({
  "shared/luxuryTax.js"() {
    "use strict";
    CBT_THRESHOLDS = Object.freeze({
      2024: 237e6,
      2025: 241e6,
      2026: 244e6
    });
    CBT_SOURCE_URL = "https://www.mlb.com/glossary/transactions/competitive-balance-tax";
  }
});

// server/api/team-financials.js
var team_financials_exports = {};
__export(team_financials_exports, {
  __resetTeamFinancialsStateForTests: () => __resetTeamFinancialsStateForTests,
  default: () => handler8,
  parseMoney: () => parseMoney,
  parseTeamPayrollHtml: () => parseTeamPayrollHtml,
  parseTeamTaxHtml: () => parseTeamTaxHtml
});
function __resetTeamFinancialsStateForTests() {
  financialCache.clear();
  financialInFlight.clear();
}
function financialCacheKey(team, season) {
  return `${team}:${season}`;
}
function setFinancialHeaders(res, freshness) {
  res.setHeader(
    "Cache-Control",
    freshness === "stale-cached" ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=1800, stale-while-revalidate=3600"
  );
  res.setHeader("X-Provider-Cache", freshness === "live" ? "MISS" : "STALE");
  res.setHeader("X-Provider-Freshness", freshness);
}
function stripTags3(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/gi, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function parseMoney(value) {
  if (value == null || value === "" || value === "-") return null;
  const raw = String(value).replace(/[,$\s]/g, "").replace(/[()]/g, "");
  const sign = String(value).includes("-") ? -1 : 1;
  const multiplier = /m$/i.test(raw) ? 1e6 : /k$/i.test(raw) ? 1e3 : 1;
  const number = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? sign * Math.round(number * multiplier) : null;
}
function headerText(tableHtml) {
  const thead = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || "";
  const source2 = thead || tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || "";
  return [...source2.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(
    (match) => stripTags3(match[1]).toLowerCase()
  );
}
function tableRows(tableHtml) {
  const tbody = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || tableHtml;
  return [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (match) => [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (cell) => stripTags3(cell[1])
    )
  ).filter((row) => row.length > 1);
}
function findTable(html, predicate) {
  return [...String(html || "").matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[0]).find((table) => predicate(headerText(table)));
}
function teamCodeFromCell(cell, requested) {
  const upper = String(cell || "").toUpperCase();
  if (upper.includes(` ${requested} `) || upper.startsWith(`${requested} `) || upper.endsWith(` ${requested}`) || upper === requested)
    return requested;
  return null;
}
function indexOfHeader(headers, predicate) {
  return headers.findIndex(predicate);
}
function parseTeamPayrollHtml(html, teamAbbr, season = DEFAULT_SEASON) {
  const table = findTable(
    html,
    (headers2) => headers2.some((header) => header.includes("total payroll"))
  );
  if (!table) return null;
  const headers = headerText(table);
  const teamIndex = indexOfHeader(
    headers,
    (header) => header === "team" || header.includes("team")
  );
  const payrollIndex = indexOfHeader(
    headers,
    (header) => header.includes("total payroll")
  );
  const combinedPayrollHeader = payrollIndex >= 0 && headers[payrollIndex].includes("allocation");
  const allocationIndex = combinedPayrollHeader ? -1 : indexOfHeader(headers, (header) => header.includes("allocation"));
  const activeIndex = combinedPayrollHeader ? payrollIndex + 1 : indexOfHeader(
    headers,
    (header) => header === "active 26-man" || header.includes("26-man")
  );
  const injuredIndex = combinedPayrollHeader ? payrollIndex + 2 : indexOfHeader(headers, (header) => header.includes("injured"));
  const retainedIndex = combinedPayrollHeader ? payrollIndex + 3 : indexOfHeader(headers, (header) => header.includes("retained"));
  const buriedIndex = combinedPayrollHeader ? payrollIndex + 4 : indexOfHeader(headers, (header) => header.includes("buried"));
  const row = tableRows(table).find(
    (cells) => teamCodeFromCell(cells[teamIndex], teamAbbr)
  );
  if (!row || payrollIndex < 0) return null;
  return {
    teamAbbr,
    season,
    payroll: parseMoney(row[payrollIndex]),
    allocations: parseMoney(row[allocationIndex]),
    active: parseMoney(row[activeIndex]),
    injured: parseMoney(row[injuredIndex]),
    retained: parseMoney(row[retainedIndex]),
    buried: parseMoney(row[buriedIndex]),
    source: "Spotrac MLB Team Salary Payroll Tracker",
    sourceUrl: SPOTRAC_PAYROLL_URL(season)
  };
}
function parseTeamTaxHtml(html, teamAbbr, season = DEFAULT_SEASON) {
  const table = findTable(
    html,
    (headers2) => headers2.some((header) => header.includes("tax payroll")) && headers2.some((header) => header.includes("tax bill"))
  );
  if (!table) return null;
  const headers = headerText(table);
  const teamIndex = indexOfHeader(
    headers,
    (header) => header === "team" || header.includes("team")
  );
  const taxPayrollIndex = indexOfHeader(
    headers,
    (header) => header.includes("tax payroll")
  );
  const spaceIndex = indexOfHeader(
    headers,
    (header) => header === "space" || header.includes("space")
  );
  const taxBillIndex = indexOfHeader(
    headers,
    (header) => header.includes("tax bill")
  );
  const totalIndex = indexOfHeader(
    headers,
    (header) => header.includes("total tax payroll")
  );
  const row = tableRows(table).find(
    (cells) => teamCodeFromCell(cells[teamIndex], teamAbbr)
  );
  if (!row || taxPayrollIndex < 0) return null;
  const thresholdTable = findTable(
    html,
    (headers2) => headers2.some((header) => header.includes("level tax tier"))
  );
  const thresholdRow = thresholdTable ? tableRows(thresholdTable)[0] : null;
  const thresholdHeaders = thresholdTable ? headerText(thresholdTable) : [];
  const thresholdIndex = thresholdHeaders.findIndex(
    (header) => header.includes("level tax tier")
  );
  return {
    teamAbbr,
    season,
    taxPayroll: parseMoney(row[taxPayrollIndex]),
    taxSpace: parseMoney(row[spaceIndex]),
    estimatedTaxBill: parseMoney(row[taxBillIndex]),
    totalTaxPayroll: parseMoney(row[totalIndex]),
    taxThreshold: thresholdRow && thresholdIndex >= 0 ? parseMoney(thresholdRow[thresholdIndex]) : null,
    // Spotrac’s public 2026 table reports current payroll/tax estimates but not
    // a verified consecutive-year history. Keep the tier explicitly unknown;
    // downstream projections must not silently assume a first-year rate.
    repeaterYears: null,
    repeaterTier: getRepeaterTier(null).label,
    source: "Spotrac MLB Team Tax Tracker",
    sourceUrl: SPOTRAC_TAX_URL(season),
    repeaterSourceUrl: CBT_SOURCE_URL
  };
}
async function fetchHtml3(url, timeoutMs = 12e3) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA3,
      Accept: "text/html,application/xhtml+xml,*/*"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}
async function handler8(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const url = new URL(req.url, "https://placeholder.invalid");
  const team = String(url.searchParams.get("team") || "").trim().toUpperCase();
  const parsedSeason = Number(url.searchParams.get("season") || DEFAULT_SEASON);
  const season = Number.isInteger(parsedSeason) && parsedSeason >= 2024 && parsedSeason <= 2030 ? parsedSeason : DEFAULT_SEASON;
  if (!TEAM_CODE.test(team))
    return res.status(400).json({ error: "Missing or invalid team abbreviation" });
  const key = financialCacheKey(team, season);
  const now = Date.now();
  const cached = financialCache.get(key);
  if (cached?.freshUntil > now) {
    setFinancialHeaders(res, cached.freshness);
    return res.status(200).json(cached.payload);
  }
  const existing = financialInFlight.get(key);
  if (existing) {
    const payload2 = await existing;
    setFinancialHeaders(res, payload2.freshness || "live");
    return res.status(200).json(payload2);
  }
  if (isRateLimited(req, "team-financials")) return rateLimitResponse(res);
  const request = (async () => {
    const [payrollResult, taxResult] = await Promise.allSettled([
      fetchHtml3(SPOTRAC_PAYROLL_URL(season)).then(
        (html) => parseTeamPayrollHtml(html, team, season)
      ),
      fetchHtml3(SPOTRAC_TAX_URL(season)).then(
        (html) => parseTeamTaxHtml(html, team, season)
      )
    ]);
    const payroll = payrollResult.status === "fulfilled" ? payrollResult.value : null;
    const tax = taxResult.status === "fulfilled" ? taxResult.value : null;
    const stale = cached?.staleUntil > Date.now() ? cached : null;
    if (!payroll && !tax && stale) {
      return {
        ...stale.payload,
        freshness: "stale-cached",
        staleReason: "Spotrac upstream unavailable"
      };
    }
    const payload2 = payroll || tax ? {
      found: true,
      teamAbbr: team,
      season,
      payroll,
      tax,
      source: "Spotrac",
      sourceUrls: {
        payroll: SPOTRAC_PAYROLL_URL(season),
        tax: SPOTRAC_TAX_URL(season)
      },
      freshness: "live"
    } : { found: false, teamAbbr: team, season, freshness: "live" };
    financialCache.set(key, {
      payload: payload2,
      freshness: payload2.freshness,
      freshUntil: Date.now() + FRESH_TTL_MS2,
      staleUntil: Date.now() + FRESH_TTL_MS2 + STALE_TTL_MS2
    });
    return payload2;
  })();
  financialInFlight.set(key, request);
  request.finally(() => financialInFlight.delete(key)).catch(() => {
  });
  const payload = await request;
  setFinancialHeaders(res, payload.freshness || "live");
  return res.status(200).json(payload);
}
var DEFAULT_SEASON, TEAM_CODE, SPOTRAC_PAYROLL_URL, SPOTRAC_TAX_URL, UA3, FRESH_TTL_MS2, STALE_TTL_MS2, financialCache, financialInFlight;
var init_team_financials = __esm({
  "server/api/team-financials.js"() {
    "use strict";
    init_shared();
    init_luxuryTax();
    DEFAULT_SEASON = 2026;
    TEAM_CODE = /^[A-Z]{2,3}$/;
    SPOTRAC_PAYROLL_URL = (season) => `https://www.spotrac.com/mlb/payroll/_/year/${season}`;
    SPOTRAC_TAX_URL = (season) => `https://www.spotrac.com/mlb/tax/_/year/${season}`;
    UA3 = "Mozilla/5.0 (compatible; SKIPBaseball/1.0; +https://skipbaseball.com)";
    FRESH_TTL_MS2 = 30 * 6e4;
    STALE_TTL_MS2 = 6 * 60 * 6e4;
    financialCache = /* @__PURE__ */ new Map();
    financialInFlight = /* @__PURE__ */ new Map();
  }
});

// server/api/fangraphs-models.js
var fangraphs_models_exports = {};
__export(fangraphs_models_exports, {
  __resetFanGraphsProviderStateForTests: () => __resetFanGraphsProviderStateForTests,
  __seedFanGraphsModelCacheForTests: () => __seedFanGraphsModelCacheForTests,
  default: () => handler9,
  isFanGraphsProviderBlockedResponse: () => isFanGraphsProviderBlockedResponse,
  parseFanGraphsAggregateWarHtml: () => parseFanGraphsAggregateWarHtml,
  parseFanGraphsModelHtml: () => parseFanGraphsModelHtml,
  parseFanGraphsPlayoffOddsJson: () => parseFanGraphsPlayoffOddsJson
});
function __seedFanGraphsModelCacheForTests(teamAbbr, season, data, { expiresAt, staleExpiresAt } = {}) {
  modelCache.set(modelKey(teamAbbr, season), {
    data,
    expiresAt: expiresAt ?? Date.now() - 1,
    staleExpiresAt: staleExpiresAt ?? Date.now() + 6e4
  });
}
function __resetFanGraphsProviderStateForTests() {
  modelCache.clear();
  modelInFlight.clear();
  aggregateWarCache.clear();
  aggregateWarInFlight.clear();
  modelFailureCooldownUntil.clear();
  modelDailyAttemptDay.clear();
  aggregateDailyAttemptDay.clear();
  fanGraphsCooldownUntil = 0;
}
function isFanGraphsProviderBlockedResponse(status, body) {
  return Number(status) === 403 && /cloudflare|just a moment|challenge/i.test(String(body || ""));
}
function parseRetryAfterMs(response) {
  const value = response?.headers?.get?.("Retry-After");
  if (!value) return DEFAULT_COOLDOWN_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return Math.max(1e3, Math.min(12e4, seconds * 1e3));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1e3, Math.min(12e4, date - Date.now())) : DEFAULT_COOLDOWN_MS;
}
function modelKey(teamAbbr, season) {
  return `${teamAbbr}:${season}`;
}
function staleModel(cacheEntry) {
  return cacheEntry && cacheEntry.staleExpiresAt > Date.now() ? cacheEntry : null;
}
function stripTags4(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function cellsFromRow(row) {
  return [
    ...String(row || "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)
  ].map((match) => stripTags4(match[1]));
}
function tablesFromHtml(html) {
  return [
    ...String(html || "").matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)
  ].map((match) => match[1]);
}
function numeric2(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
function findTeamRow(html, teamAbbr) {
  const upper = String(teamAbbr).toUpperCase();
  for (const table of tablesFromHtml(html)) {
    for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = cellsFromRow(row[1]);
      if (cells.some(
        (cell) => new RegExp(`(?:^|\\s)${upper}(?:\\s|$)`, "i").test(cell)
      ))
        return cells;
    }
  }
  return null;
}
function parsePercentage(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}
function normalizeMetricKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function findTeamRowDetails(html, teamAbbr) {
  const upper = String(teamAbbr).toUpperCase();
  const aliases = [upper, ...TEAM_NAME_ALIASES[upper] || []];
  const matchesTeam = (cell) => aliases.some(
    (alias) => new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:\\s|$)`, "i").test(cell)
  );
  for (const table of tablesFromHtml(html)) {
    const headerMatch = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    const headers = headerMatch ? cellsFromRow(headerMatch[1]) : [];
    for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = cellsFromRow(row[1]);
      if (cells.some(matchesTeam)) {
        const metrics = {};
        cells.forEach((cell, index) => {
          const key = normalizeMetricKey(headers[index]);
          const value = numeric2(cell);
          if (key && value != null) metrics[key] = value;
        });
        return { cells, metrics };
      }
    }
  }
  return null;
}
function parseFanGraphsModelHtml({ oddsHtml, warHtml }, teamAbbr, season = DEFAULT_SEASON2) {
  const oddsDetails = findTeamRowDetails(oddsHtml, teamAbbr);
  const warDetails = findTeamRowDetails(warHtml, teamAbbr);
  const oddsRow = oddsDetails?.cells || findTeamRow(oddsHtml, teamAbbr);
  const warRow = warDetails?.cells || findTeamRow(warHtml, teamAbbr);
  const metrics = {
    ...oddsDetails?.metrics || {},
    ...warDetails?.metrics || {}
  };
  const pick = (...keys) => keys.map((key) => metrics[key]).find((value) => value != null) ?? null;
  const playoffOdds = pick(
    "make_playoffs",
    "playoff_odds",
    "make_postseason",
    "postseason_odds"
  ) ?? (oddsRow ? oddsRow.map(parsePercentage).find((value) => value != null) ?? null : null);
  const teamWar = pick("war", "team_war", "total_war") ?? (warRow ? warRow.map(numeric2).find((value) => value != null) ?? null : null);
  return {
    playoffOdds,
    teamWar,
    season,
    teamAbbr,
    source: "FanGraphs",
    sourceUrls: { playoffOdds: ODDS_URL, teamWar: WAR_URL },
    advancedMetrics: {
      projectedWins: pick("projected_wins", "proj_w", "wins", "w"),
      projectedLosses: pick("projected_losses", "proj_l", "losses", "l"),
      projectedRuns: pick("projected_runs", "runs", "r"),
      projectedRunsAllowed: pick(
        "projected_runs_allowed",
        "runs_allowed",
        "ra"
      ),
      offenseWar: pick("offense_war", "off_war", "batting_war"),
      defenseWar: pick("defense_war", "def_war", "fielding_war"),
      bullpenWar: pick("bullpen_war", "relief_war"),
      projectedWrcPlus: pick("projected_wrc_plus", "wrc_plus"),
      projectedFip: pick("projected_fip", "fip")
    }
  };
}
function parseFanGraphsPlayoffOddsJson(rows, teamAbbr, season = DEFAULT_SEASON2) {
  const upper = String(teamAbbr || "").toUpperCase();
  const aliases = /* @__PURE__ */ new Set([upper, ...upper === "CWS" ? ["CHW"] : [], ...upper === "KC" ? ["KCR"] : []]);
  const row = Array.isArray(rows) ? rows.find((candidate) => aliases.has(String(candidate?.abbName || "").toUpperCase())) : null;
  const endData = row?.endData || {};
  const probability = Number(endData.poffTitle);
  const projectedWins = Number(endData.ExpW);
  const projectedLosses = Number(endData.ExpL);
  return {
    found: Boolean(row),
    season,
    teamAbbr: upper,
    playoffOdds: Number.isFinite(probability) ? Number((probability * 100).toFixed(1)) : null,
    advancedMetrics: {
      projectedWins: Number.isFinite(projectedWins) ? Number(projectedWins.toFixed(1)) : null,
      projectedLosses: Number.isFinite(projectedLosses) ? Number(projectedLosses.toFixed(1)) : null
    }
  };
}
function parseFanGraphsAggregateWarHtml({ battingHtml, pitchingHtml }, season = DEFAULT_SEASON2) {
  const parseRows = (html) => {
    const rows = /* @__PURE__ */ new Map();
    for (const table of tablesFromHtml(html)) {
      const matches = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      if (!matches.length) continue;
      const headers = cellsFromRow(matches[0][1]);
      const teamIndex = headers.findIndex(
        (header) => normalizeMetricKey(header) === "team" || normalizeMetricKey(header).includes("team")
      );
      const warIndex = headers.findIndex(
        (header) => normalizeMetricKey(header) === "war" || normalizeMetricKey(header).endsWith("_war")
      );
      if (teamIndex < 0 || warIndex < 0) continue;
      for (const match of matches.slice(1)) {
        const cells = cellsFromRow(match[1]);
        const team = cells[teamIndex];
        const war = numeric2(cells[warIndex]);
        if (team && war != null) rows.set(team, war);
      }
      if (rows.size) break;
    }
    return rows;
  };
  const batting = parseRows(battingHtml);
  const pitching = parseRows(pitchingHtml);
  const names = /* @__PURE__ */ new Set([...batting.keys(), ...pitching.keys()]);
  return {
    season,
    teams: [...names].map((team) => ({
      team,
      battingWAR: batting.get(team) ?? null,
      pitchingWAR: pitching.get(team) ?? null,
      totalWAR: batting.has(team) && pitching.has(team) ? Number((batting.get(team) + pitching.get(team)).toFixed(1)) : null
    }))
  };
}
async function fetchFanGraphs(url, accept) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA4, Accept: accept },
    redirect: "follow",
    signal: AbortSignal.timeout(1e4)
  });
  if (!response.ok) {
    const retryAfterMs2 = response.status === 429 ? parseRetryAfterMs(response) : 0;
    let providerBlocked = false;
    if (response.status === 403) {
      const body = await response.text().catch(() => "");
      providerBlocked = isFanGraphsProviderBlockedResponse(response.status, body);
    }
    throw Object.assign(
      new Error(`FanGraphs returned HTTP ${response.status}`),
      { status: response.status, retryAfterMs: retryAfterMs2, providerBlocked }
    );
  }
  return response;
}
async function fetchHtml4(url) {
  const response = await fetchFanGraphs(url, "text/html,application/xhtml+xml,*/*");
  return response.text();
}
async function fetchJson(url) {
  const response = await fetchFanGraphs(url, "application/json,text/plain,*/*");
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("FanGraphs returned invalid JSON"), { status: 502 });
  }
}
async function loadAggregateWar(season) {
  const cached = aggregateWarCache.get(String(season));
  if (cached && cached.expiresAt > Date.now())
    return { data: cached.data, cache: "HIT" };
  const key = String(season);
  const day = utcDayKey();
  const existing = aggregateWarInFlight.get(key);
  if (existing) return { data: await existing, cache: "COALESCED" };
  if (hasAttemptedProviderToday(aggregateDailyAttemptDay.get(key), Date.now())) {
    if (cached) return { data: { ...cached.data, freshness: "daily-cached" }, cache: "DAILY" };
    const error = new Error("FanGraphs aggregate daily refresh already attempted");
    error.status = 503;
    throw error;
  }
  if (fanGraphsCooldownUntil > Date.now()) {
    if (cached && cached.staleExpiresAt > Date.now())
      return {
        data: {
          ...cached.data,
          freshness: "stale-cached",
          staleReason: "FanGraphs rate limit cooldown"
        },
        cache: "STALE"
      };
    const error = new Error("FanGraphs aggregate rate limit cooldown active");
    error.status = 429;
    error.retryAfter = Math.ceil((fanGraphsCooldownUntil - Date.now()) / 1e3);
    throw error;
  }
  aggregateDailyAttemptDay.set(key, day);
  const request = (async () => {
    const [battingResult, pitchingResult] = await Promise.allSettled([
      fetchHtml4(AGGREGATE_WAR_URL(season, "bat")),
      fetchHtml4(AGGREGATE_WAR_URL(season, "pit"))
    ]);
    const throttled = [battingResult, pitchingResult].filter(
      (result) => result.status === "rejected" && result.reason?.status === 429
    );
    if (throttled.length)
      fanGraphsCooldownUntil = Math.max(
        fanGraphsCooldownUntil,
        Date.now() + Math.max(
          ...throttled.map(
            (result) => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
          )
        )
      );
    const parsed = parseFanGraphsAggregateWarHtml(
      {
        battingHtml: battingResult.status === "fulfilled" ? battingResult.value : "",
        pitchingHtml: pitchingResult.status === "fulfilled" ? pitchingResult.value : ""
      },
      season
    );
    const hasRows = parsed.teams.some((team) => team.totalWAR != null);
    if (!hasRows && battingResult.status === "rejected" && pitchingResult.status === "rejected") {
      const providerBlocked = [battingResult, pitchingResult].some(
        (result) => result.status === "rejected" && result.reason?.providerBlocked
      );
      const error = new Error(
        providerBlocked ? "FanGraphs provider blocked the aggregate WAR request" : "FanGraphs aggregate Team WAR unavailable"
      );
      error.status = throttled.length ? 429 : 502;
      error.providerBlocked = providerBlocked;
      if (throttled.length)
        error.retryAfter = Math.ceil(
          Math.max(
            ...throttled.map(
              (result) => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
            )
          ) / 1e3
        );
      throw error;
    }
    return {
      found: hasRows,
      ...parsed,
      source: "FanGraphs",
      sourceUrls: {
        batting: AGGREGATE_WAR_URL(season, "bat"),
        pitching: AGGREGATE_WAR_URL(season, "pit")
      },
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      freshness: "live",
      statuses: {
        batting: battingResult.status === "fulfilled" && battingResult.value ? "live" : "upstream-unavailable",
        pitching: pitchingResult.status === "fulfilled" && pitchingResult.value ? "live" : "upstream-unavailable"
      }
    };
  })();
  aggregateWarInFlight.set(key, request);
  try {
    const data = await request;
    aggregateWarCache.set(key, {
      data,
      expiresAt: nextUtcMidnightMs2(),
      staleExpiresAt: nextUtcMidnightMs2() + STALE_TTL_MS3
    });
    return { data, cache: "MISS" };
  } catch (error) {
    if (cached && cached.staleExpiresAt > Date.now())
      return {
        data: {
          ...cached.data,
          freshness: "stale-cached",
          staleReason: error.status === 429 ? "FanGraphs rate limit" : "FanGraphs upstream unavailable"
        },
        cache: "STALE"
      };
    throw error;
  } finally {
    if (aggregateWarInFlight.get(key) === request)
      aggregateWarInFlight.delete(key);
  }
}
async function handler9(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const url = new URL(req.url, "https://placeholder.invalid");
  const teamAbbr = String(url.searchParams.get("team") || "").trim().toUpperCase();
  const seasonValue = Number(url.searchParams.get("season") || DEFAULT_SEASON2);
  const season = Number.isInteger(seasonValue) ? seasonValue : DEFAULT_SEASON2;
  if (url.searchParams.get("mode") === "aggregate") {
    if (isRateLimited(req, "fangraphs")) return rateLimitResponse(res);
    try {
      const result = await loadAggregateWar(season);
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=1800"
      );
      res.setHeader("X-Provider-Cache", result.cache);
      return res.status(200).json({ ...result.data, servedAt: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (error) {
      if (error?.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(error?.status || 502).json({
        found: false,
        season,
        teams: [],
        statuses: { batting: "unavailable", pitching: "unavailable" },
        providerBlocked: Boolean(error?.providerBlocked),
        error: error?.providerBlocked ? "FanGraphs provider blocked the aggregate WAR request" : "FanGraphs aggregate Team WAR unavailable"
      });
    }
  }
  if (!TEAM_CODE2.test(teamAbbr))
    return res.status(400).json({ error: "Missing or invalid team abbreviation" });
  const key = modelKey(teamAbbr, season);
  const cached = modelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=1800"
    );
    res.setHeader("X-Provider-Cache", "HIT");
    return res.status(200).json({
      ...cached.data,
      freshness: "cached",
      servedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  const day = utcDayKey();
  const existing = modelInFlight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=900, stale-while-revalidate=1800"
      );
      res.setHeader("X-Provider-Cache", "COALESCED");
      return res.status(200).json({
        ...data,
        freshness: "live",
        servedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      if (error?.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(error?.status || 502).json(error?.payload || { error: "FanGraphs request failed" });
    }
  }
  if (hasAttemptedProviderToday(modelDailyAttemptDay.get(key), Date.now())) {
    if (cached) {
      res.setHeader("X-Provider-Cache", "DAILY");
      return res.status(200).json({ ...cached.data, freshness: "daily-cached", servedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const staleDaily = staleModel(cached);
    if (staleDaily) {
      res.setHeader("X-Provider-Cache", "STALE");
      return res.status(200).json({ ...staleDaily.data, freshness: "stale-cached", servedAt: (/* @__PURE__ */ new Date()).toISOString(), staleReason: "FanGraphs daily refresh already attempted" });
    }
    return res.status(503).json({ error: "FanGraphs daily refresh already attempted", retryAfter: Math.ceil((nextUtcMidnightMs2() - Date.now()) / 1e3) });
  }
  const stale = staleModel(cached);
  if (fanGraphsCooldownUntil > Date.now()) {
    if (stale) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      res.setHeader("X-Provider-Cache", "STALE");
      return res.status(200).json({
        ...stale.data,
        freshness: "stale-cached",
        servedAt: (/* @__PURE__ */ new Date()).toISOString(),
        staleReason: "FanGraphs rate limit cooldown"
      });
    }
    const retryAfter = Math.ceil((fanGraphsCooldownUntil - Date.now()) / 1e3);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "FanGraphs rate limit cooldown active", retryAfter });
  }
  const failureUntil = modelFailureCooldownUntil.get(key) || 0;
  if (failureUntil > Date.now()) {
    if (stale) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      res.setHeader("X-Provider-Cache", "STALE");
      return res.status(200).json({
        ...stale.data,
        freshness: "stale-cached",
        servedAt: (/* @__PURE__ */ new Date()).toISOString(),
        staleReason: "FanGraphs recent upstream failure"
      });
    }
    const retryAfter = Math.ceil((failureUntil - Date.now()) / 1e3);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(503).json({
      error: "FanGraphs temporary upstream cooldown active",
      retryAfter
    });
  }
  if (failureUntil) modelFailureCooldownUntil.delete(key);
  if (isRateLimited(req, "fangraphs")) return rateLimitResponse(res);
  modelDailyAttemptDay.set(key, day);
  const upstreamRequest = (async () => {
    const retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const oddsDateEnd = (/* @__PURE__ */ new Date()).getUTCFullYear() === season ? today : `${season}-12-31`;
    const [oddsResult, warResult] = await Promise.allSettled([
      fetchJson(ODDS_API_URL(oddsDateEnd)),
      fetchHtml4(WAR_URL)
    ]);
    const throttledResults = [oddsResult, warResult].filter(
      (result) => result.status === "rejected" && result.reason?.status === 429
    );
    const rateLimited = throttledResults.length > 0;
    if (rateLimited) {
      const cooldownMs = Math.max(
        ...throttledResults.map(
          (result) => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
        )
      );
      fanGraphsCooldownUntil = Math.max(
        fanGraphsCooldownUntil,
        Date.now() + cooldownMs
      );
    }
    const odds = oddsResult.status === "fulfilled" ? parseFanGraphsPlayoffOddsJson(oddsResult.value, teamAbbr, season) : { found: false, playoffOdds: null, advancedMetrics: {} };
    const parsed = parseFanGraphsModelHtml(
      {
        oddsHtml: "",
        warHtml: warResult.status === "fulfilled" ? warResult.value : ""
      },
      teamAbbr,
      season
    );
    const advancedMetrics = {
      ...parsed.advancedMetrics,
      ...odds.advancedMetrics
    };
    if (!parsed.found && oddsResult.status === "rejected" && warResult.status === "rejected") {
      const retryAfter = rateLimited ? Math.ceil(
        Math.max(
          ...throttledResults.map(
            (result) => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
          )
        ) / 1e3
      ) : void 0;
      const providerBlocked = [oddsResult, warResult].some(
        (result) => result.status === "rejected" && result.reason?.providerBlocked
      );
      throw {
        status: rateLimited ? 429 : 502,
        retryAfter,
        providerBlocked,
        payload: {
          error: rateLimited ? "FanGraphs rate limited both model sources" : providerBlocked ? "FanGraphs provider blocked the model request" : "FanGraphs model sources unavailable",
          providerBlocked
        }
      };
    }
    return {
      found: odds.playoffOdds != null || parsed.teamWar != null,
      retrievedAt,
      source: parsed.source,
      sourceUrls: parsed.sourceUrls,
      season,
      teamAbbr,
      playoffOdds: odds.playoffOdds,
      teamWar: parsed.teamWar,
      advancedMetrics,
      statuses: {
        playoffOdds: odds.playoffOdds != null ? "live" : oddsResult.status === "fulfilled" ? "unparsed" : "upstream-unavailable",
        teamWar: parsed.teamWar != null ? "live" : warResult.status === "fulfilled" ? "unparsed" : "upstream-unavailable"
      },
      freshness: "live"
    };
  })();
  modelInFlight.set(key, upstreamRequest);
  try {
    const data = await upstreamRequest;
    modelFailureCooldownUntil.delete(key);
    modelCache.set(key, {
      data,
      expiresAt: nextUtcMidnightMs2(),
      staleExpiresAt: nextUtcMidnightMs2() + STALE_TTL_MS3
    });
    if (modelCache.size > 200)
      modelCache.delete(modelCache.keys().next().value);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=1800"
    );
    res.setHeader("X-Provider-Cache", "MISS");
    return res.status(200).json({ ...data, servedAt: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (error) {
    if (error?.status >= 500)
      modelFailureCooldownUntil.set(
        key,
        Date.now() + FANGRAPHS_FAILURE_COOLDOWN_MS
      );
    const fallback = staleModel(cached);
    if (fallback) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      res.setHeader("X-Provider-Cache", "STALE");
      return res.status(200).json({
        ...fallback.data,
        freshness: "stale-cached",
        servedAt: (/* @__PURE__ */ new Date()).toISOString(),
        staleReason: error?.status === 429 ? "FanGraphs rate limit" : error?.providerBlocked ? "FanGraphs provider blocked the request" : "FanGraphs upstream unavailable"
      });
    }
    if (error?.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    return res.status(error?.status || 502).json(error?.payload || { error: "FanGraphs request failed" });
  } finally {
    if (modelInFlight.get(key) === upstreamRequest) modelInFlight.delete(key);
  }
}
var DEFAULT_SEASON2, TEAM_CODE2, ODDS_URL, ODDS_API_URL, WAR_URL, AGGREGATE_WAR_URL, UA4, CACHE_TTL_MS2, STALE_TTL_MS3, DEFAULT_COOLDOWN_MS, FANGRAPHS_FAILURE_COOLDOWN_MS, modelCache, modelInFlight, aggregateWarCache, aggregateWarInFlight, fanGraphsCooldownUntil, modelFailureCooldownUntil, modelDailyAttemptDay, aggregateDailyAttemptDay, TEAM_NAME_ALIASES;
var init_fangraphs_models = __esm({
  "server/api/fangraphs-models.js"() {
    "use strict";
    init_shared();
    init_daily_provider_policy();
    DEFAULT_SEASON2 = 2026;
    TEAM_CODE2 = /^[A-Z]{2,3}$/;
    ODDS_URL = "https://www.fangraphs.com/standings/playoff-odds/fg/mlb";
    ODDS_API_URL = (dateEnd) => `https://www.fangraphs.com/api/playoff-odds/odds?dateEnd=${encodeURIComponent(dateEnd)}&dateDelta=&projectionMode=2&standingsType=mlb`;
    WAR_URL = "https://www.fangraphs.com/depthcharts.aspx?position=Team";
    AGGREGATE_WAR_URL = (season, stats) => `https://www.fangraphs.com/leaders-legacy.aspx?pos=all&stats=${stats}&lg=all&qual=y&type=8&season=${season}&season1=${season}&month=0&ind=0&team=0%2Cts&rost=0&age=0%2C100&filter=&players=&page=1_50`;
    UA4 = "Mozilla/5.0 (compatible; SKIPBaseball/1.0)";
    CACHE_TTL_MS2 = 15 * 6e4;
    STALE_TTL_MS3 = 60 * 6e4;
    DEFAULT_COOLDOWN_MS = 3e4;
    FANGRAPHS_FAILURE_COOLDOWN_MS = 15e3;
    modelCache = /* @__PURE__ */ new Map();
    modelInFlight = /* @__PURE__ */ new Map();
    aggregateWarCache = /* @__PURE__ */ new Map();
    aggregateWarInFlight = /* @__PURE__ */ new Map();
    fanGraphsCooldownUntil = 0;
    modelFailureCooldownUntil = /* @__PURE__ */ new Map();
    modelDailyAttemptDay = /* @__PURE__ */ new Map();
    aggregateDailyAttemptDay = /* @__PURE__ */ new Map();
    TEAM_NAME_ALIASES = {
      ARI: ["Diamondbacks"],
      ATH: ["Athletics"],
      ATL: ["Braves"],
      BAL: ["Orioles"],
      BOS: ["Red Sox"],
      CHC: ["Cubs"],
      CIN: ["Reds"],
      CLE: ["Guardians"],
      COL: ["Rockies"],
      CWS: ["White Sox"],
      DET: ["Tigers"],
      HOU: ["Astros"],
      KC: ["Royals"],
      KCR: ["Royals"],
      LAA: ["Angels"],
      LAD: ["Dodgers"],
      MIA: ["Marlins"],
      MIL: ["Brewers"],
      MIN: ["Twins"],
      NYM: ["Mets"],
      NYY: ["Yankees"],
      OAK: ["Athletics"],
      PHI: ["Phillies"],
      PIT: ["Pirates"],
      SD: ["Padres"],
      SEA: ["Mariners"],
      SF: ["Giants"],
      STL: ["Cardinals"],
      TB: ["Rays"],
      TEX: ["Rangers"],
      TOR: ["Blue Jays"],
      WSH: ["Nationals"]
    };
  }
});

// server/api/intelligence-calculations.js
var intelligence_calculations_exports = {};
__export(intelligence_calculations_exports, {
  __resetIntelligenceCalculationStateForTests: () => __resetIntelligenceCalculationStateForTests,
  calculateAllStandingsIntelligence: () => calculateAllStandingsIntelligence,
  calculateFromStanding: () => calculateFromStanding,
  calculateStandingsPlayoffProjection: () => calculateStandingsPlayoffProjection,
  default: () => handler10
});
function __resetIntelligenceCalculationStateForTests() {
  allTeamCache.clear();
  allTeamInFlight.clear();
}
function numeric3(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function standingRows(payload) {
  return (payload?.records || []).flatMap((group) => group?.teamRecords || []).filter(Boolean);
}
function standingDivisionId(row) {
  return Number(row?.division?.id ?? row?.team?.division?.id) || null;
}
function standingLeagueId(row) {
  return Number(row?.league?.id ?? row?.team?.league?.id) || null;
}
function teamId(row) {
  return Number(row?.team?.id) || null;
}
function winProjection(row) {
  const wins = numeric3(row?.wins ?? row?.w);
  const losses = numeric3(row?.losses ?? row?.l);
  const played = wins != null && losses != null ? wins + losses : 0;
  if (!played) return null;
  return wins / played * SEASON_LENGTH;
}
function hasCalculableRecord(row) {
  return winProjection(row) != null;
}
function gamesPlayed(row) {
  const wins = numeric3(row?.wins ?? row?.w);
  const losses = numeric3(row?.losses ?? row?.l);
  return wins != null && losses != null ? wins + losses : null;
}
function logisticProbability(margin, scale = PLAYOFF_MARGIN_SCALE_WINS) {
  if (!Number.isFinite(margin)) return null;
  return 1 / (1 + Math.exp(-margin / scale));
}
function sortByProjectedWins(rows) {
  return [...rows].sort((left, right) => {
    const projectionDifference = (winProjection(right) || 0) - (winProjection(left) || 0);
    return projectionDifference || String(left?.team?.name || "").localeCompare(String(right?.team?.name || ""));
  });
}
function buildDivisionLeaders(leagueRows) {
  const leaders = /* @__PURE__ */ new Map();
  for (const row of leagueRows) {
    const divisionId = standingDivisionId(row);
    if (!divisionId) continue;
    const current = leaders.get(divisionId);
    if (!current || (winProjection(row) || 0) > (winProjection(current) || 0)) leaders.set(divisionId, row);
  }
  return leaders;
}
function pairwiseSweepProbability(targetProjection, competitorRows) {
  const probabilities = competitorRows.map((row) => logisticProbability(targetProjection - (winProjection(row) || 0)));
  if (!probabilities.length || probabilities.some((value) => value == null)) return null;
  return probabilities.reduce((product, probability) => product * probability, 1);
}
function calculateStandingsPlayoffProjection(payload, targetStanding) {
  const targetProjection = winProjection(targetStanding);
  const targetLeague = standingLeagueId(targetStanding);
  const targetDivision = standingDivisionId(targetStanding);
  const targetId = teamId(targetStanding);
  if (targetProjection == null || !targetLeague || !targetDivision || !targetId) return null;
  const leagueRows = standingRows(payload).filter((row) => standingLeagueId(row) === targetLeague && hasCalculableRecord(row));
  const divisionRows = leagueRows.filter((row) => standingDivisionId(row) === targetDivision);
  const divisionCount = new Set(leagueRows.map(standingDivisionId).filter(Boolean)).size;
  if (divisionCount < 3 || divisionRows.length < 2 || leagueRows.length < 10) return null;
  const projectedDivision = sortByProjectedWins(divisionRows);
  const targetDivisionRank = projectedDivision.findIndex((row) => teamId(row) === targetId) + 1;
  if (!targetDivisionRank) return null;
  const divisionCompetitors = projectedDivision.filter((row) => teamId(row) !== targetId);
  const nearestDivisionCompetitor = divisionCompetitors[0] || null;
  const divisionMargin = nearestDivisionCompetitor ? targetProjection - (winProjection(nearestDivisionCompetitor) || 0) : null;
  const seasonComplete = leagueRows.every((row) => (gamesPlayed(row) || 0) >= SEASON_LENGTH);
  const divisionTitleProbability = seasonComplete ? targetDivisionRank === 1 ? 1 : 0 : pairwiseSweepProbability(targetProjection, divisionCompetitors);
  const divisionLeaders = buildDivisionLeaders(leagueRows);
  const targetIsProjectedDivisionLeader = teamId(divisionLeaders.get(targetDivision)) === targetId;
  const wildcardCandidates = sortByProjectedWins(leagueRows.filter((row) => {
    const isDivisionLeader = teamId(divisionLeaders.get(standingDivisionId(row))) === teamId(row);
    return !isDivisionLeader || teamId(row) === targetId;
  }));
  const targetWildCardRank = wildcardCandidates.findIndex((row) => teamId(row) === targetId) + 1;
  const cutoffIndex = targetWildCardRank > 0 && targetWildCardRank <= WILD_CARD_SLOTS ? WILD_CARD_SLOTS : WILD_CARD_SLOTS - 1;
  const wildcardCutline = wildcardCandidates[cutoffIndex] || null;
  const wildCardMargin = wildcardCutline ? targetProjection - (winProjection(wildcardCutline) || 0) : null;
  const wildCardProbability = seasonComplete ? targetIsProjectedDivisionLeader ? 0 : targetWildCardRank > 0 && targetWildCardRank <= WILD_CARD_SLOTS ? 1 : 0 : targetWildCardRank && wildcardCutline ? logisticProbability(wildCardMargin) : null;
  const playoffProbability = divisionTitleProbability == null || wildCardProbability == null ? null : divisionTitleProbability + (1 - divisionTitleProbability) * wildCardProbability;
  return {
    probability: playoffProbability == null ? null : Number((playoffProbability * 100).toFixed(1)),
    divisionTitleProbability: divisionTitleProbability == null ? null : Number((divisionTitleProbability * 100).toFixed(1)),
    wildCardProbability: wildCardProbability == null ? null : Number((wildCardProbability * 100).toFixed(1)),
    projectedDivisionRank: targetDivisionRank || null,
    projectedWildCardRank: targetWildCardRank || null,
    divisionMarginWins: divisionMargin == null ? null : Number(divisionMargin.toFixed(1)),
    wildCardMarginWins: wildCardMargin == null ? null : Number(wildCardMargin.toFixed(1)),
    divisionCount,
    wildCardSlots: WILD_CARD_SLOTS,
    seasonComplete,
    model: seasonComplete ? "completed-season standings placement; division leader and three-Wild-Card positions are deterministic" : "deterministic standings pace; pairwise division sweep and three-Wild-Card cutline with 4-win logistic uncertainty; excludes schedule, roster, injury, transaction, and simulation inputs"
  };
}
function calculateFromStanding(standing, season, standingsPayload = null) {
  if (!standing) return null;
  const wins = numeric3(standing.wins ?? standing.w);
  const losses = numeric3(standing.losses ?? standing.l);
  if (wins == null || losses == null || wins + losses <= 0) return null;
  const gamesPlayed2 = wins + losses;
  const winPct = wins / gamesPlayed2;
  const projectedWins = winPct * SEASON_LENGTH;
  const projectedLosses = SEASON_LENGTH - projectedWins;
  const runsScored = numeric3(standing.runsScored ?? standing.runs);
  const runsAllowed = numeric3(standing.runsAllowed ?? standing.runsAgainst);
  const pythagoreanExponent = 1.83;
  const pythagoreanWinPct = runsScored != null && runsAllowed != null && runsScored + runsAllowed > 0 ? runsScored ** pythagoreanExponent / (runsScored ** pythagoreanExponent + runsAllowed ** pythagoreanExponent) : null;
  const pythagoreanWins = pythagoreanWinPct == null ? null : pythagoreanWinPct * SEASON_LENGTH;
  const teamWarProxy = pythagoreanWins == null ? null : pythagoreanWins - REPLACEMENT_WIN_BASELINE;
  const playoffProjection = calculateStandingsPlayoffProjection(standingsPayload, standing);
  return {
    season: Number(season),
    teamId: teamId(standing),
    teamName: standing.team?.name || null,
    source: "MLB Stats API",
    provenance: "calculated-from-verified-standings",
    freshness: "calculated",
    methodology: {
      projectedWins: "current verified win percentage multiplied by a 162-game season",
      projectedLosses: "162 minus calculated projected wins",
      pythagoreanWinPct: pythagoreanWinPct == null ? null : "runs scored and runs allowed with exponent 1.83",
      teamWarProxy: teamWarProxy == null ? null : "pythagorean expected wins minus a 48-win replacement baseline; not FanGraphs Team WAR",
      playoffProbability: playoffProjection == null ? null : playoffProjection.model
    },
    metrics: {
      wins,
      losses,
      gamesPlayed: gamesPlayed2,
      winPct,
      projectedWins,
      projectedLosses,
      runsScored,
      runsAllowed,
      runDifferential: runsScored != null && runsAllowed != null ? runsScored - runsAllowed : null,
      pythagoreanWinPct,
      pythagoreanWins,
      teamWarProxy,
      replacementWinBaseline: teamWarProxy == null ? null : REPLACEMENT_WIN_BASELINE,
      playoffProbability: playoffProjection?.probability ?? null,
      divisionTitleProbability: playoffProjection?.divisionTitleProbability ?? null,
      wildCardProbability: playoffProjection?.wildCardProbability ?? null
    },
    playoffProjection
  };
}
function calculateAllStandingsIntelligence(payload, season) {
  const rows = standingRows(payload);
  const teams = [];
  const unavailableTeams = [];
  const seenTeamIds = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const id = teamId(row);
    if (!id || seenTeamIds.has(id)) continue;
    seenTeamIds.add(id);
    const result = calculateFromStanding(row, season, payload);
    if (result) teams.push(result);
    else unavailableTeams.push({ teamId: id, teamName: row?.team?.name || null, reason: "insufficient verified standings record" });
  }
  const calculablePlayoffTeams = teams.filter((team) => team.metrics.playoffProbability != null).length;
  const calculableWarTeams = teams.filter((team) => team.metrics.teamWarProxy != null).length;
  return {
    season: Number(season),
    source: "MLB Stats API",
    provenance: "calculated-from-verified-standings",
    freshness: "calculated",
    totalStandingsTeams: seenTeamIds.size,
    calculatedTeams: teams.length,
    playoffEligibleCalculations: calculablePlayoffTeams,
    teamWarProxyCalculations: calculableWarTeams,
    unavailableTeams,
    teams: teams.sort((left, right) => String(left.teamName || "").localeCompare(String(right.teamName || "")))
  };
}
async function fetchJson2(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SKIPBaseball/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(12e3)
  });
  if (!response.ok) throw new Error(`MLB Stats API responded with ${response.status}`);
  return response.json();
}
async function loadAllCalculations(season) {
  const key = String(season);
  const now = Date.now();
  const day = utcDayKey(now);
  const cached = allTeamCache.get(key);
  if (cached?.day === day) return { data: cached.data, cache: "DAILY" };
  const existing = allTeamInFlight.get(key);
  if (existing) return { data: await existing, cache: "COALESCED" };
  const request = (async () => {
    const standings = await fetchJson2(`${MLB_BASE3}/standings?leagueId=103,104&season=${encodeURIComponent(season)}&standingsTypes=regularSeason&hydrate=team,division,league`);
    const data = calculateAllStandingsIntelligence(standings, season);
    if (!data.calculatedTeams) {
      const error = new Error("MLB standings did not contain enough verified fields for calculation");
      error.status = 422;
      throw error;
    }
    allTeamCache.set(key, { day, data, expiresAt: nextUtcMidnightMs2(now), staleExpiresAt: nextUtcMidnightMs2(now) + DAILY_STALE_MS });
    return data;
  })();
  allTeamInFlight.set(key, request);
  try {
    return { data: await request, cache: "MISS" };
  } finally {
    if (allTeamInFlight.get(key) === request) allTeamInFlight.delete(key);
  }
}
function resultForTeam(data, teamId2) {
  return data?.teams?.find((result) => Number(result.teamId) === Number(teamId2)) || null;
}
async function handler10(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "intelligence-calculations")) return rateLimitResponse(res);
  const url = new URL(req.url, "https://placeholder.invalid");
  const season = Number(url.searchParams.get("season"));
  const mode = String(url.searchParams.get("mode") || "team").toLowerCase();
  const teamId2 = Number(url.searchParams.get("teamId"));
  if (!Number.isInteger(season) || season < 1900 || season > 2200 || !["team", "all"].includes(mode)) {
    return res.status(400).json({ error: "Valid season and optional mode=all are required" });
  }
  if (mode === "team" && (!Number.isInteger(teamId2) || teamId2 <= 0)) {
    return res.status(400).json({ error: "Valid teamId and season are required" });
  }
  try {
    const result = await loadAllCalculations(season);
    const payload = mode === "all" ? result.data : resultForTeam(result.data, teamId2);
    if (!payload) {
      return res.status(422).json({ error: "The requested team lacks sufficient verified standings data", provenance: "calculation-unavailable" });
    }
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    res.setHeader("X-Provider-Cache", result.cache);
    return res.status(200).json({ ...payload, servedAt: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (error) {
    const cached = allTeamCache.get(String(season));
    if (cached?.staleExpiresAt > Date.now()) {
      const payload = mode === "all" ? cached.data : resultForTeam(cached.data, teamId2);
      if (payload) {
        res.setHeader("X-Provider-Cache", "STALE");
        return res.status(200).json({ ...payload, freshness: "stale-cached", staleReason: error.message, servedAt: (/* @__PURE__ */ new Date()).toISOString() });
      }
    }
    return res.status(error.status || 502).json({ error: "Backend intelligence calculation unavailable", detail: error.message, provenance: "calculation-unavailable" });
  }
}
var MLB_BASE3, allTeamCache, allTeamInFlight, DAILY_STALE_MS, SEASON_LENGTH, REPLACEMENT_WIN_BASELINE, PLAYOFF_MARGIN_SCALE_WINS, WILD_CARD_SLOTS;
var init_intelligence_calculations = __esm({
  "server/api/intelligence-calculations.js"() {
    "use strict";
    init_shared();
    init_daily_provider_policy();
    MLB_BASE3 = "https://statsapi.mlb.com/api/v1";
    allTeamCache = /* @__PURE__ */ new Map();
    allTeamInFlight = /* @__PURE__ */ new Map();
    DAILY_STALE_MS = 7 * 24 * 60 * 6e4;
    SEASON_LENGTH = 162;
    REPLACEMENT_WIN_BASELINE = 48;
    PLAYOFF_MARGIN_SCALE_WINS = 4;
    WILD_CARD_SLOTS = 3;
  }
});

// server/_core/vite.ts
var vite_exports = {};
__export(vite_exports, {
  serveStatic: () => serveStatic,
  setupVite: () => setupVite
});
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path from "path";
async function setupVite(app, server) {
  const viteModulePath = "vite";
  const viteConfigModulePath = "../../vite.config";
  const [{ createServer: createViteServer }, { default: viteConfig }] = await Promise.all([
    import(viteModulePath),
    import(viteConfigModulePath)
  ]);
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path.resolve(import.meta.dirname, "../..", "dist", "public") : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
var init_vite = __esm({
  "server/_core/vite.ts"() {
    "use strict";
  }
});

// server/app.ts
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});

// server/db.ts
init_env();
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
init_env();
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none"
    });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
init_env();
function registerStorageProxy(app) {
  app.get("/manus-storage/*key", async (req, res) => {
    const key = req.params.key?.join("/");
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(
          `[StorageProxy] forge error: ${forgeResp.status} ${body}`
        );
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_llm();
import { z as z2 } from "zod";
var aiFallbackUntil = 0;
var AI_ROSTER_INSIGHTS_CACHE_TTL_MS = 3e4;
var aiRosterInsightsCache = /* @__PURE__ */ new Map();
var aiRosterInsightsInFlight = /* @__PURE__ */ new Map();
function buildRosterInsightsFallback(input) {
  const team = input.team || {};
  const strengths = [];
  const weaknesses = [];
  const pct = Number(team.pct);
  const runDiff = Number(team.diff ?? Number(team.rs) - Number(team.ra));
  const ops = Number(team.ops);
  const era = team.era != null && team.era !== "" && Number.isFinite(Number(team.era)) ? Number(team.era) : NaN;
  if (Number.isFinite(runDiff)) {
    (runDiff >= 0 ? strengths : weaknesses).push({
      title: runDiff >= 0 ? "Positive run differential" : "Negative run differential",
      detail: runDiff >= 0 ? "The supplied team totals show more runs scored than allowed." : "The supplied team totals show more runs allowed than scored.",
      evidence: `Run differential: ${runDiff > 0 ? "+" : ""}${runDiff}`
    });
  }
  if (Number.isFinite(ops)) {
    (ops >= 0.72 ? strengths : weaknesses).push({
      title: ops >= 0.72 ? "Offense is producing" : "Offense needs support",
      detail: "This status is derived only from the supplied team OPS value.",
      evidence: `Team OPS: ${ops.toFixed(3)}`
    });
  }
  if (Number.isFinite(era)) {
    (era <= 4 ? strengths : weaknesses).push({
      title: era <= 4 ? "Run prevention is controlled" : "Run prevention is a watch area",
      detail: "This status is derived only from the supplied team ERA value.",
      evidence: `Team ERA: ${era.toFixed(2)}`
    });
  }
  if (Number.isFinite(pct)) {
    (pct >= 0.5 ? strengths : weaknesses).push({
      title: pct >= 0.5 ? "Winning record" : "Record below .500",
      detail: "This status is derived only from the supplied standings record.",
      evidence: `Winning percentage: ${pct.toFixed(3)}`
    });
  }
  if (!strengths.length && !weaknesses.length)
    weaknesses.push({
      title: "Verified roster context is limited",
      detail: "No supplied aggregate team metric was available for a safe local summary.",
      evidence: "No verified team-level evidence supplied"
    });
  return {
    strengths,
    weaknesses,
    source: "Local verified roster fallback",
    fallback: true
  };
}
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  ai: router({
    rosterInsights: publicProcedure.input(
      z2.object({
        team: z2.record(z2.string(), z2.union([z2.string(), z2.number(), z2.null()])).default({}),
        roster: z2.object({
          hitting: z2.array(z2.record(z2.string(), z2.unknown())).default([]),
          pitching: z2.array(z2.record(z2.string(), z2.unknown())).default([])
        })
      })
    ).mutation(async ({ input }) => {
      const key = JSON.stringify(input);
      const cached = aiRosterInsightsCache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.data;
      if (cached) aiRosterInsightsCache.delete(key);
      const existing = aiRosterInsightsInFlight.get(key);
      if (existing) return existing;
      const request = (async () => {
        if (Date.now() < aiFallbackUntil)
          return buildRosterInsightsFallback(input);
        try {
          const response = await invokeLLM({
            model: "gpt-5-mini",
            messages: [
              {
                role: "system",
                content: "You are a baseball front-office analyst. Use only the supplied team and roster data. Never invent missing metrics. Return concise, evidence-based strengths and weaknesses for a scouting dashboard."
              },
              { role: "user", content: JSON.stringify(input) }
            ],
            maxTokens: 700,
            responseFormat: {
              type: "json_schema",
              json_schema: {
                name: "roster_insights",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    strengths: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          detail: { type: "string" },
                          evidence: { type: "string" }
                        },
                        required: ["title", "detail", "evidence"],
                        additionalProperties: false
                      }
                    },
                    weaknesses: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          detail: { type: "string" },
                          evidence: { type: "string" }
                        },
                        required: ["title", "detail", "evidence"],
                        additionalProperties: false
                      }
                    },
                    source: { type: "string" }
                  },
                  required: ["strengths", "weaknesses", "source"],
                  additionalProperties: false
                }
              }
            }
          });
          const content = response.choices[0]?.message?.content;
          if (typeof content !== "string")
            throw new Error("AI insights response was empty");
          return JSON.parse(content);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/usage exhausted|412 precondition/i.test(message))
            aiFallbackUntil = Date.now() + 10 * 6e4;
          console.warn(
            "[ai.rosterInsights] AI provider unavailable; returning verified local fallback",
            message
          );
          return buildRosterInsightsFallback(input);
        }
      })();
      aiRosterInsightsInFlight.set(key, request);
      try {
        const result = await request;
        aiRosterInsightsCache.set(key, {
          data: result,
          expiresAt: Date.now() + AI_ROSTER_INSIGHTS_CACHE_TTL_MS
        });
        if (aiRosterInsightsCache.size > 100)
          aiRosterInsightsCache.delete(
            aiRosterInsightsCache.keys().next().value
          );
        return result;
      } finally {
        if (aiRosterInsightsInFlight.get(key) === request)
          aiRosterInsightsInFlight.delete(key);
      }
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/api/routes.ts
function wrapLegacyHandler(handler12) {
  return (req, res, next) => {
    Promise.resolve(handler12(req, res)).catch(next);
  };
}
async function registerLegacyApiRoutes(app) {
  const modules = await Promise.all([
    // The migrated handlers are intentionally kept as JavaScript to preserve the original source.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_mlb(), mlb_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_ncaa(), ncaa_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_savant(), savant_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_feed(), feed_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_news(), news_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_contract(), contract_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_player_identity(), player_identity_exports)),
    // Server-side structured AI comparison summary; credentials stay inside invokeLLM.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_comparison_summary(), comparison_summary_exports)),
    // Natural-language search intent router; credentials stay inside invokeLLM.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_natural_search(), natural_search_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_team_financials(), team_financials_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_fangraphs_models(), fangraphs_models_exports)),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    Promise.resolve().then(() => (init_intelligence_calculations(), intelligence_calculations_exports))
  ]);
  const paths = [
    "/api/mlb",
    "/api/ncaa",
    "/api/savant",
    "/api/feed",
    "/api/news",
    "/api/contract",
    "/api/player-identity",
    "/api/comparison-summary",
    "/api/natural-search",
    "/api/team-financials",
    "/api/fangraphs-models",
    "/api/intelligence-calculations"
  ];
  paths.forEach((path2, index) => {
    app.all(path2, wrapLegacyHandler(modules[index].default));
  });
}
var legacyApiErrorHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected API proxy error";
  console.error("[legacy-api]", error);
  res.status(500).json({ error: message });
};

// server/api/scheduled-savant-refresh.ts
init_savant();
async function scheduledSavantRefresh(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only" });
    await warmSavantCache("2026");
    return res.json({ ok: true, refreshed: "savant", policy: "nightly-utc" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Savant nightly refresh failed";
    console.error("[scheduled-savant-refresh]", error);
    return res.status(500).json({ error: message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}

// server/app.ts
async function createApp({
  serveFrontend = false,
  viteServer
} = {}) {
  const app = express2();
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "skip-baseball-api" });
  });
  app.post("/api/scheduled/refresh-savant", scheduledSavantRefresh);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  await registerLegacyApiRoutes(app);
  app.use(legacyApiErrorHandler);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (serveFrontend) {
    if (!viteServer) {
      throw new Error(
        "A Vite HTTP server is required when serveFrontend is enabled"
      );
    }
    const { serveStatic: serveStatic2, setupVite: setupVite2 } = await Promise.resolve().then(() => (init_vite(), vite_exports));
    if (process.env.NODE_ENV === "development") {
      await setupVite2(app, viteServer);
    } else {
      serveStatic2(app);
    }
  }
  return app;
}

// server/vercel.ts
var appPromise = createApp();
function normalizeServerlessRequestUrl(req) {
  const rawUrl = req.url;
  if (!/^https?:\/\//i.test(rawUrl)) return;
  try {
    const parsed = new URL(rawUrl);
    req.url = `${parsed.pathname}${parsed.search}`;
  } catch {
  }
}
async function handler11(req, res) {
  normalizeServerlessRequestUrl(req);
  const app = await appPromise;
  return app(req, res);
}
export {
  handler11 as default,
  normalizeServerlessRequestUrl
};
