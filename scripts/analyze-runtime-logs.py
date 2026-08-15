import json
import re
from collections import Counter, defaultdict
from datetime import datetime

path = ".manus-logs/networkRequests.log"
counts = Counter()
errors = Counter()
by_minute = defaultdict(Counter)
rows = 0

with open(path, errors="ignore") as stream:
    for line in stream:
        match = re.search(r"\{.*\}", line)
        if not match:
            continue
        try:
            payload = json.loads(match.group())
        except json.JSONDecodeError:
            continue
        rows += 1
        url = payload.get("url") or payload.get("requestUrl") or payload.get("path") or "unknown"
        status = str(payload.get("status") or payload.get("statusCode") or "")
        timestamp = line[1:25] if line.startswith("[") else "unknown"
        minute = timestamp[:16]
        counts[url] += 1
        by_minute[minute][url] += 1
        if status.startswith(("4", "5")):
            errors[(status, url)] += 1

print(f"rows={rows}")
print("top_endpoints")
for url, count in counts.most_common(60):
    print(f"{count}\t{url}")
print("error_endpoints")
for (status, url), count in errors.most_common(60):
    print(f"{count}\t{status}\t{url}")
print("duplicate_bursts")
for minute, entries in sorted(by_minute.items()):
    for url, count in entries.items():
        if count >= 5:
            print(f"{minute}\t{count}\t{url}")
