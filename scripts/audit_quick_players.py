from __future__ import annotations

import json
import sys
from urllib.request import urlopen

PLAYERS = [
    {"id": 592450, "name": "Aaron Judge", "team": "NYY", "pos": "RF"},
    {"id": 660271, "name": "Shohei Ohtani", "team": "LAD", "pos": "TWP"},
    {"id": 665742, "name": "Juan Soto", "team": "NYM", "pos": "LF"},
    {"id": 683002, "name": "Gunnar Henderson", "team": "BAL", "pos": "SS"},
    {"id": 675911, "name": "Spencer Strider", "team": "ATL", "pos": "P"},
    {"id": 677951, "name": "Bobby Witt Jr.", "team": "KC", "pos": "SS"},
]

TEAM_ABBREVIATIONS = {
    "Los Angeles Dodgers": "LAD",
    "New York Yankees": "NYY",
    "New York Mets": "NYM",
    "Baltimore Orioles": "BAL",
    "Atlanta Braves": "ATL",
    "Kansas City Royals": "KC",
}


def fetch(player_id: int) -> dict:
    with urlopen(f"https://statsapi.mlb.com/api/v1/people/{player_id}?hydrate=currentTeam", timeout=20) as response:
        return json.load(response)["people"][0]


mismatches = []
for curated in PLAYERS:
    live = fetch(curated["id"])
    live_name = live.get("fullName")
    live_team = (live.get("currentTeam") or {}).get("name")
    live_pos = (live.get("primaryPosition") or {}).get("abbreviation")
    live_team_abbr = TEAM_ABBREVIATIONS.get(live_team)
    print(json.dumps({
        "id": curated["id"],
        "curated": curated,
        "live": {"name": live_name, "team": live_team, "teamAbbr": live_team_abbr, "position": live_pos},
    }))
    if live_name != curated["name"] or live_team_abbr != curated["team"] or live_pos != curated["pos"]:
        mismatches.append((curated, live_name, live_team, live_team_abbr, live_pos))

if mismatches:
    print("MISMATCHES", file=sys.stderr)
    for mismatch in mismatches:
        print(mismatch, file=sys.stderr)
    sys.exit(1)
print(f"OK {len(PLAYERS)} quick-access identities matched MLB person records")
