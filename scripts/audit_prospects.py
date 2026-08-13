import json
import re
import urllib.request
from pathlib import Path

text = Path('/home/ubuntu/skip-baseball/client/src/constants/data.js').read_text()
blocks = []
for export_name in ('PROSPECT_BATTERS', 'PROSPECT_PITCHERS'):
    match = re.search(rf'export const {export_name} = \[(.*?)\n\];', text, re.S)
    if not match:
        raise SystemExit(f'missing {export_name}')
    blocks.append(match.group(1))

records = []
for block in blocks:
    for raw in re.findall(r'\{([^{}]+)\}', block):
        # The compact catalog uses simple quoted strings and numeric ids.
        def get_num(key):
            m = re.search(rf'\b{key}\s*:\s*(\d+)', raw)
            return int(m.group(1)) if m else None
        def get_str(key):
            m = re.search(rf"\b{key}\s*:\s*'([^']*)'", raw)
            return m.group(1) if m else None
        item = {'rank': get_num('rank'), 'mlbId': get_num('mlbId'), 'name': get_str('name'), 'team': get_str('team'), 'level': get_str('level'), 'pos': get_str('pos')}
        if item['mlbId'] and item['name']:
            records.append(item)

team_by_id = {}
try:
    data = json.load(urllib.request.urlopen('https://statsapi.mlb.com/api/v1/teams?sportId=1', timeout=20))
    for team in data.get('teams', []):
        team_by_id[team.get('abbreviation')] = team.get('id')
except Exception as exc:
    print(json.dumps({'error': f'team lookup failed: {exc}'}))

results = []
for item in records:
    try:
        url = f"https://statsapi.mlb.com/api/v1/people/{item['mlbId']}?hydrate=currentTeam"
        data = json.load(urllib.request.urlopen(url, timeout=20))
        person = (data.get('people') or [{}])[0]
        current = person.get('currentTeam') or {}
        results.append({
            **item,
            'apiName': person.get('fullName'),
            'apiTeam': current.get('abbreviation'),
            'apiTeamName': current.get('name'),
            'nameMatch': person.get('fullName') == item['name'],
            'teamMatch': current.get('abbreviation') in (None, item['team']),
            'status': 'ok',
        })
    except Exception as exc:
        results.append({**item, 'status': 'error', 'error': str(exc)})

print(json.dumps({'count': len(results), 'mismatches': [r for r in results if r.get('status') != 'ok' or not r.get('nameMatch') or not r.get('teamMatch')], 'results': results}, indent=2))
