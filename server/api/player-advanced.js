import { applyCors } from "./_shared.js";
import { currentMlbSeason } from "../season.ts";
import { ANCHOR_CLOSE, upToLastClose } from "./html-scan.js";

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
  // We only search the part of the page that can still hold a link, so a garbled page cannot slow us down (see html-scan.js)
  const linkPattern = new RegExp('<a[^<>]+href="(\\/players\\/[a-z]\\/[^" ]+\\.shtml)"[^<>]*>([\\s\\S]*?)<\\/a>', 'gi');
  const searchable = upToLastClose(html, ANCHOR_CLOSE);
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

// One printed number: an optional minus sign (a hyphen, a real minus sign, or an en or em dash) followed by digits and an optional decimal part
const SIGNED_NUMBER = "[-\\u2212\\u2013\\u2014]?\\d+(?:\\.\\d+)?";

function escapeRegExp(value) {
  /*
  Our "escapeRegExp" is a function that makes plain text safe to put inside a pattern. When we give it:
                  plain text like "wRC+"
  it returns to us:
                  the same text with every special character (like +) marked as ordinary, so the pattern matches the text itself
  */
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentYearValue(text, label, season) {
  /*
  Our "currentYearValue" is a function that reads one stat off the player summary. When we give it:
                  the cleaned page text, the stat's label ("WAR" or "wRC+"), and the season
  it returns to us:
                  the first number after the label (this season's value) together with its season, or null if there is none
  The summary prints each stat as "label this-season career", so we only accept a label followed by two numbers.
  The label is plain text and never a pattern. We escape it so the "+" in "wRC+" is not read as "one or more of the
  letter before it", which is the mistake that kept wRC+ from ever being found.
  */
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])${escapeRegExp(label)}(?![A-Za-z])\\s*(${SIGNED_NUMBER})\\s+(${SIGNED_NUMBER})`,
    "i"
  );
  const match = text.match(pattern);                                             // The caller already cleaned the page, once for the whole page and not once per label
  if (!match) return null;
  const current = numeric(match[1]);
  return current == null ? null : { value: current, season };
}

export function parseBaseballReferenceAdvanced(html, season, { currentSeason = currentMlbSeason() } = {}) {
  /*
  Our "parseBaseballReferenceAdvanced" is a function that reads a player's WAR and wRC+ off a Baseball-Reference page. When we give it:
                  the page text, the season we want, and (for tests) which season counts as the current one
  it returns to us:
                  the numbers and where they came from. The page only shows the most recent season, so for any other
                  season we hold the numbers back (null) instead of showing them under the wrong year
  */
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
