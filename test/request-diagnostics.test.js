import { describe, expect, it } from 'vitest';
import { summarizeRequestTrace } from '../client/src/lib/requestDiagnostics.js';

describe('request diagnostics summary', () => {
  it('counts cache, queue, cancellation, error, and priority outcomes without mutating trace rows', () => {
    const trace = [
      { event:'queued', priority:'core' }, { event:'started', priority:'core' }, { event:'success', priority:'core' },
      { event:'local-hit', priority:'important' }, { event:'deduplicated', priority:'important' },
      { event:'stale-hit', priority:'optional' }, { event:'aborted', priority:'background' }, { event:'transport-error', priority:'optional' },
    ];
    expect(summarizeRequestTrace(trace)).toEqual(expect.objectContaining({
      total:8, queued:1, started:1, successes:1, localHits:1, deduplicated:1, staleHits:1, aborted:1, errors:1,
      byPriority:{ core:3, important:2, optional:2, background:1 },
    }));
    expect(trace).toHaveLength(8);
  });
});
