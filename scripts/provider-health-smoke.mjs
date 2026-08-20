import { fileURLToPath } from "node:url";

const CURRENT_SEASON = process.env.SKIP_RELEASE_SEASON || "2026";

function url(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

export const PROVIDER_PROBES = [
  {
    id: "mlb",
    critical: true,
    path: "/api/mlb?path=%2Fteams%2F119&hydrate=league,division,sport",
    accepts: body => Array.isArray(body?.teams),
  },
  {
    id: "savant",
    critical: true,
    path: `/api/savant?endpoint=expected_statistics&year=${CURRENT_SEASON}`,
    accepts: body => Array.isArray(body),
  },
  {
    id: "news",
    critical: false,
    path: "/api/news?league=mlb&limit=3",
    accepts: body =>
      Array.isArray(body?.items) && Array.isArray(body?.sourceStatuses),
  },
  {
    id: "fangraphs",
    critical: false,
    path: `/api/fangraphs-models?team=LAD&season=${CURRENT_SEASON}`,
    accepts: body => typeof body === "object" && body !== null,
  },
];

export function classifyProviderResult(
  probe,
  { status, body, headers = {}, error } = {}
) {
  const cache = headers["x-provider-cache"] || headers["x-proxy-cache"] || null;
  const freshness = headers["x-provider-freshness"] || body?.freshness || null;
  const accepted = Number(status) === 200 && probe.accepts(body);
  const providerBlocked = Boolean(body?.providerBlocked);
  const statusLabel = accepted ? "pass" : probe.critical ? "fail" : "degraded";
  return {
    provider: probe.id,
    critical: probe.critical,
    status: statusLabel,
    httpStatus: Number(status) || 0,
    cache,
    freshness,
    providerBlocked,
    detail: accepted
      ? "Valid response contract"
      : error ||
        body?.error ||
        (providerBlocked
          ? "Provider blocked upstream"
          : "Unexpected response contract"),
  };
}

export function summarizeProviderResults(results) {
  const failures = results.filter(result => result.status === "fail");
  const degraded = results.filter(result => result.status === "degraded");
  return {
    status: failures.length
      ? "fail"
      : degraded.length
        ? "pass-with-degraded-providers"
        : "pass",
    exitCode: failures.length ? 1 : 0,
    results,
  };
}

async function fetchProbe(baseUrl, probe, fetchImpl) {
  try {
    const response = await fetchImpl(url(baseUrl, probe.path), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return classifyProviderResult(probe, {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        error: "Response was not JSON",
      });
    }
    return classifyProviderResult(probe, {
      status: response.status,
      body,
      headers: Object.fromEntries(response.headers.entries()),
    });
  } catch (error) {
    return classifyProviderResult(probe, {
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runProviderHealth({
  baseUrl,
  fetchImpl = fetch,
  probes = PROVIDER_PROBES,
} = {}) {
  const normalizedBaseUrl = String(
    baseUrl || process.env.SKIP_RELEASE_BASE_URL || "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  const results = [];
  for (const probe of probes)
    results.push(await fetchProbe(normalizedBaseUrl, probe, fetchImpl));
  return {
    baseUrl: normalizedBaseUrl,
    checkedAt: new Date().toISOString(),
    ...summarizeProviderResults(results),
  };
}

export async function main() {
  const report = await runProviderHealth();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
