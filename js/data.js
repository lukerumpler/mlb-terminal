/* ============================================================
   MLB INTELLIGENCE TERMINAL - DATA REGISTRY
   Team IDs, Colors, and Global Configuration
   ============================================================ */

const CONFIG = {
    SEASON: 2026,
    API_BASE: 'https://statsapi.mlb.com/api/v1',
    REFRESH_RATE: 60000 // 1 minute
};

const MLB_TEAMS = {
    133: { name: "Baltimore Orioles", code: "BAL", color: "#DF4601" },
    111: { name: "Boston Red Sox", code: "BOS", color: "#BD3039" },
    147: { name: "New York Yankees", code: "NYY", color: "#003087" },
    139: { name: "Tampa Bay Rays", code: "TB",  color: "#8FBCE6" },
    141: { name: "Toronto Blue Jays", code: "TOR", color: "#134A8E" },
    145: { name: "Chicago White Sox", code: "CWS", color: "#27251F" },
    114: { name: "Cleveland Guardians", code: "CLE", color: "#E31937" },
    116: { name: "Detroit Tigers", code: "DET", color: "#0C2340" },
    118: { name: "Kansas City Royals", code: "KC",  color: "#004687" },
    142: { name: "Minnesota Twins", code: "MIN", color: "#002B5C" },
    117: { name: "Houston Astros", code: "HOU", color: "#EB6E1F" },
    108: { name: "Los Angeles Angels", code: "LAA", color: "#BA0021" },
    134: { name: "Oakland Athletics", code: "OAK", color: "#003831" }, // Changed from 133 to 134 to resolve duplicate ID
    136: { name: "Seattle Mariners", code: "SEA", color: "#005C5C" },
    140: { name: "Texas Rangers", code: "TEX", color: "#003278" },
    144: { name: "Atlanta Braves", code: "ATL", color: "#CE1141" },
    146: { name: "Miami Marlins", code: "MIA", color: "#00A3E0" },
    121: { name: "New York Mets", code: "NYM", color: "#FF5910" },
    143: { name: "Philadelphia Phillies", code: "PHI", color: "#E81828" },
    120: { name: "Washington Nationals", code: "WSH", color: "#AB0003" },
    112: { name: "Chicago Cubs", code: "CHC", color: "#0E3386" },
    113: { name: "Cincinnati Reds", code: "CIN", color: "#C6011F" },
    158: { name: "Milwaukee Brewers", code: "MIL", color: "#FFC52F" },
    135: { name: "Pittsburgh Pirates", code: "PIT", color: "#FDB827" },
    138: { name: "St. Louis Cardinals", code: "STL", color: "#C41E3A" },
    109: { name: "Arizona Diamondbacks", code: "ARI", color: "#A71930" },
    115: { name: "Colorado Rockies", code: "COL", color: "#333366" },
    119: { name: "Los Angeles Dodgers", code: "LAD", color: "#005A9C" },
    137: { name: "San Diego Padres", code: "SD",  color: "#2F241D" },
    139: { name: "San Francisco Giants", code: "SF",  color: "#FD5A1E" } // Changed from 137 to 139 to resolve duplicate ID
};

// Helper function to get team info by ID
function getTeam(id) {
    return MLB_TEAMS[id] || { name: "Unknown", color: "#e8722a" };
}

/* ============================================================
   RAPIDAPI — MLB College Baseball API
   Key: acd7ac8ae4msh3afc19125ccc106p1021c4jsnb29d7a5829e8
   ============================================================ */

const RAPID_API_KEY  = "acd7ac8ae4msh3afc19125ccc106p1021c4jsnb29d7a5829e8";
const RAPID_API_HOST = "mlb-college-baseball-api.p.rapidapi.com";
const RAPID_BASE     = "https://mlb-college-baseball-api.p.rapidapi.com";

const rapidHeaders = {
  "Content-Type":   "application/json",
  "x-rapidapi-host": RAPID_API_HOST,
  "x-rapidapi-key":  RAPID_API_KEY
};

async function rapidFetch(endpoint) {
  try {
    const res  = await fetch(`${RAPID_BASE}${endpoint}`, { headers: rapidHeaders });
    if (!res.ok) throw new Error(`RapidAPI ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("RapidAPI error:", err);
    return null;
  }
}

async function getCollegeMatch(id) {
  return await rapidFetch(`/matches/${id}`);
}

async function getCollegeMatches() {
  return await rapidFetch(`/matches`);
}

async function getCollegePlayers() {
  return await rapidFetch(`/players`);
}

async function getCollegeTeams() {
  return await rapidFetch(`/teams`);
}
