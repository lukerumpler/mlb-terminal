// api/savant.js — Vercel serverless function
// Returns JSON (parsed from Savant CSV) so the frontend can safely use response.json()

const https = require("https");

const ENDPOINTS = {
  expected_statistics: (y) =>
    `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${y}&position=&team=&min=1&csv=true`,
  statcast_leaderboard: (y) =>
    `https://baseballsavant.mlb.com/statcast_leaderboard?year=${y}&abs=0&player_type=batter&min_pa=1&csv=true`,
  "bat-tracking": (y) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking?attackZone=&batSide=&contactType=&count=&csv=true&handedness=&minSwings=1&minGroupSwings=1&pitchType=&seasonStart=${y}&seasonEnd=${y}&team=&type=batter`,
  sprint_speed: (y) =>
    `https://baseballsavant.mlb.com/sprint_speed_leaderboard?year=${y}&position=&team=&min=0&csv=true`,
  oaa: (y) =>
    `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Batter&year=${y}&team=&range=year&min=1&pos=&roles=&viz=Show&csv=true`,
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        Accept: "text/csv,*/*",
        Referer: "https://baseballsavant.mlb.com/",
      },
    };

    https
      .get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location).then(resolve).catch(reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      })
      .on("error", reject);
  });
}

// --- CSV parsing helpers ---
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvToJson(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").replace(/^\uFEFF/, ""));

  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      let v = (vals[i] ?? "").replace(/^"|"$/g, "");

      // normalize empty strings to null
      if (v === "") {
        obj[h] = null;
        return;
      }

      // coerce numbers when safe
      const num = Number(v);
      obj[h] = !Number.isNaN(num) && v.trim() !== "" ? num : v;
    });
    return obj;
  });
}

module.exports = async (req, res) => {
  const { endpoint, year } = req.query;
  const y = year || "2026";

  if (!endpoint || !ENDPOINTS[endpoint]) {
    res.status(400).json({ error: "Invalid endpoint. Use: " + Object.keys(ENDPOINTS).join(", ") });
    return;
  }

  const url = ENDPOINTS[endpoint](y);

  try {
    const result = await fetchUrl(url);

    // If Savant returns an HTML error page, return a helpful error
    const trimmed = (result.body || "").trim();
    if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
      res.status(502).json({
        error: "Upstream returned HTML (not CSV). Endpoint may be blocked or URL invalid.",
        sample: trimmed.slice(0, 200),
        upstreamStatus: result.status,
      });
      return;
    }

    const data = csvToJson(result.body);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(JSON.stringify(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};