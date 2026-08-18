export function summarizeRequestTrace(entries = []) {
  const summary = {
    total: entries.length,
    queued: 0,
    started: 0,
    localHits: 0,
    staleHits: 0,
    deduplicated: 0,
    aborted: 0,
    errors: 0,
    successes: 0,
    byPriority: {},
  };
  for (const entry of entries) {
    if (entry?.priority) summary.byPriority[entry.priority] = (summary.byPriority[entry.priority] || 0) + 1;
    if (entry?.event === 'queued') summary.queued += 1;
    if (entry?.event === 'started') summary.started += 1;
    if (entry?.event === 'local-hit') summary.localHits += 1;
    if (entry?.event === 'stale-hit') summary.staleHits += 1;
    if (entry?.event === 'deduplicated') summary.deduplicated += 1;
    if (entry?.event === 'aborted') summary.aborted += 1;
    if (entry?.event === 'transport-error') summary.errors += 1;
    if (entry?.event === 'success') summary.successes += 1;
  }
  return summary;
}
