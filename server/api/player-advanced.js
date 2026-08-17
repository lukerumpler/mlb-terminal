import { applyCors } from "./_shared.js";

const BASE_URL = "https://www.baseball-reference.com/search/search.fcgi";
const UA =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[%+,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function currentYearValue(html, label, season) {
  const escapedLabel = label.replace(/[+]/g, "\\+");
  const pattern = new RegExp(
    `(?:${escapedLabel})\\s*([0-9]+(?:\\.[0-9]+)?)\\s+([0-9]+(?:\\.[0-9]+)?)`,
    "i"
  );
  const match = cleanText(html).match(pattern);
  if (!match) return null;
  const current = numeric(match[1]);
  return current == null ? null : { value: current, season };
}

export function parseBaseballReferenceAdvanced(html, season) {
  const text = cleanText(html);
  const war = currentYearValue(text, "WAR", season);
  const wrcPlus = currentYearValue(text, "wRC\\+", season);
  return {
    season,
    war: war?.value ?? null,
    wrcPlus: wrcPlus?.value ?? null,
    source: "Baseball-Reference player summary",
    status: war?.value != null || wrcPlus?.value != null ? "live" : "unavailable",
  };
}

export default async function playerAdvancedHandler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const name = String(req.query?.name || "").trim();
  const season = Number(req.query?.season || new Date().getUTCFullYear());
  if (!name || !Number.isInteger(season) || season < 1900 || season > 2100) {
    return res.status(400).json({ error: "A valid player name and season are required." });
  }
  try {
    const url = `${BASE_URL}?search=${encodeURIComponent(name)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return res.status(response.status).json({ error: `Baseball-Reference returned ${response.status}` });
    const html = await response.text();
    return res.status(200).json(parseBaseballReferenceAdvanced(html, season));
  } catch {
    return res.status(502).json({ error: "Baseball-Reference player data is unavailable." });
  }
}
