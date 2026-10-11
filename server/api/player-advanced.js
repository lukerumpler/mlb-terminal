import { applyCors } from "./_shared.js";
import { currentMlbSeason } from "../season.ts";

const BASE_URL = "https://www.baseball-reference.com/search/search.fcgi";
const UA =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function cleanText(value = "") {
  return String(value)
    .replace(/<[^<>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number(
    String(value)
      .replace(/[\u2212\u2013\u2014\u2012]/g, "-")
      .replace(/[%+,]/g, "")
      .trim()
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseBaseballReferenceIdentity(html, targetName) {
  const target = normalizeName(targetName);
  if (!target) return null;
  // Linear on garbled pages: openers never run across another tag, and only text up
  // to the last </a> is searched (see upToLastClose in fangraphs-models.js).
  const linkPattern = new RegExp('<a[^<>]+href="(\\/players\\/[a-z]\\/[^" ]+\\.shtml)"[^<>]*>([\\s\\S]*?)<\\/a>', 'gi');
  let searchable = "";
  let lastClose = -1;
  for (const close of String(html).matchAll(/<\/a>/gi)) lastClose = close.index + close[0].length;
  if (lastClose > 0) searchable = String(html).slice(0, lastClose);
  let match;
  while ((match = linkPattern.exec(searchable)) !== null) {
    const displayName = cleanText(match[2]);
    if (normalizeName(displayName) !== target) continue;
    const path = match[1];
    const id = path.split('/').pop()?.replace(/\.shtml$/i, '') || null;
    if (!id) continue;
    return {
      id,
      name: displayName,
      url: `https://www.baseball-reference.com${path}`,
      confidence: 'exact',
      source: 'Baseball-Reference player identity',
    };
  }
  return null;
}

// A printed stat: optional minus (ASCII hyphen, Unicode minus, en/em dash) then digits.
const SIGNED_NUMBER = "[-\\u2212\\u2013\\u2014]?\\d+(?:\\.\\d+)?";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The summary prints a "<label> <this season> <career>" pair. Takes the first
// figure. `label` is literal text ("wRC+"), never a pattern: escaping it here is
// what keeps "+" from turning into "one or more backslashes".
function currentYearValue(text, label, season) {
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])${escapeRegExp(label)}(?![A-Za-z])\\s*(${SIGNED_NUMBER})\\s+(${SIGNED_NUMBER})`,
    "i"
  );
  const match = text.match(pattern); // `text` is already cleaned by the caller (once, not per label)
  if (!match) return null;
  const current = numeric(match[1]);
  return current == null ? null : { value: current, season };
}

// The player page summary shows the most recent season, so it can only honestly
// be labeled with that season. For any other requested season the figures are
// withheld rather than returned under the wrong year.
export function parseBaseballReferenceAdvanced(html, season, { currentSeason = currentMlbSeason() } = {}) {
  const base = { season, source: "Baseball-Reference player summary" };
  if (Number(season) !== Number(currentSeason)) {
    return {
      ...base,
      war: null,
      wrcPlus: null,
      status: "unavailable",
      note: "Baseball-Reference's player summary only covers the most recent season, so it is not used for other seasons.",
    };
  }
  const text = cleanText(html);
  const war = currentYearValue(text, "WAR", season);
  const wrcPlus = currentYearValue(text, "wRC+", season);
  return {
    ...base,
    war: war?.value ?? null,
    wrcPlus: wrcPlus?.value ?? null,
    status: war?.value != null || wrcPlus?.value != null ? "live" : "unavailable",
  };
}

export default async function playerAdvancedHandler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const name = String(req.query?.name || "").trim();
  const season = Number(req.query?.season || currentMlbSeason());
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
    const metrics = parseBaseballReferenceAdvanced(html, season);
    const identity = parseBaseballReferenceIdentity(html, name);
    return res.status(200).json({
      ...metrics,
      providerIds: identity ? { baseballReference: identity.id } : {},
      identity,
    });
  } catch {
    return res.status(502).json({ error: "Baseball-Reference player data is unavailable." });
  }
}
