const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const UPSTREAM_TIMEOUT_MS = 15_000;

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const requestUrl = new URL(req.url, "https://vercel.invalid");
  const path = requestUrl.searchParams.get("path");
  if (!path || !path.startsWith("/") || path.includes("://")) {
    return res.status(400).json({ error: "Missing or invalid path parameter" });
  }

  const forwarded = new URLSearchParams(requestUrl.searchParams);
  forwarded.delete("path");
  const upstreamUrl = `${MLB_BASE}${path}${forwarded.toString() ? `?${forwarded}` : ""}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SKIP-Vercel-MLB-Proxy/1.0",
      },
      signal: controller.signal,
    });
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: "MLB upstream returned non-JSON data" };
    }
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=120"
    );
    return res.status(upstream.status).json(payload);
  } catch (error) {
    return res.status(502).json({
      error:
        error instanceof Error ? error.message : "MLB upstream request failed",
    });
  } finally {
    clearTimeout(timeout);
  }
}
